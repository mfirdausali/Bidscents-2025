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
import { Loader2, Star, StarHalf, Diamond, MapPin, Flame } from "lucide-react";
import { FeaturedProductCarousel } from "@/components/ui/featured-product-carousel";

export default function HomePage() {
  const [sortOption, setSortOption] = useState("featured");
  const [email, setEmail] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch all products to get the most recent ones
  const { data: allProducts, isLoading } = useQuery<ProductWithDetails[]>({
    queryKey: ["/api/products"],
  });

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real application, we would handle the subscription here
    alert(`Thank you for subscribing with ${email}`);
    setEmail("");
  };
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.href = `/products?search=${encodeURIComponent(searchQuery)}`;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      {/* Hero Section */}
      <section className="relative h-[300px] bg-cover bg-center" 
        style={{ 
          backgroundImage: "url('https://images.unsplash.com/photo-1594035910387-fea47794261f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8NHx8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60')" 
        }}
      >
        <div className="absolute inset-0 bg-black opacity-50"></div>
        <div className="container mx-auto px-6 relative h-full flex flex-col justify-center text-white">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Discover Your Signature Scent</h1>
          <p className="text-base md:text-lg mb-4 max-w-xl">Explore authentic pre-owned luxury perfumes at incredible prices</p>
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 max-w-lg">
            <div className="relative flex-grow">
              <Input
                type="text"
                placeholder="Search for perfumes, brands..."
                className="search-bar pl-4 pr-4 py-2 w-full bg-white border-0 rounded-full text-gray-800"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-full shadow-sm">
              Start Shopping
            </Button>
          </form>
        </div>
      </section>

      {/* Browse Categories */}
      <section className="container mx-auto px-6 py-6">
        <h2 className="text-xl font-bold mb-4">Browse Categories</h2>
        
        <div className="grid grid-cols-4 md:grid-cols-4 gap-3">
          {/* Designer category (ID: 1) */}
          <Link href="/products?category=1" className="flex flex-col items-center hover:text-purple-600 transition-colors">
            <div className="category-icon mb-2 bg-purple-50 rounded-full p-3 shadow-sm border border-purple-100">
              <Diamond className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-xs text-center font-medium">Designer</span>
          </Link>
          
          {/* Local category (ID: 2) */}
          <Link href="/products?category=2" className="flex flex-col items-center hover:text-purple-600 transition-colors">
            <div className="category-icon mb-2 bg-purple-50 rounded-full p-3 shadow-sm border border-purple-100">
              <MapPin className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-xs text-center font-medium">Local</span>
          </Link>
          
          {/* Arabian House category (ID: 3) */}
          <Link href="/products?category=3" className="flex flex-col items-center hover:text-purple-600 transition-colors">
            <div className="category-icon mb-2 bg-purple-50 rounded-full p-3 shadow-sm border border-purple-100">
              <Flame className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-xs text-center font-medium">Arabian House</span>
          </Link>
          
          {/* Niche category (ID: 4) */}
          <Link href="/products?category=4" className="flex flex-col items-center hover:text-purple-600 transition-colors">
            <div className="category-icon mb-2 bg-purple-50 rounded-full p-3 shadow-sm border border-purple-100">
              <Star className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-xs text-center font-medium">Niche</span>
          </Link>
        </div>
      </section>

      {/* Auction Listings */}
      <section className="container mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Live Auctions</h2>
          <Link href="/products?type=auction" className="text-purple-600 hover:text-purple-800 flex items-center">
            View All <span className="ml-1">→</span>
          </Link>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        ) : allProducts && allProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {/* Display the 3 auction products */}
            {[...allProducts]
              .filter(product => product.listingType === 'auction')
              .sort((a, b) => {
                // If createdAt exists, use it for sorting; otherwise, use id
                if (a.createdAt && b.createdAt) {
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                }
                return b.id - a.id; // Fallback to id sorting (assuming higher id = more recent)
              })
              .slice(0, 3)
              .map((product) => (
                <ProductCard key={product.id} product={product} />
              ))
            }
          </div>
        ) : (
          <div className="text-center py-8">
            <p>No auction listings available at the moment.</p>
          </div>
        )}
      </section>
      
      {/* Recent Listings */}
      <section className="container mx-auto px-6 py-8 bg-gray-50">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Recent Listings</h2>
          <Link href="/products" className="text-purple-600 hover:text-purple-800 flex items-center">
            View All <span className="ml-1">→</span>
          </Link>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        ) : allProducts && allProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {/* Display the 6 most recent non-auction products */}
            {[...allProducts]
              .filter(product => product.listingType !== 'auction')
              .sort((a, b) => {
                // If createdAt exists, use it for sorting; otherwise, use id
                if (a.createdAt && b.createdAt) {
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                }
                return b.id - a.id; // Fallback to id sorting (assuming higher id = more recent)
              })
              .slice(0, 6)
              .map((product) => (
                <ProductCard key={product.id} product={product} />
              ))
            }
          </div>
        ) : (
          <div className="text-center py-8">
            <p>No regular listings available at the moment.</p>
          </div>
        )}
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-4">How BidLelongMY Works</h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
            Our secure marketplace ensures authenticity and safety for all your perfume transactions.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-white p-6 rounded-lg shadow-sm text-center">
              <div className="bg-purple-100 text-purple-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Authentication</h3>
              <p className="text-gray-600">
                Every perfume is verified through batch code validation and expert review before it's listed on our platform.
              </p>
            </div>
            
            {/* Step 2 */}
            <div className="bg-white p-6 rounded-lg shadow-sm text-center">
              <div className="bg-purple-100 text-purple-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Secure Payments</h3>
              <p className="text-gray-600">
                Our escrow payment system via Billplz protects both buyers and sellers throughout the transaction.
              </p>
            </div>
            
            {/* Step 3 */}
            <div className="bg-white p-6 rounded-lg shadow-sm text-center">
              <div className="bg-purple-100 text-purple-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Safe Delivery</h3>
              <p className="text-gray-600">
                Track your package every step of the way with our integrated shipping partners across Malaysia.
              </p>
            </div>
          </div>
          
          <div className="text-center mt-10">
            <Button className="bg-purple-600 hover:bg-purple-700 text-white rounded-full px-8 py-3 shadow-sm">
              Learn More About Our Process
            </Button>
          </div>
        </div>
      </section>

      {/* Featured Product Carousel */}
      <FeaturedProductCarousel />

      {/* Testimonials */}
      <section className="bg-white py-16">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">What Our Customers Say</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <div className="bg-gray-50 p-6 rounded-lg">
              <div className="flex text-purple-600 mb-4">
                <Star className="fill-current h-4 w-4" />
                <Star className="fill-current h-4 w-4" />
                <Star className="fill-current h-4 w-4" />
                <Star className="fill-current h-4 w-4" />
                <Star className="fill-current h-4 w-4" />
              </div>
              <p className="text-gray-600 italic mb-4">
                "I found a discontinued bottle of my favorite Guerlain perfume for half the original price. The seller was transparent about the condition, and it arrived exactly as described!"
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden mr-3">
                  <img src="https://i.pravatar.cc/100?img=32" alt="Customer" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="font-medium text-sm">Sarah Johnson</div>
                  <div className="text-xs text-gray-500">Vintage Collector</div>
                </div>
              </div>
            </div>
            
            {/* Testimonial 2 */}
            <div className="bg-gray-50 p-6 rounded-lg">
              <div className="flex text-purple-600 mb-4">
                <Star className="fill-current h-4 w-4" />
                <Star className="fill-current h-4 w-4" />
                <Star className="fill-current h-4 w-4" />
                <Star className="fill-current h-4 w-4" />
                <Star className="fill-current h-4 w-4" />
              </div>
              <p className="text-gray-600 italic mb-4">
                "BidLelong helped me sell my collection of niche perfumes I no longer use. The listing process was straightforward, and I earned much more than I would have through other platforms."
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden mr-3">
                  <img src="https://i.pravatar.cc/100?img=58" alt="Customer" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="font-medium text-sm">David Chen</div>
                  <div className="text-xs text-gray-500">Trusted Seller</div>
                </div>
              </div>
            </div>
            
            {/* Testimonial 3 */}
            <div className="bg-gray-50 p-6 rounded-lg">
              <div className="flex text-purple-600 mb-4">
                <Star className="fill-current h-4 w-4" />
                <Star className="fill-current h-4 w-4" />
                <Star className="fill-current h-4 w-4" />
                <Star className="fill-current h-4 w-4" />
                <StarHalf className="fill-current h-4 w-4" />
              </div>
              <p className="text-gray-600 italic mb-4">
                "I won an auction for a rare discontinued Creed perfume at 30% below retail. The detailed condition info (85% full, original box) gave me confidence in what I was bidding on."
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden mr-3">
                  <img src="https://i.pravatar.cc/100?img=26" alt="Customer" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="font-medium text-sm">Emma Thompson</div>
                  <div className="text-xs text-gray-500">Bargain Hunter</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Email Signup */}
      <section className="py-16 bg-purple-100">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4 text-gray-900">Join Our Fragrance Community</h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto">
            Subscribe to receive alerts on rare finds, auction endings, price drops on your wishlist items, and trusted seller listings.
          </p>
          <form onSubmit={handleSubscribe} className="max-w-md mx-auto flex flex-col sm:flex-row">
            <Input
              type="email"
              placeholder="Your email address"
              className="flex-grow px-4 py-3 rounded-full sm:rounded-r-none mb-3 sm:mb-0"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-full sm:rounded-l-none shadow-sm">
              Subscribe
            </Button>
          </form>
          <p className="text-gray-500 text-sm mt-4">
            By subscribing, you agree to our Privacy Policy and consent to receive updates.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
