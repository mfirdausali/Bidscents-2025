import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProductWithDetails } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductCard } from "@/components/ui/product-card";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { Input } from "@/components/ui/input";
import { Loader2, Star, StarHalf, Heart } from "lucide-react";

export default function HomePage() {
  const [sortOption, setSortOption] = useState("featured");
  const [email, setEmail] = useState("");

  // Fetch featured products
  const { data: featuredProducts, isLoading } = useQuery<ProductWithDetails[]>({
    queryKey: ["/api/products/featured"],
  });

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real application, we would handle the subscription here
    alert(`Thank you for subscribing with ${email}`);
    setEmail("");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      {/* Hero Section */}
      <section className="relative h-[500px] bg-cover bg-center" 
        style={{ 
          backgroundImage: "url('https://images.unsplash.com/photo-1600612253971-422e7f7faeb6?ixlib=rb-1.2.1&auto=format&fit=crop&w=1200&q=80')" 
        }}
      >
        <div className="absolute inset-0 bg-rich-black opacity-50"></div>
        <div className="container mx-auto px-6 relative h-full flex flex-col justify-center text-white">
          <h1 className="font-playfair text-4xl md:text-5xl lg:text-6xl font-bold mb-4">Discover Your Signature Scent</h1>
          <p className="font-lato text-lg md:text-xl mb-8 max-w-xl">Explore our curated collection of premium fragrances from iconic brands and independent perfumers.</p>
          <div>
            <Link href="/products">
              <Button className="bg-gold text-rich-black px-8 py-6 rounded-full font-medium hover:bg-metallic-gold transition">
                Shop Now
              </Button>
            </Link>
            <Button variant="outline" className="ml-4 text-white border border-white px-8 py-6 rounded-full font-medium hover:bg-white hover:text-rich-black transition">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Featured Categories */}
      <section className="container mx-auto px-6 py-12">
        <h2 className="font-playfair text-3xl font-bold text-center mb-8">Explore Categories</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Category 1 */}
          <div className="relative h-64 rounded-lg overflow-hidden group cursor-pointer">
            <Link href="/products?category=1">
              <img 
                src="https://images.unsplash.com/photo-1590736969997-f5d7c4fbdfac?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80" 
                alt="Women's Fragrances" 
                className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-rich-black/80 flex items-end p-6">
                <div>
                  <h3 className="text-white font-playfair text-2xl mb-2">Women's Fragrances</h3>
                  <span className="text-gold group-hover:underline">Explore Collection →</span>
                </div>
              </div>
            </Link>
          </div>
          
          {/* Category 2 */}
          <div className="relative h-64 rounded-lg overflow-hidden group cursor-pointer">
            <Link href="/products?category=2">
              <img 
                src="https://images.unsplash.com/photo-1547887538-6b3c3359f36a?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80" 
                alt="Men's Fragrances" 
                className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-rich-black/80 flex items-end p-6">
                <div>
                  <h3 className="text-white font-playfair text-2xl mb-2">Men's Fragrances</h3>
                  <span className="text-gold group-hover:underline">Explore Collection →</span>
                </div>
              </div>
            </Link>
          </div>
          
          {/* Category 3 */}
          <div className="relative h-64 rounded-lg overflow-hidden group cursor-pointer">
            <Link href="/products?category=4">
              <img 
                src="https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80" 
                alt="Niche Fragrances" 
                className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-rich-black/80 flex items-end p-6">
                <div>
                  <h3 className="text-white font-playfair text-2xl mb-2">Niche Fragrances</h3>
                  <span className="text-gold group-hover:underline">Explore Collection →</span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="bg-gray-50 py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8">
            <h2 className="font-playfair text-3xl font-bold">Trending Now</h2>
            <div className="mt-4 md:mt-0">
              <Select value={sortOption} onValueChange={setSortOption}>
                <SelectTrigger className="w-full px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-1 focus:ring-gold">
                  <SelectValue placeholder="Sort by: Featured" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="featured">Sort by: Featured</SelectItem>
                  <SelectItem value="low">Price: Low to High</SelectItem>
                  <SelectItem value="high">Price: High to Low</SelectItem>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="bestselling">Best Selling</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-gold" />
            </div>
          ) : featuredProducts && featuredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p>No featured products available at the moment.</p>
            </div>
          )}
          
          <div className="flex justify-center mt-10">
            <Link href="/products">
              <Button variant="outline" className="border border-gold text-gold px-8 py-6 rounded-full font-medium hover:bg-gold hover:text-rich-black transition">
                View All Products
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Product */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <img 
                src="https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80" 
                alt="Dior J'adore" 
                className="rounded-lg shadow-xl w-full"
              />
            </div>
            <div>
              <div className="text-sm text-gold mb-2 uppercase tracking-wider">Featured Product</div>
              <h2 className="font-playfair text-4xl font-bold mb-4">Dior J'adore</h2>
              <div className="flex items-center mb-4">
                <div className="flex text-gold">
                  <Star className="fill-gold" />
                  <Star className="fill-gold" />
                  <Star className="fill-gold" />
                  <Star className="fill-gold" />
                  <StarHalf className="fill-gold" />
                </div>
                <span className="text-sm text-gray-500 ml-2">(189 reviews)</span>
              </div>
              <p className="text-gray-600 mb-6">
                J'adore is an iconic fragrance that celebrates the renaissance of extreme femininity and the power of spontaneous emotion with a modern, neo-classical composition.
              </p>
              <div className="mb-6">
                <div className="font-medium mb-2">Key Notes:</div>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-gray-100 px-3 py-1 rounded-full text-sm">Ylang-Ylang</span>
                  <span className="bg-gray-100 px-3 py-1 rounded-full text-sm">Damascus Rose</span>
                  <span className="bg-gray-100 px-3 py-1 rounded-full text-sm">Jasmine</span>
                </div>
              </div>
              <div className="mb-6">
                <div className="font-medium mb-2">Size:</div>
                <div className="flex space-x-3">
                  <Button variant="outline" className="border border-gold text-dark-grey hover:bg-gold hover:text-rich-black">30ml</Button>
                  <Button className="bg-gold text-rich-black">50ml</Button>
                  <Button variant="outline" className="border border-gold text-dark-grey hover:bg-gold hover:text-rich-black">100ml</Button>
                </div>
              </div>
              <div className="flex items-center justify-between mb-8">
                <span className="text-2xl font-semibold">$150.00</span>
              </div>
              <div className="flex space-x-4">
                <Button className="bg-rich-black text-white hover:bg-metallic-gold hover:text-rich-black flex-grow py-6 rounded-full">
                  Add to Cart
                </Button>
                <Button variant="outline" className="border border-rich-black text-rich-black hover:bg-rich-black hover:text-white px-4 py-6 rounded-full">
                  <Heart className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-6">
          <h2 className="font-playfair text-3xl font-bold text-center mb-12">What Our Customers Say</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex text-gold mb-4">
                <Star className="fill-gold" />
                <Star className="fill-gold" />
                <Star className="fill-gold" />
                <Star className="fill-gold" />
                <Star className="fill-gold" />
              </div>
              <p className="text-gray-600 italic mb-4">
                "The selection of niche perfumes is outstanding. I found scents here that I couldn't find anywhere else. The detailed descriptions helped me make the perfect choice."
              </p>
              <div className="flex items-center">
                <div className="w-12 h-12 bg-gray-200 rounded-full overflow-hidden mr-4">
                  <img src="https://i.pravatar.cc/100?img=32" alt="Customer" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="font-medium">Sarah Johnson</div>
                  <div className="text-sm text-gray-500">Perfume Enthusiast</div>
                </div>
              </div>
            </div>
            
            {/* Testimonial 2 */}
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex text-gold mb-4">
                <Star className="fill-gold" />
                <Star className="fill-gold" />
                <Star className="fill-gold" />
                <Star className="fill-gold" />
                <Star className="fill-gold" />
              </div>
              <p className="text-gray-600 italic mb-4">
                "As a seller, I've been able to reach a wider audience for my artisanal perfumes. The platform is intuitive and makes managing my product listings incredibly easy."
              </p>
              <div className="flex items-center">
                <div className="w-12 h-12 bg-gray-200 rounded-full overflow-hidden mr-4">
                  <img src="https://i.pravatar.cc/100?img=58" alt="Customer" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="font-medium">David Chen</div>
                  <div className="text-sm text-gray-500">Independent Perfumer</div>
                </div>
              </div>
            </div>
            
            {/* Testimonial 3 */}
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex text-gold mb-4">
                <Star className="fill-gold" />
                <Star className="fill-gold" />
                <Star className="fill-gold" />
                <Star className="fill-gold" />
                <StarHalf className="fill-gold" />
              </div>
              <p className="text-gray-600 italic mb-4">
                "The shopping experience is seamless from browsing to checkout. I appreciate the detailed information about each fragrance's notes and longevity. Will shop here again!"
              </p>
              <div className="flex items-center">
                <div className="w-12 h-12 bg-gray-200 rounded-full overflow-hidden mr-4">
                  <img src="https://i.pravatar.cc/100?img=26" alt="Customer" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="font-medium">Emma Thompson</div>
                  <div className="text-sm text-gray-500">Loyal Customer</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Email Signup */}
      <section className="py-16 bg-rich-black">
        <div className="container mx-auto px-6 text-center">
          <h2 className="font-playfair text-3xl text-white font-bold mb-4">Join Our Fragrance Community</h2>
          <p className="text-gray-300 mb-8 max-w-xl mx-auto">
            Subscribe to receive exclusive offers, early access to new releases, and expert fragrance recommendations.
          </p>
          <form onSubmit={handleSubscribe} className="max-w-md mx-auto flex flex-col sm:flex-row">
            <Input
              type="email"
              placeholder="Your email address"
              className="flex-grow px-4 py-3 rounded-full sm:rounded-r-none mb-3 sm:mb-0 text-black"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" className="bg-gold text-rich-black px-6 py-3 rounded-full sm:rounded-l-none font-medium hover:bg-metallic-gold transition">
              Subscribe
            </Button>
          </form>
          <p className="text-gray-400 text-sm mt-4">
            By subscribing, you agree to our Privacy Policy and consent to receive updates.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
