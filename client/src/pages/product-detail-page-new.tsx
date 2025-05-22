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
import { Star, Heart, Minus, Plus, MessageSquare, Info, Check, ThumbsUp, ThumbsDown } from "lucide-react";
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
        title: "Error",
        description: "Failed to record your vote. Please try again.",
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
      setLocalVotes((current) => (current !== null && current > 0 ? current - 1 : 0));
      setVotesChanged(true);
      toast({
        title: "Vote recorded",
        description: "Thank you for your feedback!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to record your vote. Please try again.",
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="w-full h-64 bg-gray-100 animate-pulse rounded-lg"></div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <h2 className="text-2xl font-bold text-gray-800">Product not found</h2>
            <p className="text-gray-600 mt-2">The product you're looking for doesn't exist or has been removed.</p>
            <Button className="mt-6" asChild>
              <Link href="/products">Back to Products</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const images = product.images?.map(img => img.imageUrl) || [];
  if (product.imageUrl && (!images.length || !images.includes(product.imageUrl))) {
    images.unshift(product.imageUrl);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/products" className="text-purple-600 hover:underline flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Products
          </Link>
        </div>
        
        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Product image gallery */}
            <div>
              <div className="bg-gray-50 rounded-lg overflow-hidden border border-gray-100 relative">
                {images.length > 0 ? (
                  <img 
                    src={images[currentImageIndex]} 
                    alt={product.name} 
                    className="w-full h-[400px] object-contain"
                  />
                ) : (
                  <div className="w-full h-[400px] bg-gray-100 flex items-center justify-center">
                    <span className="text-gray-400">No image available</span>
                  </div>
                )}
                
                {product.isFeatured && (
                  <div className="absolute top-4 left-4">
                    <Badge variant="secondary" className="bg-purple-100 text-purple-800 hover:bg-purple-200">
                      Featured
                    </Badge>
                  </div>
                )}
              </div>
              
              {images.length > 1 && (
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {images.map((imageUrl, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`rounded-md overflow-hidden border-2 ${index === currentImageIndex ? 'border-purple-500' : 'border-gray-100'}`}
                    >
                      <img 
                        src={imageUrl} 
                        alt={`${product.name} thumbnail ${index + 1}`} 
                        className="w-full h-16 object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Product details */}
            <div>
              <div>
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
                  {product.description}
                </p>
                
                <div className="mt-6 bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">About the voting system:</h4>
                  <p className="text-sm mb-3">
                    Our community-driven voting system helps highlight the most popular products on BidScents.
                    Your vote contributes to product visibility and helps other buyers make informed decisions.
                  </p>
                  <p className="text-sm">
                    Upvote products you love or recommend, and downvote products that didn't meet your expectations.
                    Votes are used to determine product popularity and may affect search rankings.
                  </p>
                </div>
              </TabsContent>
              
              <TabsContent value="details" className="p-6 bg-white rounded-lg shadow mt-6">
                <h3 className="font-playfair text-xl font-semibold mb-4">Product Details</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                  <div>
                    <h4 className="font-medium mb-1">Year of Purchase:</h4>
                    <p className="text-gray-600">{product.purchaseYear || "Unknown"}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Remaining Perfume:</h4>
                    <p className="text-gray-600">{product.remainingPercentage || 100}%</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Box Condition:</h4>
                    <p className="text-gray-600">{product.boxCondition || "No Box"}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Batch Code:</h4>
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
            </Tabs>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}