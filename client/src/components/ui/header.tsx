import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { CartDrawer } from "./cart-drawer";
import { Input } from "./input";
import { Button } from "./button";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Search, Heart, ShoppingBag, User, LogOut, Package } from "lucide-react";

export function Header() {
  const [location] = useLocation();
  const { user, logoutMutation, cartCount } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const queryClient = useQueryClient();

  // Handle scroll event to add shadow to header
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 0) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.href = `/products?search=${encodeURIComponent(searchQuery)}`;
  };

  // Handle logout
  const handleLogout = () => {
    logoutMutation.mutate();
    queryClient.invalidateQueries();
  };

  return (
    <header className={`border-b border-gray-200 sticky top-0 z-30 bg-white ${isScrolled ? "shadow" : ""}`}>
      {/* Top navigation bar */}
      <div className="bg-rich-black text-white py-2 px-6">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <a href="#" className="text-sm hover:text-gold transition">Help</a>
            <a href="#" className="text-sm hover:text-gold transition">Track Order</a>
          </div>
          <div className="flex items-center space-x-4">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="link" className="text-sm text-white hover:text-gold transition p-0">
                    <User className="h-4 w-4 mr-1" />
                    {user.username}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {user.isSeller && (
                    <Link href="/seller/dashboard">
                      <DropdownMenuItem className="cursor-pointer">
                        <Package className="h-4 w-4 mr-2" />
                        Seller Dashboard
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <DropdownMenuItem className="cursor-pointer" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link href="/auth" className="text-sm hover:text-gold transition">
                  Sign In
                </Link>
                <Link href="/auth?tab=register" className="text-sm bg-gold text-rich-black px-3 py-1 rounded hover:bg-metallic-gold transition">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Main header with logo and search */}
      <div className="container mx-auto py-4 px-6">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <Link href="/" className="text-3xl font-playfair font-bold text-rich-black">
            <span className="text-gold">E</span>ssence
          </Link>
          
          <form onSubmit={handleSearch} className="relative w-full md:w-2/5">
            <Input
              type="text"
              placeholder="Search for perfumes, brands..."
              className="w-full px-4 py-2 border border-gray-300 rounded-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button
              type="submit"
              variant="ghost"
              className="absolute right-0 top-0 h-full px-4 text-gold"
            >
              <Search className="h-5 w-5" />
            </Button>
          </form>
          
          <div className="flex items-center space-x-6">
            <a href="#" className="text-dark-grey hover:text-gold transition">
              <Heart className="h-5 w-5" />
            </a>
            <button 
              onClick={() => setIsCartOpen(true)} 
              className="text-dark-grey hover:text-gold transition relative"
            >
              <ShoppingBag className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-gold text-xs text-rich-black rounded-full w-5 h-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
        
        {/* Categories navigation */}
        <nav className="mt-4 hidden md:block overflow-x-auto">
          <ul className="flex space-x-8 font-lato text-dark-grey whitespace-nowrap">
            <li>
              <Link 
                href="/products" 
                className={`hover:text-gold transition pb-2 ${
                  location === "/products" ? "border-b-2 border-gold font-medium" : ""
                }`}
              >
                All Perfumes
              </Link>
            </li>
            <li>
              <Link 
                href="/products?category=1" 
                className={`hover:text-gold transition pb-2 ${
                  location.includes("category=1") ? "border-b-2 border-gold font-medium" : ""
                }`}
              >
                Women
              </Link>
            </li>
            <li>
              <Link 
                href="/products?category=2" 
                className={`hover:text-gold transition pb-2 ${
                  location.includes("category=2") ? "border-b-2 border-gold font-medium" : ""
                }`}
              >
                Men
              </Link>
            </li>
            <li>
              <Link 
                href="/products?category=3" 
                className={`hover:text-gold transition pb-2 ${
                  location.includes("category=3") ? "border-b-2 border-gold font-medium" : ""
                }`}
              >
                Unisex
              </Link>
            </li>
            <li>
              <Link 
                href="/products?category=4" 
                className={`hover:text-gold transition pb-2 ${
                  location.includes("category=4") ? "border-b-2 border-gold font-medium" : ""
                }`}
              >
                Niche
              </Link>
            </li>
            <li>
              <Link 
                href="/products?category=5" 
                className={`hover:text-gold transition pb-2 ${
                  location.includes("category=5") ? "border-b-2 border-gold font-medium" : ""
                }`}
              >
                New Arrivals
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      {/* Cart Drawer */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </header>
  );
}
