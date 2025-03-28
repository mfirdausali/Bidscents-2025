import { useState } from "react";
import { Link } from "wouter";
import { ProductWithDetails } from "@shared/schema";
import { Badge } from "./badge";
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
      stars.push(<Star key={`star-${i}`} className="fill-current text-purple-600 h-3 w-3" />);
    }

    // Add half star if needed
    if (hasHalfStar) {
      stars.push(<StarHalf key="half-star" className="fill-current text-purple-600 h-3 w-3" />);
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

  // Format condition text
  const getConditionText = (product: ProductWithDetails) => {
    if (product.isNew) return 'Like New';
    if (product.remainingPercentage) return `${product.remainingPercentage}% Full`;
    return 'Good';
  }

  // Get condition class
  const getConditionClass = (product: ProductWithDetails) => {
    if (product.isNew) return 'bg-gray-100 text-gray-800';
    if (product.remainingPercentage && product.remainingPercentage > 90) return 'bg-green-100 text-green-800';
    if (product.remainingPercentage && product.remainingPercentage > 70) return 'bg-blue-100 text-blue-800';
    return 'bg-orange-100 text-orange-800';
  }

  // Get listing type class
  const getListingTypeClass = (type: string | undefined | null) => {
    if (!type || type === 'fixed') return 'badge-fixed';
    if (type === 'negotiable') return 'badge-negotiable';
    if (type === 'auction') return 'badge-auction';
    return 'badge-fixed';
  }

  return (
    <div className="card group hover:shadow-md transition-shadow duration-300">
      <div className="relative">
        <Link href={`/products/${product.id}`}>
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-56 object-cover"
          />
        </Link>
        <button 
          className="absolute top-3 right-3 text-white bg-white bg-opacity-50 hover:bg-opacity-100 p-1.5 rounded-full transition-colors duration-300"
          onClick={() => setIsLiked(!isLiked)}
        >
          <Heart className={`h-4 w-4 ${isLiked ? 'fill-purple-600 text-purple-600' : 'text-gray-600'}`} />
        </button>
        
        {/* Condition badge */}
        <div className={`absolute top-3 left-3 condition-badge ${getConditionClass(product)}`}>
          {getConditionText(product)}
        </div>
        
        {/* Listing type badge */}
        <div className={`absolute bottom-3 left-3 listing-badge ${getListingTypeClass(product.listingType)}`}>
          {product.listingType === 'auction' ? 'AUCTION' : 
            product.listingType === 'negotiable' ? 'NEGOTIABLE' : 'FIXED PRICE'}
        </div>
      </div>
      
      <div className="p-4">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-sm text-gray-600 font-medium">{product.brand}</span>
          
          {/* Volume badge */}
          {product.volume && (
            <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs text-gray-700">
              {product.volume}
            </span>
          )}
        </div>
        
        <Link href={`/products/${product.id}`}>
          <h3 className="text-base font-medium mb-1 text-gray-900 hover:text-purple-600 transition-colors">
            {product.name}
          </h3>
        </Link>
        
        {/* Batch info and seller */}
        <div className="flex justify-between items-center text-xs text-gray-500 mb-2">
          <span>{product.batchCode ? `Batch ${product.batchCode}` : '•'} {product.purchaseYear ? `• ${product.purchaseYear}` : ''}</span>
          <span>US • Seller</span>
        </div>
        
        {/* Price and bid status */}
        {product.listingType === 'auction' ? (
          <div className="mt-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">Current Bid:</span>
              <span className="font-semibold text-purple-600">RM {product.price.toFixed(2)}</span>
            </div>
            <div className="text-xs text-gray-500 mb-3">
              0 bids • in 5 days
            </div>
          </div>
        ) : (
          <div className="font-semibold text-lg text-purple-600 mt-2 mb-3">
            RM {product.price.toFixed(2)}
          </div>
        )}
        
        {/* Action button */}
        {product.listingType === 'negotiable' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleAddToCart}
              disabled={isAddingToCart}
              className="btn-primary text-sm py-1.5"
            >
              {isAddingToCart ? 'Adding...' : 'Buy Now'}
            </Button>
            <Button
              variant="outline"
              className="btn-outline text-sm py-1.5"
            >
              Make Offer
            </Button>
          </div>
        ) : product.listingType === 'auction' ? (
          <Button
            onClick={handleAddToCart}
            disabled={isAddingToCart}
            className="btn-primary w-full text-sm py-1.5"
          >
            {isAddingToCart ? 'Processing...' : 'Bid Now'}
          </Button>
        ) : (
          <Button
            onClick={handleAddToCart}
            disabled={isAddingToCart}
            className="btn-primary w-full text-sm py-1.5"
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
