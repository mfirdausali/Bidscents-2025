import { useState, useMemo, useCallback, memo } from "react";
import { Link } from "wouter";
import { ProductWithDetails } from "@shared/schema";
import { Button } from "./button";
import { Heart, Star, StarHalf } from "lucide-react";
import { Badge } from "./badge";
import { useAuth } from "@/hooks/use-supabase-auth";
import { ContactSellerButton } from "./contact-seller-button";
import { OptimizedImage } from "./optimized-image";
import { queryClient } from "@/lib/queryClient";

interface ProductCardProps {
  product: ProductWithDetails;
  sold?: boolean;
  onMouseEnter?: () => void;
}

// Memoized star rating component
const StarRating = memo(({ rating = 0 }: { rating?: number }) => {
  const stars = useMemo(() => {
    const result = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    // Add full stars
    for (let i = 0; i < fullStars; i++) {
      result.push(<Star key={`star-${i}`} className="fill-purple-600 text-purple-600 h-3 w-3" />);
    }

    // Add half star if needed
    if (hasHalfStar) {
      result.push(<StarHalf key="half-star" className="fill-purple-600 text-purple-600 h-3 w-3" />);
    }

    // Add empty stars
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
      result.push(<Star key={`empty-${i}`} className="text-gray-300 h-3 w-3" />);
    }

    return result;
  }, [rating]);

  return <div className="flex items-center gap-0.5">{stars}</div>;
});

StarRating.displayName = 'StarRating';

