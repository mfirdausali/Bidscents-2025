
import { useState } from "react";
import { Link } from "wouter";
import { ProductWithDetails } from "@shared/schema";
import { Button } from "./button";
import { Heart, Star, StarHalf, MessageSquare } from "lucide-react";
import { Badge } from "./badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ContactSellerButton } from "./contact-seller-button";

interface ProductCardProps {
  product: ProductWithDetails;
  sold?: boolean;
}

export function ProductCard({ product, sold = false }: ProductCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLiked, setIsLiked] = useState(false);
  // No longer need isContacting state since we're using the ContactSellerButton component

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

  return (
    <div className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 border flex flex-col h-full">
      <div className="relative">
        {sold ? (
          <div className="relative">
            <img
              src={
                // First, try to find an image with imageOrder=0
                product.images?.find(img => img.imageOrder === 0)?.imageUrl 
                  ? `/api/images/${product.images.find(img => img.imageOrder === 0)?.imageUrl}`
                  // Then try any available image
                  : product.images?.[0]?.imageUrl
                    ? `/api/images/${product.images[0].imageUrl}`
                    // Fallback to the old imageUrl field if no images in the table
                    : product.imageUrl
                      ? `/api/images/${product.imageUrl}`
                      : '/placeholder.jpg' // Default placeholder
              }
              alt={product.name}
              className="w-full h-36 md:h-48 object-cover opacity-70"
              onError={(e) => {
                e.currentTarget.src = '/placeholder.jpg';
                e.currentTarget.onerror = null; // Prevent infinite loop
              }}
            />
            <Badge className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-sm font-bold py-1 px-3 bg-gray-800/80 text-white">
              SOLD
            </Badge>
          </div>
        ) : (
          <Link href={`/products/${product.id}`}>
            <img
              src={
                // First, try to find an image with imageOrder=0
                product.images?.find(img => img.imageOrder === 0)?.imageUrl 
                  ? `/api/images/${product.images.find(img => img.imageOrder === 0)?.imageUrl}`
                  // Then try any available image
                  : product.images?.[0]?.imageUrl
                    ? `/api/images/${product.images[0].imageUrl}`
                    // Fallback to the old imageUrl field if no images in the table
                    : product.imageUrl
                      ? `/api/images/${product.imageUrl}`
                      : '/placeholder.jpg' // Default placeholder
              }
              alt={product.name}
              className="w-full h-36 md:h-48 object-cover"
              onError={(e) => {
                e.currentTarget.src = '/placeholder.jpg';
                e.currentTarget.onerror = null; // Prevent infinite loop
              }}
            />
          </Link>
        )}
        
        {/* Heart button */}
        <button 
          className="absolute top-2 right-2 text-white bg-white rounded-full p-1 shadow-sm"
          onClick={() => setIsLiked(!isLiked)}
        >
          <Heart className={`h-5 w-5 ${isLiked ? 'fill-purple-600 text-purple-600' : 'text-gray-400'}`} />
        </button>
        
        {/* Condition badge (top left) */}
        <Badge className={`absolute top-2 left-2 text-xs font-medium py-1 px-2 ${
          product.remainingPercentage && product.remainingPercentage > 90
            ? 'bg-green-100 text-green-800'
            : product.remainingPercentage && product.remainingPercentage > 50
              ? 'bg-yellow-100 text-yellow-800'
              : product.remainingPercentage && product.remainingPercentage > 0
                ? 'bg-red-100 text-red-800'
                : 'bg-gray-100 text-gray-800'
        }`}>
          {product.remainingPercentage ? `${product.remainingPercentage}%` : ''}
        </Badge>
        
        {/* Listing type badge (bottom right) */}
        <Badge className={`absolute bottom-2 right-2 text-xs font-medium py-1 px-2 ${
          product.listingType === 'auction' 
            ? 'bg-amber-300/90 text-amber-900' 
            : product.listingType === 'negotiable' 
              ? 'bg-purple-300/90 text-purple-900' 
              : 'bg-white/90 text-gray-800'
        }`}>
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
            (product.isNew 
              ? `(${product.volume})` 
              : `(${Math.round((product.remainingPercentage || 100) * (typeof product.volume === 'number' ? product.volume : parseFloat(String(product.volume))) / 100)}ml/${product.volume})`
            )
          }
        </div>
        
        {/* Batch code and year - hide on mobile */}
        <div className="text-xs text-gray-500 mb-1 md:mb-2 hidden md:block">
          {product.batchCode && `Batch ${product.batchCode}`}
        </div>
        
        {/* Location and seller */}
        <div className="flex items-center text-xs text-gray-500 mb-0.5 md:mb-1">
          <span className="inline-block mr-1">
            {product.seller?.username || 'Seller'}
          </span>
        </div>
        
        {/* Divider */}
        <div className="border-t border-gray-100 my-1 md:my-2"></div>
        
        {/* Price section */}
        <div className="flex justify-between items-center mb-2 md:mb-3">
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
        {sold ? (
          <div className="w-full text-center py-2 bg-gray-200 text-gray-600 rounded-md text-xs">
            Item Sold
          </div>
        ) : product.listingType === 'negotiable' ? (
          <ContactSellerButton 
            sellerId={product.sellerId}
            sellerName={product.seller?.username || 'Seller'}
            sellerImage={product.seller?.profileImage || null}
            productId={product.id}
            productName={product.name}
            variant="secondary"
            size="default"
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs py-2 w-full rounded-md"
          />
        ) : product.listingType === 'auction' ? (
          <div>
            <div className="text-xs text-gray-600 mb-1">
              <span>Current Bid: RM {product.price.toFixed(0)}</span>
            </div>
            <ContactSellerButton 
              sellerId={product.sellerId}
              sellerName={product.seller?.username || 'Seller'}
              sellerImage={product.seller?.profileImage || null}
              productId={product.id}
              productName={product.name}
              variant="secondary"
              size="default"
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs py-2 w-full rounded-md"
            />
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
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs py-2 w-full rounded-md"
          />
        )}
      </div>
    </div>
  );
}
