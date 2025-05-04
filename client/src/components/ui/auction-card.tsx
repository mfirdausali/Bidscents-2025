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
  
  // Estimate number of bids (placeholder - would be fetched from API in a real implementation)
  const estimatedBids = Math.floor(Math.random() * 10); // This is just a placeholder
  
  return (
    <Card className="h-full flex flex-col overflow-hidden group">
      <CardHeader className="p-0 aspect-square overflow-hidden">
        <Link href={`/auction/${product.id}`} className="block w-full h-full">
          <img 
            src={imageUrl} 
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <Badge 
            className="absolute top-2 right-2 bg-amber-500 hover:bg-amber-600"
            variant="secondary"
          >
            Auction
          </Badge>
        </Link>
      </CardHeader>
      <CardContent className="flex-grow p-4">
        <Link href={`/auction/${product.id}`} className="hover:underline">
          <h3 className="font-semibold text-lg mb-1 line-clamp-2">{product.name}</h3>
        </Link>
        <p className="text-sm text-muted-foreground mb-1">{product.brand}</p>
        
        <div className="flex items-center mt-3 text-sm font-medium">
          <DollarSign className="w-4 h-4 mr-1 text-green-600" />
          <span className="text-green-600">Current Bid: {formatCurrency(currentPrice)}</span>
        </div>
        
        {product.auction.buyNowPrice && (
          <div className="text-sm mt-1">
            <span className="text-muted-foreground">Buy Now: {formatCurrency(product.auction.buyNowPrice)}</span>
          </div>
        )}
        
        <div className="flex justify-between mt-3">
          <div className="flex items-center text-sm">
            <Clock className="w-4 h-4 mr-1 text-orange-500" />
            <span className={isActive ? "text-orange-500" : "text-gray-500"}>{timeRemaining}</span>
          </div>
          
          <div className="flex items-center text-sm text-muted-foreground">
            <Users className="w-4 h-4 mr-1" />
            <span>{estimatedBids} bid{estimatedBids !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0 pb-4 px-4">
        <Button 
          className="w-full bg-amber-500 hover:bg-amber-600"
          disabled={!isActive}
          asChild
        >
          <Link href={`/auction/${product.id}`}>
            Place Bid
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}