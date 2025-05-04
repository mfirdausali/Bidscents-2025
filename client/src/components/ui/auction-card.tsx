import { Link } from "wouter";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, DollarSign, Users } from "lucide-react";
import { useState, useEffect } from "react";

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
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);
  
  // Calculate time remaining until auction ends
  useEffect(() => {
    if (!product.auction.endsAt) return;
    
    const calculateTimeRemaining = () => {
      const now = new Date();
      const endDate = new Date(product.auction.endsAt);
      console.log("End Date:", endDate);
      
      // If auction has ended
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
  }, [product.auction.endsAt]);
  
  // Determine the best image to show
  const imageUrl = images && images.length > 0 
    ? `/api/images/${images[0].imageUrl}` 
    : product.imageUrl 
      ? `/api/images/${product.imageUrl}` 
      : '/placeholder.jpg';
      
  // Format currency
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };
  
  // Get current bid or starting price
  const currentPrice = product.auction.currentBid || product.auction.startingPrice || product.price;
  
  // Get bid count from auction data
  const bidCount = product.auction.bidCount || 0;
  
  return (
    <Card className="h-full flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative">
        <Link href={`/auction/${product.auction.id}`}>
          <div className="aspect-square overflow-hidden bg-gray-100">
            <img 
              src={imageUrl} 
              alt={product.name}
              className="w-full h-full object-cover transition-all hover:scale-105"
            />
          </div>
          <Badge 
            className="absolute top-2 right-2 bg-amber-500 hover:bg-amber-600"
            variant="secondary"
          >
            Auction
          </Badge>
        </Link>
      </div>
      <div className="p-3 flex-grow flex flex-col">
        <div className="mb-auto">
          <Link href={`/auction/${product.auction.id}`}>
            <h3 className="font-medium line-clamp-2 hover:underline">{product.name}</h3>
          </Link>
          <p className="text-xs text-muted-foreground">{product.brand}</p>
          
          <div className="flex items-center mt-2 text-sm">
            <DollarSign className="w-3 h-3 mr-1 text-green-600" />
            <span className="text-green-600 text-sm font-medium">{formatCurrency(currentPrice)}</span>
          </div>
        </div>
        
        <div className="flex justify-between items-center mt-2 mb-1">
          <div className="flex items-center text-xs">
            <Clock className="w-3 h-3 mr-1 text-orange-500" />
            <span className={isActive ? "text-orange-500" : "text-gray-500"}>{timeRemaining}</span>
          </div>
          
          <div className="flex items-center text-xs text-muted-foreground">
            <Users className="w-3 h-3 mr-1" />
            <span>{bidCount} bid{bidCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
        
        <Button 
          size="sm"
          className="mt-2 w-full bg-amber-500 hover:bg-amber-600 text-xs font-medium px-2 py-1 h-8"
          disabled={!isActive}
          asChild
        >
          <Link href={`/auction/${product.auction.id}`}>
            Place Bid
          </Link>
        </Button>
      </div>
    </Card>
  );
}