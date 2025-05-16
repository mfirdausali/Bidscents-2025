import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "./button";
import { Heart, Star, StarHalf, Clock, Users } from "lucide-react";
import { Badge } from "./badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ContactSellerButton } from "./contact-seller-button";

interface AuctionProps {
  product: {
    id: number;
    name: string;
    price: number;
    brand: string;
    imageUrl: string; // This is now always a string (empty string if no image)
    category?: string;
    stockQuantity?: number;
    rating?: number;
    reviewCount?: number;
    listingType?: string;
    remainingPercentage?: number;
    volume?: number | string;
    batchCode?: string;
    sellerId: number;
    seller?: {
      username?: string;
      profileImage?: string | null;
      id?: number;
      email?: string;
      firstName?: string | null;
      lastName?: string | null;
    };
    auction: { // Make auction required
      id: number;
      startingPrice: number;
      currentBid: number | null;
      bidIncrement: number;
      buyNowPrice: number | null;
      endsAt: string;
      startsAt: string;
      status: string;
      bidCount?: number;
    };
  };
  images?: Array<{ id: number; imageUrl: string }>;
}

export function AuctionCard({ product, images }: AuctionProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLiked, setIsLiked] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);
  
  // Calculate time remaining until auction ends
  useEffect(() => {
    if (!product.auction.endsAt) return;
    
    // Check if auction is active based on status
    if (product.auction.status !== 'active') {
      setIsActive(false);
      setTimeRemaining("Ended");
      return;
    }
    
    const calculateTimeRemaining = () => {
      const now = new Date();
      const endDate = new Date(product.auction.endsAt);
      
      // If auction has ended by time
      if (now > endDate) {
        setIsActive(false);
        setTimeRemaining("Ended");
        return;
      }
      
      const diffMs = endDate.getTime() - now.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (diffDays > 0) {
        setTimeRemaining(`${diffDays}d ${diffHours}h`);
      } else if (diffHours > 0) {
        setTimeRemaining(`${diffHours}h ${diffMinutes}m`);
      } else if (diffMinutes > 0) {
        setTimeRemaining(`${diffMinutes}m`);
      } else {
        setTimeRemaining("< 1m");
      }
    };
    
    // Initial calculation
    calculateTimeRemaining();
    
    // Update every minute
    const interval = setInterval(calculateTimeRemaining, 60000);
    
    return () => clearInterval(interval);
  }, [product.auction.endsAt, product.auction.status]);
  
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
  
  // Get current bid or starting price
  const currentPrice = product.auction.currentBid || product.auction.startingPrice || product.price;
  
  // Get bid count from auction data
  const bidCount = product.auction.bidCount || 0;
  
  return (
    <div className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 border flex flex-col h-full">
      <div className="relative">
        <Link href={`/auction/${product.auction.id}`}>
          <img
            src={
              // Use the first available image from the images array
              images && images.length > 0
                ? `/api/images/${images[0].imageUrl}`
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
        <Badge className="absolute bottom-2 right-2 text-xs font-medium py-1 px-2 bg-amber-300/90 text-amber-900">
          AUCTION
        </Badge>
      </div>
      
      <div className="p-3 md:p-4 flex flex-col flex-grow">
        {/* Product name */}
        <Link href={`/auctions/${product.auction.id}`}>
          <h3 className="font-semibold text-gray-900 hover:text-purple-600 transition-colors line-clamp-1 mb-0.5 md:mb-1">
            {product.name}
          </h3>
        </Link>
        
        {/* Product subtitle */}
        <div className="text-sm font-medium text-gray-600 mb-0.5 md:mb-1 line-clamp-1">
          {product.brand} {product.volume && 
            (product.remainingPercentage === 100 
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
        
        {/* Price section with bids and time remaining */}
        <div className="flex justify-between items-center mb-2 md:mb-3">
          <span className="font-semibold text-amber-600">
            RM {currentPrice.toFixed(0)}
          </span>
          
          <div className="text-xs text-gray-500">
            <span>
              {bidCount} bid{bidCount !== 1 ? 's' : ''} • {timeRemaining}
            </span>
          </div>
        </div>
        
        {/* Spacer to push buttons to bottom */}
        <div className="flex-grow"></div>
        
        {/* Place bid button */}
        <Button
          asChild
          disabled={!isActive}
          className="bg-amber-500 hover:bg-amber-600 text-white text-xs py-1.5 md:py-2 w-full rounded-md"
        >
          <Link href={`/auctions/${product.auction.id}`}>
            {isActive ? "Place Bid" : "Auction Ended"}
          </Link>
        </Button>
      </div>
    </div>
  );
}