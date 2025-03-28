import { useState } from "react";
import { Link } from "wouter";
import { ProductWithDetails } from "@shared/schema";
import { Button } from "./button";
import { Heart, Star, StarHalf } from "lucide-react";
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
    <div className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 border">
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
          className="absolute top-2 left-2 text-white bg-white rounded-full p-1 shadow-sm"
          onClick={() => setIsLiked(!isLiked)}
        >
          <Heart className={`h-5 w-5 ${isLiked ? 'fill-purple-600 text-purple-600' : 'text-gray-400'}`} />
        </button>
        
        {/* Condition badge (bottom left) */}
        <div className="absolute bottom-2 left-2 text-xs font-medium py-1 px-2 rounded-sm bg-white">
          {getConditionText(product)}
        </div>
        
        {/* Listing type badge (bottom right) */}
        <div className={`absolute bottom-2 right-2 text-xs font-medium py-1 px-2 rounded-sm ${getListingTypeBadgeColor(product.listingType)}`}>
          {getListingTypeText(product.listingType)}
        </div>
      </div>
      
      <div className="p-3">
        {/* Product name and price */}
        <div className="flex justify-between items-start mb-1">
          <Link href={`/products/${product.id}`}>
            <h3 className="text-sm font-semibold text-gray-900 hover:text-purple-600 transition-colors">
              {product.name}
            </h3>
          </Link>
        </div>
        <span className="font-semibold text-purple-600 text-sm">
            RM {product.price.toFixed(0)}
          </span>
        
        {/* Brand and volume */}
        <div className="text-xs text-gray-600 mb-2">
          {product.volume && ` ${product.volume}`}
          {product.batchCode && ` • Batch ${product.batchCode}`}
        </div>
        
        {/* Location and seller */}
        <div className="flex justify-between items-center text-xs text-gray-500 mb-2">
          <span>{product.seller?.username || 'US'}</span>
        </div>
        
        {/* Auction info (if applicable) */}
        {product.listingType === 'auction' && (
          <div className="text-xs text-gray-500 mb-3">
            <div className="flex justify-between">
              <span>Current Bid: RM {product.price.toFixed(0)}</span>
              <span>0 bids • in 5 days</span>
            </div>
          </div>
        )}
        
        {/* Action buttons */}
        {product.listingType === 'negotiable' ? (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button
              onClick={handleAddToCart}
              disabled={isAddingToCart}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-md py-1.5"
            >
              Buy Now
            </Button>
            <Button
              variant="outline"
              className="border-purple-600 text-purple-600 hover:bg-purple-50 text-xs rounded-md py-1.5"
            >
              Make Offer
            </Button>
          </div>
        ) : product.listingType === 'auction' ? (
          <Button
            onClick={handleAddToCart}
            disabled={isAddingToCart}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-md py-1.5 w-full mt-3"
          >
            {isAddingToCart ? 'Processing...' : 'Bid Now'}
          </Button>
        ) : (
          <Button
            onClick={handleAddToCart}
            disabled={isAddingToCart}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-md py-1.5 w-full mt-3"
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