// Main ProductCard component with memoization
export const ProductCardOptimized = memo(({ 
  product, 
  sold = false,
  onMouseEnter 
}: ProductCardProps) => {
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(false);

  // Memoize computed values
  const displayPrice = useMemo(() => `RM ${product.price.toFixed(0)}`, [product.price]);
  
  const remainingVolume = useMemo(() => {
    if (!product.volume || product.isNew) return product.volume;
    const remaining = Math.round(
      (product.remainingPercentage || 100) * 
      parseFloat(String(product.volume)) / 100
    );
    return `${remaining}ml/${product.volume}`;
  }, [product.volume, product.remainingPercentage, product.isNew]);

  const conditionBadgeClass = useMemo(() => {
    const percentage = product.remainingPercentage || 0;
    if (percentage > 90) return 'bg-green-100 text-green-800';
    if (percentage > 50) return 'bg-yellow-100 text-yellow-800';
    if (percentage > 0) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  }, [product.remainingPercentage]);

  const listingBadgeClass = useMemo(() => {
    switch (product.listingType) {
      case 'auction': return 'bg-amber-300/90 text-amber-900';
      case 'negotiable': return 'bg-purple-300/90 text-purple-900';
      default: return 'bg-white/90 text-gray-800';
    }
  }, [product.listingType]);

  const imageUrl = useMemo(() => {
    const primaryImage = product.images?.find(img => img.imageOrder === 0);
    if (primaryImage?.imageUrl) return `/api/images/${primaryImage.imageUrl}`;
    
    const anyImage = product.images?.[0];
    if (anyImage?.imageUrl) return `/api/images/${anyImage.imageUrl}`;
    
    if (product.imageUrl) return `/api/images/${product.imageUrl}`;
    
    return '/placeholder.jpg';
  }, [product.images, product.imageUrl]);

  // Memoize callbacks
  const handleLikeToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsLiked(prev => !prev);
  }, []);

  const handleMouseEnter = useCallback(() => {
    // Prefetch product details on hover
    if (!sold && onMouseEnter) {
      onMouseEnter();
    }
    
    // Prefetch product details
    queryClient.prefetchQuery({
      queryKey: [`/api/products/${product.id}`],
      staleTime: 5 * 60 * 1000, // 5 minutes
    });
  }, [product.id, sold, onMouseEnter]);

  return (
    <div 
      className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 border flex flex-col h-full"
      onMouseEnter={handleMouseEnter}
    >
      <div className="relative">
        {sold ? (
          <div className="relative">
            <OptimizedImage
              src={imageUrl}
              alt={product.name}
              className="w-full h-36 md:h-48 object-cover opacity-70"
            />
            <Badge className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-sm font-bold py-1 px-3 bg-gray-800/80 text-white">
              SOLD
            </Badge>
          </div>
        ) : (
          <Link href={`/products/${product.id}`}>
            <OptimizedImage
              src={imageUrl}
              alt={product.name}
              className="w-full h-36 md:h-48 object-cover"
            />
          </Link>
        )}
        
        {/* Heart button */}
        <button 
          className="absolute top-2 right-2 text-white bg-white rounded-full p-1 shadow-sm"
          onClick={handleLikeToggle}
          aria-label={isLiked ? "Unlike product" : "Like product"}
        >
          <Heart className={`h-5 w-5 ${isLiked ? 'fill-purple-600 text-purple-600' : 'text-gray-400'}`} />
        </button>
        
        {/* Condition badge */}
        <Badge className={`absolute top-2 left-2 text-xs font-medium py-1 px-2 ${conditionBadgeClass}`}>
          {product.remainingPercentage ? `${product.remainingPercentage}%` : 'New'}
        </Badge>
        
        {/* Listing type badge */}
        <Badge className={`absolute bottom-2 right-2 text-xs font-medium py-1 px-2 ${listingBadgeClass}`}>
          {product.listingType === "auction" ? "AUCTION" : 
           product.listingType === "negotiable" ? "NEGOTIABLE" : "FIXED PRICE"}
        </Badge>
      </div>
      
      <div className="p-3 md:p-4 flex flex-col flex-grow">
        {/* Product name */}
        {sold ? (
          <h3 className="font-semibold text-gray-700 line-clamp-1 mb-0.5 md:mb-1">
            {product.name}
          </h3>
        ) : (
          <Link href={`/products/${product.id}`}>
            <h3 className="font-semibold text-gray-900 hover:text-purple-600 transition-colors line-clamp-1 mb-0.5 md:mb-1">
              {product.name}
            </h3>
          </Link>
        )}
        
        {/* Product subtitle */}
        <div className="text-sm font-medium text-gray-600 mb-0.5 md:mb-1 line-clamp-1">
          {product.brand} {product.volume && 
            (product.isNew ? `(${product.volume})` : `(${remainingVolume})`)
          }
        </div>
        
        {/* Batch code - desktop only */}
        {product.batchCode && (
          <div className="text-xs text-gray-500 mb-1 md:mb-2 hidden md:block">
            Batch {product.batchCode}
          </div>
        )}
        
        {/* Seller info */}
        <div className="flex items-center text-xs text-gray-500 mb-0.5 md:mb-1">
          <span className="inline-block mr-1">
            {product.seller?.username || 'Seller'}
          </span>
        </div>
        
        {/* Divider */}
        <div className="border-t border-gray-100 my-1 md:my-2" />
        
        {/* Price section */}
        <div className="flex justify-between items-center mb-2 md:mb-3">
          <span className="font-semibold text-purple-600">
            {displayPrice}
          </span>
          
          {product.listingType === 'auction' && (
            <div className="text-xs text-gray-500">
              <span>0 bids • in 5 days</span>
            </div>
          )}
        </div>
        
        {/* Spacer */}
        <div className="flex-grow" />
        
        {/* Action buttons */}
        {sold ? (
          <div className="w-full text-center py-2 bg-gray-200 text-gray-600 rounded-md text-xs">
            Item Sold
          </div>
        ) : (
          <ContactSellerButton 
            sellerId={product.sellerId}
            sellerName={product.seller?.username || 'Seller'}
            sellerImage={product.seller?.profileImage || null}
            productId={product.id}
            productName={product.name}
            variant="secondary"
            size="default"
            className={`text-white text-xs py-2 w-full rounded-md ${
              product.listingType === 'auction' 
                ? 'bg-amber-500 hover:bg-amber-600' 
                : 'bg-purple-600 hover:bg-purple-700'
            }`}
          />
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better memoization
  return (
    prevProps.product.id === nextProps.product.id &&
    prevProps.product.price === nextProps.product.price &&
    prevProps.product.remainingPercentage === nextProps.product.remainingPercentage &&
    prevProps.sold === nextProps.sold
  );
});

ProductCardOptimized.displayName = 'ProductCardOptimized';