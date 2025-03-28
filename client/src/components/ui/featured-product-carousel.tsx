import { useState, useEffect } from "react";
import { ProductWithDetails } from "@shared/schema";
import { Button } from "./button";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Star, StarHalf, ArrowLeft, ArrowRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export function FeaturedProductCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { user, setCartCount } = useAuth();
  const { toast } = useToast();

  // Fetch featured products
  const { data: featuredProducts } = useQuery<ProductWithDetails[]>({
    queryKey: ["/api/products/featured"],
  });

  const handlePrev = () => {
    if (!featuredProducts || featuredProducts.length === 0 || isTransitioning) return;
    
    // Start transition animation
    setIsTransitioning(true);
    
    // After a brief fade out, change the product
    setTimeout(() => {
      setCurrentIndex((prevIndex) => 
        prevIndex === 0 ? featuredProducts.length - 1 : prevIndex - 1
      );
      
      // Allow time for the new product to render before fading back in
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 350);
  };

  const handleNext = () => {
    if (!featuredProducts || featuredProducts.length === 0 || isTransitioning) return;
    
    // Start transition animation
    setIsTransitioning(true);
    
    // After a brief fade out, change the product
    setTimeout(() => {
      setCurrentIndex((prevIndex) => 
        prevIndex === featuredProducts.length - 1 ? 0 : prevIndex + 1
      );
      
      // Allow time for the new product to render before fading back in
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 350);
  };

  // Auto-advance carousel every 10 seconds (longer time on each product)
  useEffect(() => {
    if (!featuredProducts || featuredProducts.length <= 1) return;

    const intervalId = setInterval(() => {
      // Don't auto-advance if already in transition
      if (!isTransitioning) {
        handleNext();
      }
    }, 10000); // Increased from 5000 to 10000 ms

    return () => {
      clearInterval(intervalId);
    };
  }, [featuredProducts, currentIndex, isTransitioning]);

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
  const handleAddToCart = async (product: ProductWithDetails) => {
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

  if (!featuredProducts || featuredProducts.length === 0) {
    return null;
  }

  const currentProduct = featuredProducts[currentIndex];

  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-6">
        <h2 className="font-playfair text-3xl font-bold mb-8 text-center">Featured Products</h2>
        
        <div className="relative max-w-6xl mx-auto">
          {/* Fixed width container to prevent resizing */}
          <div className="overflow-hidden">
            {/* Apply smooth transition */}
            <div className={`transition-all duration-700 ease-in-out ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center min-h-[600px]">
                <div className="h-96">
                  <img 
                    src={currentProduct.imageUrl} 
                    alt={currentProduct.name} 
                    className="rounded-lg shadow-xl w-full h-full object-cover transition-opacity duration-700 ease-in-out"
                  />
                </div>
                <div className="min-h-[500px] flex flex-col">
                  <div className="text-sm bg-gold text-rich-black px-3 py-1 rounded-full inline-block mb-2 uppercase tracking-wider">Featured Listing</div>
                  <h2 className="font-playfair text-4xl font-bold mb-3 line-clamp-2 h-[80px]">{currentProduct.name}</h2>
                  <div className="text-xl text-gold">RM {currentProduct.price.toFixed(2)}</div>
                  
                  <div className="flex items-center mb-4">
                    <div className="flex text-gold">
                      {renderStars(currentProduct.averageRating)}
                    </div>
                    <span className="text-sm text-gray-500 ml-2">
                      ({currentProduct.reviews?.length || 0} reviews)
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                    {currentProduct.volume && (
                      <div className="bg-gray-100 p-3 rounded-md">
                        <div className="text-xs text-gray-500">Volume</div>
                        <div className="font-medium">{currentProduct.volume}</div>
                      </div>
                    )}
                    <div className="bg-gray-100 p-3 rounded-md">
                      <div className="text-xs text-gray-500">Fullness</div>
                      <div className="font-medium">{currentProduct.remainingPercentage || 100}% Remaining</div>
                    </div>
                    {currentProduct.batchCode && (
                      <div className="bg-gray-100 p-3 rounded-md">
                        <div className="text-xs text-gray-500">Batch Code</div>
                        <div className="font-medium">{currentProduct.batchCode}</div>
                      </div>
                    )}
                    {currentProduct.boxCondition && (
                      <div className="bg-gray-100 p-3 rounded-md">
                        <div className="text-xs text-gray-500">Box Condition</div>
                        <div className="font-medium">{currentProduct.boxCondition}</div>
                      </div>
                    )}
                    {currentProduct.listingType && (
                      <div className="bg-gray-100 p-3 rounded-md">
                        <div className="text-xs text-gray-500">Listing Type</div>
                        <div className="font-medium">
                          {currentProduct.listingType.charAt(0).toUpperCase() + currentProduct.listingType.slice(1)}
                        </div>
                      </div>
                    )}
                    <div className="bg-gray-100 p-3 rounded-md">
                      <div className="text-xs text-gray-500">Seller</div>
                      <div className="font-medium flex items-center">
                        {currentProduct.seller?.username || "Unknown"}
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-gray-600 mb-6 h-[80px] overflow-y-auto line-clamp-4">
                    {currentProduct.description || "No description available."}
                  </p>
                  
                  <div className="mt-auto flex space-x-4">
                    <Button 
                      className="bg-rich-black text-white hover:bg-metallic-gold hover:text-rich-black flex-grow py-6 rounded-full"
                      onClick={() => handleAddToCart(currentProduct)}
                      disabled={isAddingToCart}
                    >
                      {isAddingToCart ? "Adding..." : (
                        currentProduct.listingType === "auction" ? "Bid Now" : "Add to Cart"
                      )}
                    </Button>
                    <Link href={`/products/${currentProduct.id}`}>
                      <Button 
                        variant="outline" 
                        className="border border-rich-black text-rich-black hover:bg-rich-black hover:text-white px-6 py-6 rounded-full"
                      >
                        View Details
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Navigation arrows */}
          <button 
            className="absolute top-1/2 left-4 transform -translate-y-1/2 bg-rich-black bg-opacity-70 text-white p-2 rounded-full hover:bg-gold hover:text-rich-black transition z-10"
            onClick={handlePrev}
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <button 
            className="absolute top-1/2 right-4 transform -translate-y-1/2 bg-rich-black bg-opacity-70 text-white p-2 rounded-full hover:bg-gold hover:text-rich-black transition z-10"
            onClick={handleNext}
          >
            <ArrowRight className="h-6 w-6" />
          </button>
          
          {/* Carousel dots and navigation buttons */}
          <div className="mt-8 flex justify-center items-center">
            {/* Left navigation button */}
            <button 
              className="bg-rich-black text-gray-700 h-8 w-8 rounded-full flex items-center justify-center mr-4 hover:bg-gold hover:text-rich-black transition"
              onClick={handlePrev}
              aria-label="Previous"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            
            {/* Dots */}
            <div className="flex">
              {featuredProducts.map((_, index) => (
                <button
                  key={index}
                  className={`w-3 h-3 mx-1 rounded-full transition-colors duration-300 ${
                    index === currentIndex ? 'bg-gold' : 'bg-gray-300'
                  }`}
                  onClick={() => {
                    if (isTransitioning || index === currentIndex) return;
                    
                    // Start transition animation
                    setIsTransitioning(true);
                    
                    // After a brief fade out, change the product
                    setTimeout(() => {
                      setCurrentIndex(index);
                      
                      // Allow time for the new product to render before fading back in
                      setTimeout(() => {
                        setIsTransitioning(false);
                      }, 50);
                    }, 350);
                  }}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
            
            {/* Right navigation button */}
            <button 
              className="bg-rich-black text-gray-700 h-8 w-8 rounded-full flex items-center justify-center ml-4 hover:bg-gold hover:text-rich-black transition"
              onClick={handleNext}
              aria-label="Next"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}