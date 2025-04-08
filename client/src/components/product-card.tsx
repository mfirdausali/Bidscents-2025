import { Link } from "wouter";
import { Heart, Star, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

interface ProductCardProps {
  product: {
    id: number;
    name: string;
    price: number;
    discountPrice?: number | null;
    image: string | null;
    createdAt: string | Date;
    isAuction?: boolean;
    endDate?: string | Date | null;
    category?: { name: string } | null;
    averageRating?: number | null;
    brand?: string | null;
    inStock?: boolean;
    isFeatured?: boolean;
    seller?: {
      id: number;
      username: string;
      isVerified?: boolean;
    } | null;
  };
  variant?: "default" | "compact";
  className?: string;
}

export default function ProductCard({ 
  product,
  variant = "default",
  className = "" 
}: ProductCardProps) {
  const {
    id,
    name,
    price,
    discountPrice,
    image,
    createdAt,
    isAuction,
    endDate,
    category,
    averageRating,
    brand,
    inStock = true,
    isFeatured,
    seller
  } = product;
  
  const defaultImage = "/images/product-placeholder.jpg";
  
  // Calculate if the auction is ending soon (within 24 hours)
  const isEndingSoon = endDate && new Date(endDate).getTime() - new Date().getTime() < 24 * 60 * 60 * 1000;
  
  // Check if the product is new (less than 3 days old)
  const isNew = new Date().getTime() - new Date(createdAt).getTime() < 3 * 24 * 60 * 60 * 1000;

  return (
    <Card className={`h-full overflow-hidden transition-all duration-200 hover:shadow-md ${className}`}>
      <div className="relative">
        {/* Product Image */}
        <Link href={`/products/${id}`}>
          <a className="block">
            <div className="relative aspect-square overflow-hidden bg-muted">
              <img 
                src={image || defaultImage}
                alt={name}
                className="h-full w-full object-cover object-center transition-transform hover:scale-105"
              />
            </div>
          </a>
        </Link>
        
        {/* Badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {isAuction && (
            <Badge className="bg-amber-500">
              Auction
            </Badge>
          )}
          {isNew && !isAuction && (
            <Badge className="bg-blue-500">
              New
            </Badge>
          )}
          {isFeatured && (
            <Badge className="bg-purple-500">
              Featured
            </Badge>
          )}
        </div>
        
        {/* Wishlist Button */}
        <Button 
          variant="outline" 
          size="icon" 
          className="absolute right-2 top-2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm"
        >
          <Heart className="h-4 w-4" />
          <span className="sr-only">Add to wishlist</span>
        </Button>
      </div>
      
      <CardContent className={`${variant === 'compact' ? 'p-3' : 'p-4'}`}>
        {/* Category */}
        {category && (
          <div className="mb-1">
            <span className="text-xs text-muted-foreground">
              {category.name}
            </span>
          </div>
        )}
        
        {/* Brand */}
        {brand && (
          <div className="mb-1">
            <span className="text-xs font-medium">{brand}</span>
          </div>
        )}
        
        {/* Product Name */}
        <Link href={`/products/${id}`}>
          <a className="group">
            <h3 className={`mb-2 line-clamp-2 font-medium group-hover:text-primary ${variant === 'compact' ? 'text-sm' : 'text-base'}`}>
              {name}
            </h3>
          </a>
        </Link>
        
        {/* Seller */}
        {seller && (
          <div className="mb-2">
            <Link href={`/sellers/${seller.id}`}>
              <a className="flex items-center text-xs text-muted-foreground hover:text-foreground">
                By <span className="ml-1 font-medium">{seller.username}</span>
                {seller.isVerified && (
                  <Badge variant="outline" className="ml-1 h-4 border-primary px-1 text-[10px] font-normal text-primary">
                    Verified
                  </Badge>
                )}
              </a>
            </Link>
          </div>
        )}
        
        {/* Rating */}
        {averageRating !== null && averageRating !== undefined && (
          <div className="mb-3 flex items-center">
            <Star className="mr-1 h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs font-medium">{averageRating.toFixed(1)}</span>
          </div>
        )}
        
        {/* Price */}
        <div className="mb-1 flex items-center">
          {discountPrice !== null && discountPrice !== undefined ? (
            <>
              <span className={`font-semibold ${variant === 'compact' ? 'text-base' : 'text-lg'}`}>
                ${discountPrice.toFixed(2)}
              </span>
              <span className="ml-2 text-sm text-muted-foreground line-through">
                ${price.toFixed(2)}
              </span>
            </>
          ) : (
            <span className={`font-semibold ${variant === 'compact' ? 'text-base' : 'text-lg'}`}>
              ${price.toFixed(2)}
            </span>
          )}
        </div>
        
        {/* Auction End Time */}
        {isAuction && endDate && (
          <div className="mt-2 flex items-center text-xs">
            <Clock className={`mr-1 h-3.5 w-3.5 ${isEndingSoon ? 'text-red-500' : 'text-muted-foreground'}`} />
            <span className={isEndingSoon ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
              {isEndingSoon ? 'Ending soon: ' : 'Ends: '}
              {format(new Date(endDate), 'MMM d, h:mm a')}
            </span>
          </div>
        )}
        
        {/* Stock Status */}
        {!inStock && (
          <div className="mt-2 flex items-center text-xs text-red-500">
            <AlertCircle className="mr-1 h-3.5 w-3.5" />
            <span>Out of stock</span>
          </div>
        )}
      </CardContent>
      
      {variant === 'default' && (
        <CardFooter className="p-4 pt-0">
          <Button 
            disabled={!inStock || (isAuction && endDate && new Date(endDate) < new Date())}
            className="w-full"
          >
            {isAuction ? 'Place Bid' : 'Add to Cart'}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}