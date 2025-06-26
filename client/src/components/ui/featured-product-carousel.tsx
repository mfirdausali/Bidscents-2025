import { useState, useEffect } from "react";
import { ProductWithDetails } from "@shared/schema";
import { Button } from "./button";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-supabase-auth";
import { useToast } from "@/hooks/use-toast";

export function FeaturedProductCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch featured products
  const { data: featuredProducts } = useQuery<ProductWithDetails[]>({
    queryKey: ["/api/products/featured"],
  });

  const handlePrev = () => {
    if (!featuredProducts || featuredProducts.length < 2 || isTransitioning) return;
    
    // Start transition animation
    setIsTransitioning(true);
    
    // After a brief fade out, change the product pair
    setTimeout(() => {
      setCurrentIndex((prevIndex) => {
        // Calculate the new index ensuring we don't exceed bounds
        if (prevIndex === 0) {
          // Go to the last valid starting position (might be odd number)
          const lastValidIndex = featuredProducts.length % 2 === 0 
            ? featuredProducts.length - 2 
            : featuredProducts.length - 1;
          return lastValidIndex;
        } else {
          return prevIndex - 2;
        }
      });
      
      // Allow time for the new products to render before fading back in
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 350);
  };

  const handleNext = () => {
    if (!featuredProducts || featuredProducts.length < 2 || isTransitioning) return;
    
    // Start transition animation
    setIsTransitioning(true);
    
    // After a brief fade out, change the product pair
    setTimeout(() => {
      setCurrentIndex((prevIndex) => {
        // Calculate the new index ensuring we have at least one product to show
        const nextIndex = prevIndex + 2;
        
        // If the next index would show us past the end, wrap to beginning
        if (nextIndex >= featuredProducts.length) {
          return 0;
        }
        
        return nextIndex;
      });
      
      // Allow time for the new products to render before fading back in
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 350);
  };

  // Auto-advance carousel every 10 seconds (longer time on each product)
  useEffect(() => {
    if (!featuredProducts || featuredProducts.length < 2) return;

    const intervalId = setInterval(() => {
      // Don't auto-advance if already in transition
      if (!isTransitioning) {
        handleNext();
      }
    }, 10000); // 10 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, [featuredProducts, isTransitioning]); // Removed currentIndex to prevent re-creating interval

  if (!featuredProducts || featuredProducts.length === 0) {
    return null;
  }

  // Helper function to get product image URL
  const getProductImageUrl = (product: ProductWithDetails) => {
    if (product.images && product.images.find(img => img.imageOrder === 0)) {
      return `/api/images/${product.images.find(img => img.imageOrder === 0)?.imageUrl}`;
    } else if (product.images && product.images.length > 0) {
      return `/api/images/${product.images[0].imageUrl}`;
    } else {
      return `/api/images/${product.imageUrl}`;
    }
  };

  // Get current pair of products to display
  const firstProduct = featuredProducts[currentIndex];
  // Get second product only if available and different from first
  const secondProduct = currentIndex + 1 < featuredProducts.length ? 
    featuredProducts[currentIndex + 1] : null;

  // Calculate the number of pagination dots (each dot represents a pair of products)
  const paginationDotsCount = Math.ceil(featuredProducts.length / 2);
  const paginationDotIndices = Array.from({ length: paginationDotsCount }, (_, i) => i * 2);

  return (
    <section className="pb-4 lg:pb-8 bg-white">
      <div className="container mx-auto px-4 lg:px-6">
        <h2 className="font-playfair text-2xl lg:text-3xl font-bold mb-3 lg:mb-5 text-center">Featured Products</h2>
        
        <div className="relative max-w-6xl mx-auto">
          {/* Fixed width container to prevent resizing */}
          <div className="overflow-hidden">
            {/* Apply smooth transition */}
            <div className={`transition-all duration-700 ease-in-out ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
              <div className={`grid grid-cols-1 ${secondProduct ? 'md:grid-cols-2' : 'md:grid-cols-1 max-w-md mx-auto'} gap-6 lg:gap-8 min-h-[400px] lg:min-h-[500px]`}>
                {/* First Product */}
                <div className="flex flex-col h-full bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                  <div className="relative h-48 md:h-64 overflow-hidden rounded-t-lg">
                    <div className="absolute top-0 left-0 z-10 m-2 flex gap-2">
                      <div className="text-xs bg-gold text-rich-black px-2 py-1 rounded-full uppercase tracking-wider">
                        Featured
                      </div>
                      {firstProduct.listingType === "auction" && (
                        <div className="text-xs bg-amber-500 text-white px-2 py-1 rounded-full uppercase tracking-wider">
                          Auction
                        </div>
                      )}
                    </div>
                    <img 
                      src={getProductImageUrl(firstProduct)} 
                      alt={firstProduct.name} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 p-4 flex flex-col">
                    <h3 className="font-playfair text-lg font-bold mb-2 line-clamp-2">{firstProduct.name}</h3>
                    <p className="text-gold font-medium mb-3">RM {firstProduct.price.toFixed(2)}</p>
                    <div className="mb-3 text-sm text-gray-600 line-clamp-2">
                      {firstProduct.description || "No description available."}
                    </div>
                    <div className="mt-auto">
                      {firstProduct.listingType === "auction" && firstProduct.auction ? (
                        <Link href={`/auctions/${firstProduct.auction.id}`} className="w-full">
                          <Button 
                            className="w-full bg-amber-500 text-white hover:bg-amber-600 rounded-full text-sm"
                          >
                            Bid Now
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/products/${firstProduct.id}`} className="w-full">
                          <Button 
                            className="w-full bg-purple-600 text-white hover:bg-purple-700 rounded-full text-sm"
                          >
                            View Details
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {/* Second Product - only render if it exists */}
                {secondProduct && (
                  <div className="flex flex-col h-full bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                    <div className="relative h-48 md:h-64 overflow-hidden rounded-t-lg">
                      <div className="absolute top-0 left-0 z-10 m-2 flex gap-2">
                        <div className="text-xs bg-gold text-rich-black px-2 py-1 rounded-full uppercase tracking-wider">
                          Featured
                        </div>
                        {secondProduct.listingType === "auction" && (
                          <div className="text-xs bg-amber-500 text-white px-2 py-1 rounded-full uppercase tracking-wider">
                            Auction
                          </div>
                        )}
                      </div>
                      <img 
                        src={getProductImageUrl(secondProduct)} 
                        alt={secondProduct.name} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 p-4 flex flex-col">
                      <h3 className="font-playfair text-lg font-bold mb-2 line-clamp-2">{secondProduct.name}</h3>
                      <p className="text-gold font-medium mb-3">RM {secondProduct.price.toFixed(2)}</p>
                      <div className="mb-3 text-sm text-gray-600 line-clamp-2">
                        {secondProduct.description || "No description available."}
                      </div>
                      <div className="mt-auto">
                        {secondProduct.listingType === "auction" && secondProduct.auction ? (
                          <Link href={`/auctions/${secondProduct.auction.id}`} className="w-full">
                            <Button 
                              className="w-full bg-amber-500 text-white hover:bg-amber-600 rounded-full text-sm"
                            >
                              Bid Now
                            </Button>
                          </Link>
                        ) : (
                          <Link href={`/products/${secondProduct.id}`} className="w-full">
                            <Button 
                              className="w-full bg-purple-600 text-white hover:bg-purple-700 rounded-full text-sm"
                            >
                              View Details
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Only show navigation arrows if we have more than 1 product */}
          {featuredProducts.length > 1 && (
            <>
              {/* Navigation arrows */}
              <button 
                className="absolute top-1/2 left-2 md:left-4 transform -translate-y-1/2 bg-rich-black bg-opacity-70 text-white p-2 rounded-full hover:bg-gold hover:text-rich-black transition z-10"
                onClick={handlePrev}
              >
                <ArrowLeft className="h-4 w-4 md:h-6 md:w-6" />
              </button>
              <button 
                className="absolute top-1/2 right-2 md:right-4 transform -translate-y-1/2 bg-rich-black bg-opacity-70 text-white p-2 rounded-full hover:bg-gold hover:text-rich-black transition z-10"
                onClick={handleNext}
              >
                <ArrowRight className="h-4 w-4 md:h-6 md:w-6" />
              </button>
              
              {/* Pagination dots */}
              <div className="mt-6 flex justify-center items-center">
                <div className="flex space-x-2">
                  {paginationDotIndices.map((dotIndex) => (
                    <button
                      key={dotIndex}
                      className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                        dotIndex === currentIndex ? 'bg-gold' : 'bg-gray-300'
                      }`}
                      onClick={() => {
                        if (isTransitioning || dotIndex === currentIndex) return;
                        
                        // Start transition animation
                        setIsTransitioning(true);
                        
                        // After a brief fade out, change to the product pair
                        setTimeout(() => {
                          setCurrentIndex(dotIndex);
                          
                          // Allow time for the new products to render before fading back in
                          setTimeout(() => {
                            setIsTransitioning(false);
                          }, 50);
                        }, 350);
                      }}
                      aria-label={`Go to products ${dotIndex + 1} and ${dotIndex + 2}`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}