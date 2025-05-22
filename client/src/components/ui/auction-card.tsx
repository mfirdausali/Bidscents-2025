import React from "react";
import { Link } from "wouter";
import { Clock, Heart, Tag } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { ProductWithDetails } from "@shared/schema";

interface AuctionCardProps {
  product: ProductWithDetails;
}

export function AuctionCard({ product }: AuctionCardProps) {
  // Format auction end time
  const formatTimeRemaining = (endTime?: string) => {
    if (!endTime) return "Auction ended";
    
    const endDate = new Date(endTime);
    const now = new Date();
    
    if (endDate <= now) return "Auction ended";
    
    const diffInMillis = endDate.getTime() - now.getTime();
    const diffInDays = Math.floor(diffInMillis / (1000 * 60 * 60 * 24));
    const diffInHours = Math.floor((diffInMillis % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffInMinutes = Math.floor((diffInMillis % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffInDays > 0) {
      return `${diffInDays}d ${diffInHours}h left`;
    } else if (diffInHours > 0) {
      return `${diffInHours}h ${diffInMinutes}m left`;
    } else {
      return `${diffInMinutes}m left`;
    }
  };

  // Check if auction has bids
  const hasBids = product.auction?.currentBid && product.auction.currentBid > 0;
  
  // Get current bid or starting price
  const currentPrice = hasBids 
    ? product.auction?.currentBid 
    : product.auction?.startingPrice || product.price;
  
  // Get auction end time
  const timeRemaining = formatTimeRemaining(product.auction?.endsAt);
  
  return (
    <Card className="overflow-hidden group h-full flex flex-col">
      <div className="aspect-square relative overflow-hidden">
        <Link href={`/auctions/${product.id}`}>
          <img
            src={product.imageUrl || "/placeholder.jpg"}
            alt={product.name}
            className="object-cover w-full h-full transition-transform group-hover:scale-105"
            loading="lazy"
          />
        </Link>
        
        {/* Auction Badge */}
        <Badge className="absolute top-2 left-2 bg-amber-500 hover:bg-amber-600">
          Auction
        </Badge>
        
        {/* Percentage Badge (if applicable) */}
        {product.remainingPercentage && product.remainingPercentage < 100 && (
          <Badge className="absolute top-2 right-2 bg-purple-500 hover:bg-purple-600">
            {product.remainingPercentage}% left
          </Badge>
        )}
      </div>
      
      <CardContent className="p-4 flex-grow">
        <div className="mb-1">
          <Link href={`/auctions/${product.id}`} className="hover:underline">
            <h3 className="font-medium text-base leading-tight line-clamp-2">{product.name}</h3>
          </Link>
        </div>
        
        <p className="text-sm text-muted-foreground">{product.brand}</p>
        
        {/* Auction info */}
        <div className="mt-2">
          <div className="flex items-center text-sm text-amber-600 font-medium">
            <Clock className="h-3.5 w-3.5 mr-1" />
            <span>{timeRemaining}</span>
          </div>
          
          {hasBids ? (
            <div className="flex items-center justify-between mt-1">
              <div>
                <p className="text-xs text-muted-foreground">Current bid:</p>
                <p className="font-semibold">{formatCurrency(currentPrice)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Bids:</p>
                <p className="font-medium">{product.auction?.bidCount || 0}</p>
              </div>
            </div>
          ) : (
            <div className="mt-1">
              <p className="text-xs text-muted-foreground">Starting at:</p>
              <p className="font-semibold">{formatCurrency(currentPrice)}</p>
            </div>
          )}
        </div>
      </CardContent>
      
      <CardFooter className="p-4 pt-0 mt-auto">
        <div className="flex w-full gap-2">
          <Button asChild className="w-full" variant="default">
            <Link href={`/auctions/${product.id}`}>
              Place Bid
            </Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}