import { Link } from "wouter";
import { Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

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

  // Add to cart mutation
  const addToCartMutation = useMutation({
    mutationFn: async (productId: number) => {
      return await apiRequest("POST", "/api/cart", {
        productId,
        quantity: 1
      });
    },
    onSuccess: () => {
      toast({
        title: "Added to cart",
        description: `${product.name} has been added to your cart.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add product to cart.",
        variant: "destructive",
      });
    }
  });

  const handleAddToCart = () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to add items to your cart.",
        variant: "destructive",
      });
      return;
    }
    
    addToCartMutation.mutate(parseInt(product.id));
  };

  // For perfume-specific UI elements
  const isPerfume = true;
  
  return (
    <Card className="overflow-hidden">
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
            <Badge variant="outline" className="text-base font-semibold">
              Out of Stock
            </Badge>
          </div>
        )}
        {isPerfume && product.inStock && (
          <Badge className="absolute top-2 right-2 bg-purple-600">
            Available
          </Badge>
        )}
      </div>
      <CardContent className="p-4">
        <div className="space-y-1">
          <Link href={`/products/${product.id}`} className="font-medium hover:underline">
            {product.name}
          </Link>
          <p className="font-bold">${product.price.toFixed(2)}</p>
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-primary text-primary" />
            <span className="text-sm">{product.rating}</span>
            <span className="text-xs text-muted-foreground">({product.reviewCount})</span>
          </div>
          {isPerfume && (
            <p className="text-xs text-muted-foreground">
              {product.category}
            </p>
          )}
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button 
          className="w-full" 
          disabled={!product.inStock || addToCartMutation.isPending}
          onClick={handleAddToCart}
        >
          {addToCartMutation.isPending ? "Adding..." : "Add to Cart"}
        </Button>
      </CardFooter>
    </Card>
  );
}