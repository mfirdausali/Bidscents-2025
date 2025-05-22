import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ProductWithDetails } from "@shared/schema";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContactSellerButton } from "@/components/ui/contact-seller-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Star, StarHalf, Heart, Minus, Plus, MessageSquare, Info, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";

export default function ProductDetailPage() {
  const [, params] = useRoute("/products/:id");
  const productId = params?.id ? parseInt(params.id) : 0;
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState("50ml");
  const [activeTab, setActiveTab] = useState("description");

  // State for current displayed image
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  // Local vote state with buffer for optimistic UI updates
  const [localVotes, setLocalVotes] = useState<number | null>(null);
  const [votesChanged, setVotesChanged] = useState(false);

  // Fetch product details
  const { data: product, isLoading } = useQuery<ProductWithDetails>({
    queryKey: [`/api/products/${productId}`],
    enabled: !!productId,
    onSuccess: (data) => {
      // Initialize local votes from product data
      if (localVotes === null) {
        setLocalVotes(data.votes || 0);
      }
    }
  });
  
  // No longer need to fetch reviews since we're using votes instead
  
  // Use effect to send buffered votes to server when user leaves page
  useEffect(() => {
    return () => {
      // This runs when component unmounts
      if (votesChanged && product) {
        console.log("Sending buffered votes to server on page exit");
        
        // Send the final vote count to the server
        if (localVotes !== null) {
          const finalVoteCount = localVotes;
          const originalVotes = product.votes || 0;
          
          if (finalVoteCount > originalVotes) {
            // If the final vote count is higher, send upvotes for the difference
            for (let i = 0; i < finalVoteCount - originalVotes; i++) {
              fetch(`/api/products/${productId}/upvote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" }
              }).catch(err => console.error("Error sending buffered upvote:", err));
            }
          } else if (finalVoteCount < originalVotes) {
            // If the final vote count is lower, send downvotes for the difference
            for (let i = 0; i < originalVotes - finalVoteCount; i++) {
              fetch(`/api/products/${productId}/downvote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" }
              }).catch(err => console.error("Error sending buffered downvote:", err));
            }
          }
        }
      }
    };
  }, [votesChanged, productId, localVotes, product]);

  // Upvote mutation
  const upvoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/products/${productId}/upvote`);
      return await res.json();
    },
    onSuccess: () => {
      // Update local vote count for instant feedback
      setLocalVotes((current) => (current !== null ? current + 1 : 1));
      setVotesChanged(true);
      toast({
        title: "Vote recorded",
        description: "Thank you for your feedback!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error recording vote",
        description: "Failed to upvote. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Downvote mutation
  const downvoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/products/${productId}/downvote`);
      return await res.json();
    },
    onSuccess: () => {
      // Update local vote count for instant feedback
      setLocalVotes((current) => (current !== null ? Math.max(0, current - 1) : 0));
      setVotesChanged(true);
      toast({
        title: "Vote recorded",
        description: "Thank you for your feedback!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error recording vote",
        description: "Failed to downvote. Please try again.",
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

  // No longer needed since we're now using votes instead of star ratings



  // No longer needed - replaced by voting system

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
              <div className="rounded-lg overflow-hidden bg-gray-50 mb-4">
                <img 
                  src={product.images && product.images.length > 0 
                    ? `/api/images/${product.images[currentImageIndex]?.imageUrl}` 
                    : `/api/images/${product.imageUrl}`} 
                  alt={product.name} 
                  className="w-full h-auto object-cover max-h-[500px]"
                />
              </div>
              
              {/* Image thumbnails */}
              {product.images && product.images.length > 0 && (
                <div className="flex space-x-2 mt-4 overflow-x-auto">
                  {product.images.map((image, index) => (
                    <div 
                      key={image.id} 
                      className={`w-16 h-16 rounded-md overflow-hidden cursor-pointer border-2 ${
                        currentImageIndex === index ? 'border-gold' : 'border-transparent'
                      }`}
                      onClick={() => setCurrentImageIndex(index)}
                    >
                      <img 
                        src={`/api/images/${image.imageUrl}`} 
                        alt={`${product.name} - Image ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
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
                  <Badge className="bg-gold bg-gray-100 text-rich-black ml-2">
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
                  <div className="flex items-center">
                    <ThumbsUp className="h-4 w-4 text-purple-600 mr-1" />
                    <span className="text-sm text-gray-500">
                      {product?.votes || 0} votes
                    </span>
                  </div>
                </div>
                
                {/* Seller information */}
                <div className="flex items-center mb-4 text-sm bg-gray-50 p-3 rounded-md">
                  <div className="flex-1">
                    <p className="font-medium">Seller: {product.seller?.username}</p>
                    <p className="text-gray-500 text-xs">Trusted Seller</p>
                  </div>
                  <div className="flex gap-2">
                    <ContactSellerButton 
                      sellerId={product.sellerId}
                      sellerName={product.seller?.username || 'Seller'}
                      sellerImage={product.seller?.profileImage || null}
                      productId={product.id}
                      productName={product.name}
                      size="sm"
                      variant="secondary"
                    />
                    <Button variant="outline" className="text-xs h-8" asChild>
                      <Link href={`/sellers/${product.seller?.id}`}>View Seller</Link>
                    </Button>
                  </div>
                </div>
                
                <div className="text-2xl font-semibold mb-4">RM {product.price.toFixed(2)}</div>
                
                <div className="bg-gray-50 p-4 rounded-md mb-6">
                  <h3 className="font-medium mb-2 text-sm">Item Details:</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
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
              
              {/* Voting controls */}
              <div className="flex flex-col sm:flex-row items-stretch gap-4 mb-8">
                <div className="flex items-center border rounded h-12 px-3 gap-3">
                  <div className="font-medium">{localVotes !== null ? localVotes : (product?.votes || 0)} votes</div>
                  <div className="flex items-center gap-2">
                    <Button 
                      onClick={() => upvoteMutation.mutate()}
                      disabled={upvoteMutation.isPending || !user}
                      variant="ghost" 
                      size="sm"
                      className="h-8 px-2 hover:bg-green-50 hover:text-green-600"
                    >
                      <ThumbsUp className="h-4 w-4 mr-1" />
                      <span className="text-xs">Upvote</span>
                    </Button>
                    
                    <Button 
                      onClick={() => downvoteMutation.mutate()}
                      disabled={downvoteMutation.isPending || !user || (localVotes !== null && localVotes <= 0)}
                      variant="ghost" 
                      size="sm"
                      className="h-8 px-2 hover:bg-red-50 hover:text-red-600"
                    >
                      <ThumbsDown className="h-4 w-4 mr-1" />
                      <span className="text-xs">Downvote</span>
                    </Button>
                  </div>
                  
                  {votesChanged && (
                    <div className="text-green-600 text-xs flex items-center ml-1">
                      <Check className="h-3 w-3 mr-1" />
                      <span>Saved</span>
                    </div>
                  )}
                </div>
                
                <ContactSellerButton 
                  className="h-12 flex-grow shadow-sm"
                  sellerId={product.sellerId}
                  sellerName={product.seller?.username || 'Seller'}
                  sellerImage={product.seller?.profileImage || null}
                  productId={product.id}
                  productName={product.name}
                  variant="default"
                />
                
                <Button 
                  variant="outline" 
                  className="border-purple-600 text-purple-600 hover:bg-purple-100 h-12 px-4"
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
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="description">Description</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
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
                <h3 className="font-playfair text-xl font-semibold mb-4">Product Rating</h3>
                
                <Card className="p-6 bg-gray-50 shadow-sm">
                  <div className="flex flex-col items-center">
                    <div className="text-3xl font-bold mb-2">{localVotes !== null ? localVotes : (product?.votes || 0)}</div>
                    <div className="text-gray-500 mb-6">Total votes</div>
                    
                    <div className="flex gap-4">
                      <Button 
                        onClick={() => upvoteMutation.mutate()}
                        disabled={upvoteMutation.isPending || !user}
                        variant="outline" 
                        className="flex items-center gap-2 hover:bg-green-50 hover:text-green-600 hover:border-green-200"
                      >
                        <ThumbsUp className="h-5 w-5" />
                        <span>Upvote</span>
                      </Button>
                      
                      <Button 
                        onClick={() => downvoteMutation.mutate()}
                        disabled={downvoteMutation.isPending || !user || (localVotes !== null && localVotes <= 0)}
                        variant="outline" 
                        className="flex items-center gap-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                      >
                        <ThumbsDown className="h-5 w-5" />
                        <span>Downvote</span>
                      </Button>
                    </div>
                    
                    {!user && (
                      <div className="mt-6 text-center text-gray-600">
                        <p className="mb-2">Please log in to vote on this product</p>
                        <Button className="bg-purple-600 hover:bg-purple-700 text-white" asChild>
                          <Link href="/login">Login</Link>
                        </Button>
                      </div>
                    )}
                    
                    {votesChanged && (
                      <div className="mt-4 text-green-600 text-sm flex items-center">
                        <Check className="h-4 w-4 mr-1" />
                        <span>Your vote has been recorded</span>
                      </div>
                    )}
                  </div>
                </Card>
                
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
                                          className={`h-6 w-6 ${selectedRating >= rating ? 'fill-purple-600 text-purple-600' : 'text-gray-300'}`} 
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
                            className="bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                            disabled={addReviewMutation.isPending}
                          >
                            {addReviewMutation.isPending ? (
                              <span className="flex items-center">
                                <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-white rounded-full"></span>
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
                    <Button asChild className="bg-purple-600 text-white hover:bg-purple-700 shadow-sm">
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
