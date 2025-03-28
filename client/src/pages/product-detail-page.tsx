import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ProductWithDetails, Review, InsertReview } from "@shared/schema";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Star, StarHalf, Heart, Minus, Plus, ShoppingBag, Info, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Define review form schema
const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().min(10, { message: "Comment must be at least 10 characters" }),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

export default function ProductDetailPage() {
  const [, params] = useRoute("/products/:id");
  const productId = params?.id ? parseInt(params.id) : 0;
  const { user, setCartCount } = useAuth();
  const { toast } = useToast();
  
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState("50ml");
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [activeTab, setActiveTab] = useState("description");
  const [selectedRating, setSelectedRating] = useState(0);

  // Fetch product details
  const { data: product, isLoading } = useQuery<ProductWithDetails>({
    queryKey: [`/api/products/${productId}`],
    enabled: !!productId,
  });

  // Fetch product reviews
  const { data: reviews, refetch: refetchReviews } = useQuery<Review[]>({
    queryKey: [`/api/products/${productId}/reviews`],
    enabled: !!productId,
  });

  // Review form
  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      rating: 5,
      comment: "",
    },
  });

  // Add review mutation
  const addReviewMutation = useMutation({
    mutationFn: async (review: InsertReview) => {
      const res = await apiRequest("POST", "/api/reviews", review);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Review submitted",
        description: "Thank you for your feedback!",
      });
      refetchReviews();
      form.reset();
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}`] });
    },
    onError: (error) => {
      toast({
        title: "Error submitting review",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle quantity change
  const handleQuantityChange = (change: number) => {
    const newQuantity = quantity + change;
    if (newQuantity >= 1) {
      setQuantity(newQuantity);
    }
  };

  // Function to render star ratings
  const renderStars = (rating: number | undefined) => {
    if (!rating) rating = 0;
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    // Add full stars
    for (let i = 0; i < fullStars; i++) {
      stars.push(<Star key={`star-${i}`} className="fill-gold text-gold" />);
    }

    // Add half star if needed
    if (hasHalfStar) {
      stars.push(<StarHalf key="half-star" className="fill-gold text-gold" />);
    }

    // Add empty stars to make total of 5
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<Star key={`empty-${i}`} className="text-gold" />);
    }

    return stars;
  };

  // Handle add to cart
  const handleAddToCart = async () => {
    if (!user) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to add items to your cart",
        variant: "destructive",
      });
      return;
    }

    if (!product) return;

    setIsAddingToCart(true);
    try {
      await apiRequest("POST", "/api/cart", {
        productId: product.id,
        quantity: quantity,
      });
      
      toast({
        title: "Added to cart",
        description: `${product.name} has been added to your cart`,
      });
      
      // Refetch cart items to update count
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      
      // Get updated cart count
      const response = await fetch("/api/cart", {
        credentials: "include",
      });
      
      if (response.ok) {
        const cartItems = await response.json();
        setCartCount(cartItems.length);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add item to cart",
        variant: "destructive",
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  // Handle review submission
  const onSubmitReview = (data: ReviewFormValues) => {
    if (!user || !product) return;
    
    const reviewData: InsertReview = {
      userId: user.id,
      productId: product.id,
      rating: data.rating,
      comment: data.comment,
    };
    
    addReviewMutation.mutate(reviewData);
  };
  
  // Check if user already reviewed this product
  const hasUserReviewed = user && reviews?.some(review => review.userId === user.id);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-grow flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold"></div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-playfair mb-4">Product Not Found</h2>
            <p className="text-gray-600 mb-6">The product you're looking for doesn't exist or has been removed.</p>
            <Button asChild>
              <a href="/products">Browse Products</a>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow">
        <div className="container mx-auto px-6 py-12">
          {/* Breadcrumbs */}
          <div className="mb-8 text-sm text-gray-500">
            <a href="/" className="hover:text-gold">Home</a> {" / "}
            <a href="/products" className="hover:text-gold">Products</a> {" / "}
            <span>{product.name}</span>
          </div>
          
          {/* Product detail */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left: Product image */}
            <div>
              <div className="rounded-lg overflow-hidden bg-gray-50">
                <img 
                  src={product.imageUrl} 
                  alt={product.name} 
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
            
            {/* Right: Product info */}
            <div>
              <div className="mb-4">
                {/* Condition badge */}
                <div className="mb-2">
                  {product.isNew ? (
                    <Badge className="bg-gray-800 text-white">Like New</Badge>
                  ) : (
                    <Badge className="bg-blue-100 text-blue-800">{product.remainingPercentage || 100}% Full</Badge>
                  )}
                  
                  {/* Listing type badge */}
                  <Badge className="bg-gold text-rich-black ml-2">
                    {product.listingType === "auction" ? "Auction" : 
                     product.listingType === "negotiable" ? "Negotiable" : "Fixed Price"}
                  </Badge>
                </div>
                
                <div className="text-gray-500 mb-1">
                  {product.brand}
                </div>
                <div className="flex items-center mb-2">
                  {product.volume && (
                    <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium mr-2">
                      {product.volume}
                    </span>
                  )}
                </div>
                <h1 className="font-playfair text-2xl md:text-3xl font-bold mb-3">{product.name}</h1>
                
                <div className="flex items-center mb-3">
                  <div className="flex">
                    {renderStars(product.averageRating)}
                  </div>
                  <span className="text-sm text-gray-500 ml-2">
                    ({product.reviews?.length || 0} reviews)
                  </span>
                </div>
                
                {/* Seller information */}
                <div className="flex items-center mb-4 text-sm bg-gray-50 p-3 rounded-md">
                  <div className="flex-1">
                    <p className="font-medium">Seller: {product.seller?.username}</p>
                    <p className="text-gray-500 text-xs">Trusted Seller</p>
                  </div>
                  <Button variant="outline" className="text-xs h-8" asChild>
                    <a href={`/profile/${product.seller?.id}`}>View Profile</a>
                  </Button>
                </div>
                
                <div className="text-2xl font-semibold mb-4">RM {product.price.toFixed(2)}</div>
                
                <div className="bg-gray-50 p-4 rounded-md mb-6">
                  <h3 className="font-medium mb-2 text-sm">Item Details:</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {product.volume && (
                      <div className="flex items-center col-span-2 bg-gray-100 p-2 rounded mb-2">
                        <span className="text-gray-700 mr-2 font-medium">Size:</span>
                        <span className="text-black font-bold">{product.volume}</span>
                      </div>
                    )}
                    <div className="flex items-center">
                      <span className="text-gray-600 mr-2">Bottle:</span>
                      <span className="font-medium">{product.remainingPercentage || 100}% Full</span>
                    </div>
                    {product.purchaseYear && (
                      <div className="flex items-center">
                        <span className="text-gray-600 mr-2">Year:</span>
                        <span className="font-medium">{product.purchaseYear}</span>
                      </div>
                    )}
                    {product.boxCondition && (
                      <div className="flex items-center">
                        <span className="text-gray-600 mr-2">Box:</span>
                        <span className="font-medium">{product.boxCondition}</span>
                      </div>
                    )}
                    {product.batchCode && (
                      <div className="flex items-center">
                        <span className="text-gray-600 mr-2">Batch:</span>
                        <span className="font-medium">{product.batchCode}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <p className="text-gray-600 mb-6">
                  {product.description}
                </p>
              </div>
              
              {/* Quantity and add to cart */}
              <div className="flex flex-col sm:flex-row items-stretch gap-4 mb-8">
                <div className="flex border rounded h-12">
                  <Button 
                    variant="ghost" 
                    className="px-3" 
                    onClick={() => handleQuantityChange(-1)}
                    disabled={quantity <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <input 
                    type="text" 
                    value={quantity} 
                    readOnly 
                    className="w-12 text-center flex-1"
                  />
                  <Button 
                    variant="ghost" 
                    className="px-3" 
                    onClick={() => handleQuantityChange(1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                
                <Button 
                  className="bg-rich-black text-white hover:bg-metallic-gold hover:text-rich-black h-12 flex-grow"
                  onClick={handleAddToCart}
                  disabled={isAddingToCart}
                >
                  {isAddingToCart ? (
                    <span className="flex items-center">
                      <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-white rounded-full"></span>
                      Adding...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <ShoppingBag className="mr-2 h-5 w-5" />
                      Add to Cart
                    </span>
                  )}
                </Button>
                
                <Button 
                  variant="outline" 
                  className="border-rich-black text-rich-black hover:bg-rich-black hover:text-white h-12 px-4"
                >
                  <Heart className="h-5 w-5" />
                </Button>
              </div>
              
              {/* Product meta */}
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-start">
                  <Info className="h-4 w-4 mr-2 mt-0.5" />
                  <div>
                    <span className="font-medium">Category:</span> {product.category?.name}
                  </div>
                </div>
                <div className="flex items-start">
                  <Info className="h-4 w-4 mr-2 mt-0.5" />
                  <div>
                    <span className="font-medium">Brand:</span> {product.brand}
                  </div>
                </div>
                <div className="flex items-start">
                  <Info className="h-4 w-4 mr-2 mt-0.5" />
                  <div>
                    <span className="font-medium">Availability:</span> {product.stockQuantity > 0 ? (
                      <span className="text-green-600">In Stock ({product.stockQuantity} available)</span>
                    ) : (
                      <span className="text-red-600">Out of Stock</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Product details tabs */}
          <div className="mt-16">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="description">Description</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="reviews">
                  Reviews ({product.reviews?.length || 0})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="description" className="p-6 bg-white rounded-lg shadow mt-6">
                <h3 className="font-playfair text-xl font-semibold mb-4">About {product.name}</h3>
                <p className="text-gray-600 mb-6">
                  {product.description || "No description available for this product."}
                </p>
                <div className="mb-6">
                  <h4 className="font-medium mb-2">Key Notes:</h4>
                  <div className="flex flex-wrap gap-2">
                    <span className="bg-gray-100 px-3 py-1 rounded-full text-sm">Bergamot</span>
                    <span className="bg-gray-100 px-3 py-1 rounded-full text-sm">Jasmine</span>
                    <span className="bg-gray-100 px-3 py-1 rounded-full text-sm">Amber</span>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="details" className="p-6 bg-white rounded-lg shadow mt-6">
                <h3 className="font-playfair text-xl font-semibold mb-4">Pre-owned Details</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-1">Original Purchase:</h4>
                    <p className="text-gray-600">{product.purchaseYear || "Unknown"}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Bottle Condition:</h4>
                    <p className="text-gray-600">{product.remainingPercentage || 100}% Full</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Box Condition:</h4>
                    <p className="text-gray-600">{product.boxCondition || "Not specified"}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Authenticity:</h4>
                    <p className="text-gray-600">
                      {product.batchCode ? (
                        <span className="flex items-center text-green-600">
                          <Check className="h-4 w-4 mr-1" /> Verified (Batch Code: {product.batchCode})
                        </span>
                      ) : (
                        "No batch code provided"
                      )}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Listing Type:</h4>
                    <p className="text-gray-600">
                      {product.listingType === "auction" ? "Auction" : 
                       product.listingType === "negotiable" ? "Negotiable Price" : "Fixed Price"}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Volume:</h4>
                    <p className="text-gray-600">{product.volume || "Not specified"}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Concentration:</h4>
                    <p className="text-gray-600">Eau de Parfum</p>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="reviews" className="p-6 bg-white rounded-lg shadow mt-6">
                <h3 className="font-playfair text-xl font-semibold mb-4">Customer Reviews</h3>
                
                {/* Reviews list */}
                {reviews && reviews.length > 0 ? (
                  <div className="space-y-6 mb-8">
                    {reviews.map((review) => (
                      <div key={review.id} className="border-b pb-6">
                        <div className="flex justify-between mb-2">
                          <div className="flex">
                            {renderStars(review.rating)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(review.createdAt || "").toLocaleDateString()}
                          </div>
                        </div>
                        <p className="text-gray-600 mb-2">{review.comment}</p>
                        <div className="text-sm text-gray-500">
                          By: {review.userId === user?.id ? "You" : "Verified Buyer"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 mb-8">
                    <p className="text-gray-600">No reviews yet. Be the first to leave a review!</p>
                  </div>
                )}
                
                <Separator className="my-8" />
                
                {/* Review form */}
                {user ? (
                  hasUserReviewed ? (
                    <div className="bg-gray-50 p-6 rounded-lg">
                      <div className="flex items-center text-green-600 mb-2">
                        <Check className="h-5 w-5 mr-2" />
                        <span className="font-medium">You've already reviewed this product</span>
                      </div>
                      <p className="text-gray-600">Thank you for your feedback!</p>
                    </div>
                  ) : (
                    <div>
                      <h4 className="font-playfair text-lg font-semibold mb-4">Write a Review</h4>
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmitReview)} className="space-y-6">
                          <FormField
                            control={form.control}
                            name="rating"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Your Rating</FormLabel>
                                <FormControl>
                                  <div className="flex">
                                    {[1, 2, 3, 4, 5].map((rating) => (
                                      <button
                                        key={rating}
                                        type="button"
                                        onClick={() => {
                                          field.onChange(rating);
                                          setSelectedRating(rating);
                                        }}
                                        className="p-1"
                                      >
                                        <Star 
                                          className={`h-6 w-6 ${selectedRating >= rating ? 'fill-gold text-gold' : 'text-gray-300'}`} 
                                        />
                                      </button>
                                    ))}
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="comment"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Your Review</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Share your experience with this product..."
                                    className="resize-none h-32"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <Button 
                            type="submit" 
                            className="bg-gold text-rich-black hover:bg-metallic-gold"
                            disabled={addReviewMutation.isPending}
                          >
                            {addReviewMutation.isPending ? (
                              <span className="flex items-center">
                                <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-rich-black rounded-full"></span>
                                Submitting...
                              </span>
                            ) : (
                              "Submit Review"
                            )}
                          </Button>
                        </form>
                      </Form>
                    </div>
                  )
                ) : (
                  <div className="bg-gray-50 p-6 rounded-lg text-center">
                    <p className="text-gray-600 mb-4">Please sign in to leave a review</p>
                    <Button asChild className="bg-gold text-rich-black hover:bg-metallic-gold">
                      <a href="/auth">Sign In</a>
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
