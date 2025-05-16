import { useState, useEffect } from "react";
import { ProductWithDetails } from "@shared/schema";
import { Button } from "./button";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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
        // Calculate the new index ensuring it's a multiple of 2
        const newIndex = prevIndex === 0 
          ? Math.floor((featuredProducts.length - 1) / 2) * 2 
          : prevIndex - 2;
        return newIndex;
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
        // Calculate the new index ensuring it's a multiple of 2
        const maxStartIndex = Math.floor((featuredProducts.length - 1) / 2) * 2;
        const newIndex = prevIndex >= maxStartIndex ? 0 : prevIndex + 2;
        return newIndex;
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
  }, [featuredProducts, currentIndex, isTransitioning]);

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
  // Get second product or undefined if not available
  const secondProduct = currentIndex + 1 < featuredProducts.length ? 
    featuredProducts[currentIndex + 1] : featuredProducts[0];

  // Calculate the number of pagination dots (each dot represents a pair of products)
  const paginationDotsCount = Math.ceil(featuredProducts.length / 2);
  const paginationDotIndices = Array.from({ length: paginationDotsCount }, (_, i) => i * 2);

  return (
    <section className="py-8 lg:py-16 bg-white">
      <div className="container mx-auto px-4 lg:px-6">
        <h2 className="font-playfair text-2xl lg:text-3xl font-bold mb-6 lg:mb-10 text-center">Featured Products</h2>
        
        <div className="relative max-w-6xl mx-auto">
          {/* Fixed width container to prevent resizing */}
          <div className="overflow-hidden">
            {/* Apply smooth transition */}
            <div className={`transition-all duration-700 ease-in-out ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
              <div className="space-y-8 lg:space-y-12">
                {/* First Product - Image Left, Text Right */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center min-h-[250px] lg:min-h-[300px]">
                  <div className="h-60 lg:h-72 w-full">
                    <img 
                      src={getProductImageUrl(firstProduct)} 
                      alt={firstProduct.name} 
                      className="rounded-lg shadow-xl w-full h-full object-cover transition-opacity duration-700 ease-in-out"
                    />
                  </div>
                  <div className="flex flex-col h-full">
                    <div className="text-sm bg-gold text-rich-black px-3 py-1 rounded-full inline-block mb-2 uppercase tracking-wider">Featured</div>
                    <h3 className="font-playfair text-2xl lg:text-3xl font-bold mb-2 line-clamp-2">{firstProduct.name}</h3>
                    <div className="text-xl text-gold mb-3">RM {firstProduct.price.toFixed(2)}</div>
                    
                    {/* Additional details on desktop */}
                    <div className="hidden lg:grid grid-cols-2 gap-3 mb-4">
                      {firstProduct.volume && (
                        <div className="bg-gray-100 p-2 rounded-md">
                          <div className="text-xs text-gray-500">Volume</div>
                          <div className="font-medium truncate text-sm">{firstProduct.volume}</div>
                        </div>
                      )}
                      <div className="bg-gray-100 p-2 rounded-md">
                        <div className="text-xs text-gray-500">Fullness</div>
                        <div className="font-medium truncate text-sm">{firstProduct.remainingPercentage || 100}% Remaining</div>
                      </div>
                    </div>
                    
                    <p className="text-gray-600 mb-4 line-clamp-2">
                      {firstProduct.description || "No description available."}
                    </p>
                    
                    <div className="mt-auto">
                      <Link href={`/products/${firstProduct.id}`} className="w-full">
                        <Button 
                          className="w-full bg-purple-600 text-white hover:bg-purple-700 py-3 rounded-full"
                        >
                          View Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Second Product - Image Right, Text Left (reversed on mobile) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center min-h-[250px] lg:min-h-[300px]">
                  <div className="flex flex-col h-full order-2 lg:order-1">
                    <div className="text-sm bg-gold text-rich-black px-3 py-1 rounded-full inline-block mb-2 uppercase tracking-wider">Featured</div>
                    <h3 className="font-playfair text-2xl lg:text-3xl font-bold mb-2 line-clamp-2">{secondProduct.name}</h3>
                    <div className="text-xl text-gold mb-3">RM {secondProduct.price.toFixed(2)}</div>
                    
                    {/* Additional details on desktop */}
                    <div className="hidden lg:grid grid-cols-2 gap-3 mb-4">
                      {secondProduct.volume && (
                        <div className="bg-gray-100 p-2 rounded-md">
                          <div className="text-xs text-gray-500">Volume</div>
                          <div className="font-medium truncate text-sm">{secondProduct.volume}</div>
                        </div>
                      )}
                      <div className="bg-gray-100 p-2 rounded-md">
                        <div className="text-xs text-gray-500">Fullness</div>
                        <div className="font-medium truncate text-sm">{secondProduct.remainingPercentage || 100}% Remaining</div>
                      </div>
                    </div>
                    
                    <p className="text-gray-600 mb-4 line-clamp-2">
                      {secondProduct.description || "No description available."}
                    </p>
                    
                    <div className="mt-auto">
                      <Link href={`/products/${secondProduct.id}`} className="w-full">
                        <Button 
                          className="w-full bg-purple-600 text-white hover:bg-purple-700 py-3 rounded-full"
                        >
                          View Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <div className="h-60 lg:h-72 w-full order-1 lg:order-2">
                    <img 
                      src={getProductImageUrl(secondProduct)} 
                      alt={secondProduct.name} 
                      className="rounded-lg shadow-xl w-full h-full object-cover transition-opacity duration-700 ease-in-out"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Only show navigation arrows if we have more than 2 products */}
          {featuredProducts.length > 2 && (
            <>
              {/* Navigation arrows */}
              <button 
                className="absolute top-1/2 left-3 transform -translate-y-1/2 bg-rich-black bg-opacity-70 text-white p-2 rounded-full hover:bg-gold hover:text-rich-black transition z-10"
                onClick={handlePrev}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button 
                className="absolute top-1/2 right-3 transform -translate-y-1/2 bg-rich-black bg-opacity-70 text-white p-2 rounded-full hover:bg-gold hover:text-rich-black transition z-10"
                onClick={handleNext}
              >
                <ArrowRight className="h-5 w-5" />
              </button>
              
              {/* Pagination dots */}
              <div className="mt-8 flex justify-center items-center">
                <div className="flex space-x-2">
                  {paginationDotIndices.map((dotIndex) => (
                    <button
                      key={dotIndex}
                      className={`w-3 h-3 mx-1 rounded-full transition-colors duration-300 ${
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