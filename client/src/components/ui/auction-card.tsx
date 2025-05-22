import React from "react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Gavel, Clock } from "lucide-react";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProductWithDetails } from "@shared/schema";

interface AuctionCardProps {
  product: ProductWithDetails;
}

export function AuctionCard({ product }: AuctionCardProps) {
  // Determine if auction is active
  const isActive = product.auction && product.auction.status === "active";
  
  // Format end date
  const formatEndDate = () => {
    if (!product.auction?.endsAt) return "No end date";
    
    try {
      const endDate = new Date(product.auction.endsAt);
      return formatDistanceToNow(endDate, { addSuffix: true });
    } catch (error) {
      console.error("Date formatting error:", error);
      return "Invalid date";
    }
  };

  // Format current bid price or starting price
  const formatPrice = () => {
    if (product.auction?.currentBid) {
      return `Current Bid: RM${product.auction.currentBid.toFixed(2)}`;
    }
    return `Starting: RM${product.auction?.startingPrice.toFixed(2) || product.price.toFixed(2)}`;
  };

  // Determine number of bids
  const bidCount = product.auction?.bids?.length || 0;

  return (
    <Card className="overflow-hidden h-full flex flex-col group transition-all hover:shadow-md">
      <div className="relative h-48 overflow-hidden bg-gray-100">
        {/* Auction badge */}
        <div className="absolute top-2 left-2 z-10">
          <Badge className="bg-primary text-white flex items-center gap-1">
            <Gavel className="h-3 w-3" />
            <span>Auction</span>
          </Badge>
        </div>
        
        {/* Time remaining badge */}
        {isActive && (
          <div className="absolute top-2 right-2 z-10">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Ends {formatEndDate()}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Auction ends {product.auction?.endsAt ? new Date(product.auction.endsAt).toLocaleString() : 'soon'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        
        {/* Product image with link */}
        <Link href={`/products/${product.id}`} className="block h-full">
          <img
            src={product.imageUrl || product.images?.[0]?.imageUrl || "/placeholder.jpg"}
            alt={product.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        </Link>
      </div>

      <CardContent className="py-4 flex-grow">
        <Link href={`/products/${product.id}`} className="hover:underline">
          <h3 className="font-semibold text-lg line-clamp-1 mb-1">
            {product.name}
          </h3>
        </Link>
        <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
          {product.brand}
        </p>
        <div className="flex justify-between items-center">
          <p className="font-medium">
            {formatPrice()}
          </p>
          <span className="text-sm text-muted-foreground">
            {bidCount} {bidCount === 1 ? 'bid' : 'bids'}
          </span>
        </div>
      </CardContent>

      <CardFooter className="pt-0 pb-4">
        <div className="w-full">
          <Link href={`/products/${product.id}`} className="block w-full">
            <Badge variant="outline" className="w-full justify-center hover:bg-secondary">
              View Auction
            </Badge>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}