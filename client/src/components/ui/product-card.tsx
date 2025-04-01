import { useState } from "react";
import { Link } from "wouter";
import { ProductWithDetails } from "@shared/schema";
import { Button } from "./button";
import { Heart, Star, StarHalf } from "lucide-react";
import { Badge } from "./badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface ProductCardProps {
  product: ProductWithDetails;
}

export function ProductCard({ product }: ProductCardProps) {
  const { user, setCartCount } = useAuth();
  const { toast } = useToast();
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  // Function to render star ratings
  const renderStars = (rating: number | undefined) => {
    if (!rating) rating = 0;
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    // Add full stars
    for (let i = 0; i < fullStars; i++) {
      stars.push(<Star key={`star-${i}`} className="fill-purple-600 text-purple-600 h-3 w-3" />);
    }

    // Add half star if needed
    if (hasHalfStar) {
      stars.push(<StarHalf key="half-star" className="fill-purple-600 text-purple-600 h-3 w-3" />);
    }

    // Add empty stars to make total of 5
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<Star key={`empty-${i}`} className="text-gray-300 h-3 w-3" />);
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

    setIsAddingToCart(true);
    try {
      await apiRequest("POST", "/api/cart", {
        productId: product.id,
        quantity: 1,
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

  // Get condition text based on product state
  const getConditionText = (product: ProductWithDetails) => {
    if (product.isNew) return 'Like New';
    
    // Safe handling of remainingPercentage
    const remainingPercentage = product.remainingPercentage ?? 0;
    
    if (remainingPercentage > 90) return 'Very Good';
    if (remainingPercentage > 70) return 'Good';
    if (remainingPercentage > 50) return 'Fair';
    return 'Good';
  };

  // Get listing type badge text
  const getListingTypeText = (type: string | undefined | null) => {
    if (!type || type === 'fixed') return 'FIXED PRICE';
    if (type === 'negotiable') return 'NEGOTIABLE';
    if (type === 'auction') return 'AUCTION';
    return 'FIXED PRICE';
  };
  
  // Get listing type badge color
  const getListingTypeBadgeColor = (type: string | undefined | null) => {
    if (type === 'auction') return 'bg-amber-100 text-amber-800';
    if (type === 'negotiable') return 'bg-white text-purple-800';
    return 'bg-white text-gray-800';
  };

  return (
    <div className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 border flex flex-col h-full">
      <div className="relative">
        <Link href={`/products/${product.id}`}>
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-48 object-cover"
          />
        </Link>
        
        {/* Heart button */}
        <button 
          className="absolute top-2 right-2 text-white bg-white rounded-full p-1 shadow-sm"
          onClick={() => setIsLiked(!isLiked)}
        >
          <Heart className={`h-5 w-5 ${isLiked ? 'fill-purple-600 text-purple-600' : 'text-gray-400'}`} />
        </button>
        
        {/* Condition badge (top left) */}
        <Badge className="absolute top-2 left-2 text-xs font-medium py-1 px-2 bg-white/90 text-gray-800">
          {getConditionText(product)}
        </Badge>
        
        {/* Listing type badge (bottom right) */}
        <Badge className={`absolute bottom-2 right-2 text-xs font-medium py-1 px-2 ${
          product.listingType === 'auction' 
            ? 'bg-amber-300/90 text-amber-900' 
            : product.listingType === 'negotiable' 
              ? 'bg-purple-300/90 text-purple-900' 
              : 'bg-white/90 text-gray-800'
        }`}>
          {getListingTypeText(product.listingType)}
        </Badge>
      </div>
      
      <div className="p-4 flex flex-col flex-grow">
        {/* Product name */}
        <Link href={`/products/${product.id}`}>
          <h3 className="font-semibold text-gray-900 hover:text-purple-600 transition-colors line-clamp-1 mb-1">
            {product.name}
          </h3>
        </Link>
        
        {/* Product subtitle */}
        <div className="text-sm font-medium text-gray-600 mb-1 line-clamp-1">
          {product.brand} {product.volume && `(${product.volume})`}
        </div>
        
        {/* Batch code and year */}
        <div className="text-xs text-gray-500 mb-2">
          {product.batchCode && `Batch ${product.batchCode}`}
        </div>
        
        {/* Location and seller */}
        <div className="flex items-center text-xs text-gray-500 mb-1">
          <span className="inline-block mr-1">
            {product.seller?.username || 'Seller'}
          </span>
        </div>
        
        {/* Divider */}
        <div className="border-t border-gray-100 my-2"></div>
        
        {/* Price section */}
        <div className="flex justify-between items-center mb-3">
          <span className="font-semibold text-purple-600">
            RM {product.price.toFixed(0)}
          </span>
          
          {product.listingType === 'auction' && (
            <div className="text-xs text-gray-500">
              <span>0 bids • in 5 days</span>
            </div>
          )}
        </div>
        
        {/* Spacer to push buttons to bottom */}
        <div className="flex-grow"></div>
        
        {/* Action buttons based on listing type */}
        {product.listingType === 'negotiable' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleAddToCart}
              disabled={isAddingToCart}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs py-2 rounded-md"
            >
              Buy Now
            </Button>
            <Button
              variant="outline"
              className="border-purple-600 text-purple-600 hover:bg-purple-50 text-xs py-2 rounded-md"
            >
              Make Offer
            </Button>
          </div>
        ) : product.listingType === 'auction' ? (
          <div>
            <div className="text-xs text-gray-600 mb-1">
              <span>Current Bid: RM {product.price.toFixed(0)}</span>
            </div>
            <Button
              onClick={handleAddToCart}
              disabled={isAddingToCart}
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs py-2 w-full rounded-md"
            >
              {isAddingToCart ? 'Processing...' : 'Bid Now'}
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleAddToCart}
            disabled={isAddingToCart}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs py-2 w-full rounded-md"
          >
            {isAddingToCart ? (
              <span className="flex items-center justify-center">
                <span className="animate-spin mr-2 h-3 w-3 border-b-2 border-white rounded-full"></span>
                Adding...
              </span>
            ) : 'Buy Now'}
          </Button>
        )}
      </div>
    </div>
  );
}
