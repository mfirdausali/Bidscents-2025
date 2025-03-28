import { useState } from "react";
import { Link } from "wouter";
import { ProductWithDetails } from "@shared/schema";
import { Badge } from "./badge";
import { Button } from "./button";
import { Heart, Star, StarHalf } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface ProductCardProps {
  product: ProductWithDetails;
}

export function ProductCard({ product }: ProductCardProps) {
  const { user, setCartCount } = useAuth();
  const { toast } = useToast();
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  // Function to render star ratings
  const renderStars = (rating: number | undefined) => {
    if (!rating) rating = 0;
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    // Add full stars
    for (let i = 0; i < fullStars; i++) {
      stars.push(<Star key={`star-${i}`} className="fill-gold text-gold" />);
    }

    // Add half star if needed
    if (hasHalfStar) {
      stars.push(<StarHalf key="half-star" className="fill-gold text-gold" />);
    }

    // Add empty stars to make total of 5
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<Star key={`empty-${i}`} className="text-gold" />);
    }

    return stars;
  };

  // Handle add to cart
  const handleAddToCart = async () => {
    if (!user) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to add items to your cart",
        variant: "destructive",
      });
      return;
    }

    setIsAddingToCart(true);
    try {
      await apiRequest("POST", "/api/cart", {
        productId: product.id,
        quantity: 1,
      });
      
      toast({
        title: "Added to cart",
        description: `${product.name} has been added to your cart`,
      });
      
      // Refetch cart items to update count
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      
      // Get updated cart count
      const response = await fetch("/api/cart", {
        credentials: "include",
      });
      
      if (response.ok) {
        const cartItems = await response.json();
        setCartCount(cartItems.length);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add item to cart",
        variant: "destructive",
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  return (
    <div className="product-card bg-white rounded-lg overflow-hidden shadow">
      <div className="relative">
        <Link href={`/products/${product.id}`}>
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-64 object-cover hover:scale-105 transition-transform duration-300"
          />
        </Link>
        <button className="absolute top-4 right-4 text-dark-grey hover:text-gold">
          <Heart className="h-5 w-5" />
        </button>
        {product.isNew && (
          <div className="absolute top-4 left-4 bg-gold text-rich-black text-xs px-2 py-1 rounded">
            New
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="text-sm text-gray-500 mb-1">{product.brand}</div>
        <Link href={`/products/${product.id}`}>
          <h3 className="font-playfair text-xl font-medium mb-2 hover:text-gold transition">
            {product.name}
          </h3>
        </Link>
        <div className="flex items-center mb-3">
          <div className="flex">
            {renderStars(product.averageRating)}
          </div>
          <span className="text-sm text-gray-500 ml-2">
            ({product.reviews?.length || 0})
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="font-semibold text-lg">${product.price.toFixed(2)}</span>
          <Button
            onClick={handleAddToCart}
            disabled={isAddingToCart}
            className="bg-gold text-rich-black hover:bg-metallic-gold"
          >
            {isAddingToCart ? (
              <span className="flex items-center">
                <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-rich-black rounded-full"></span>
                Adding...
              </span>
            ) : (
              "Add to Cart"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
