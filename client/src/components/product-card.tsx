
import { useState } from "react";
import { Link } from "wouter";
import { Heart, MessageSquare, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface ProductProps {
  product: {
    id: string;
    name: string;
    price: number;
    image: string;
    rating: string;
    reviewCount: number;
    category: string;
    inStock: boolean;
  };
}

export function ProductCard({ product }: ProductProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isContacting, setIsContacting] = useState(false);

  const handleContactSeller = () => {
    if (!user) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to contact sellers",
        variant: "destructive",
      });
      return;
    }

    setIsContacting(true);
    try {
      toast({
        title: "Contacting seller",
        description: `We're connecting you with the seller of ${product.name}`,
      });
      
      setTimeout(() => {
        toast({
          title: "Seller contacted",
          description: `Your interest in ${product.name} has been sent to the seller`,
        });
        setIsContacting(false);
      }, 1000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to contact seller",
        variant: "destructive",
      });
      setIsContacting(false);
    }
  };

  return (
    <Card className="overflow-hidden h-full">
      <div className="relative">
        <Link href={`/products/${product.id}`}>
          <div className="aspect-square overflow-hidden bg-gray-100">
            {product.image ? (
              <img
                src={product.image}
                alt={product.name}
                className="h-full w-full object-cover transition-transform hover:scale-105"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-gray-400">
                No image
              </div>
            )}
          </div>
        </Link>
        {!product.inStock && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <Badge variant="outline" className="text-sm font-semibold">
              Out of Stock
            </Badge>
          </div>
        )}
        {product.inStock && (
          <Badge className="absolute top-2 right-2 bg-purple-600 text-xs px-2 py-0.5">
            Available
          </Badge>
        )}
      </div>
      <CardContent className="p-2 p-3">
        <div className="space-y-1">
          <div className="flex justify-between items-start">
            <Link href={`/products/${product.id}`} className="font-medium hover:underline text-sm line-clamp-1">
              {product.name}
            </Link>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-purple-600 -mt-1 -mr-1 p-0.5">
              <Heart className="h-4 w-4" />
            </Button>
          </div>
          <p className="font-bold text-purple-600 text-sm md:text-base">RM {product.price.toFixed(2)}</p>
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-purple-600 text-purple-600" />
            <span className="text-xs">{product.rating}</span>
            <span className="text-xs text-muted-foreground">({product.reviewCount})</span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {product.category}
          </p>
        </div>
      </CardContent>
      <CardFooter className="p-2 px-3 pt-0">
        <div className="grid grid-cols-2 gap-1 w-full">
          <Button 
            className="bg-purple-600 hover:bg-purple-700 text-white shadow-sm text-xs h-7 md:h-8"
            disabled={!product.inStock || isContacting}
            onClick={handleContactSeller}
          >
            {isContacting ? (
              <span className="flex items-center">
                <span className="animate-spin mr-1 h-2 w-2 border-b-2 border-white rounded-full"></span>
                Contacting...
              </span>
            ) : (
              <span className="flex items-center">
                <MessageSquare className="mr-1 h-3 w-3" />
                Contact
              </span>
            )}
          </Button>
          <Button 
            variant="outline"
            className="border-purple-600 text-purple-600 hover:bg-purple-50 text-xs h-7 md:h-8"
          >
            Make Offer
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
