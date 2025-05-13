import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadMessages } from "@/hooks/use-unread-messages";
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
import { Search, Heart, MessageCircle, User, LogOut, Package, Shield } from "lucide-react";

export function Header() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { unreadCount } = useUnreadMessages();
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
    <header className={`sticky top-0 z-30 bg-white ${isScrolled ? "shadow-sm" : ""}`}>
      <div className="container mx-auto py-3 px-4 md:px-6">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <span className="text-xl font-bold text-purple-600">Bid<span className="text-amber-500">Scents</span></span>
          </Link>
          
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="relative hidden md:block max-w-md w-full mx-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="Search for perfumes, brands, notes..."
                className="search-bar pl-10 pr-4 py-2 w-full bg-gray-100 border-0 rounded-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
            </div>
          </form>
          
          {/* Navigation */}
          <nav className="flex items-center space-x-6">
            <Link href="/seller/dashboard" className="hidden md:block font-medium hover:text-purple-700 transition">
              Sell
            </Link>
            <Link href="/community" className="hidden md:block font-medium hover:text-purple-700 transition">
              Community
            </Link>
            
            {/* Mobile search icon */}
            <button className="md:hidden text-gray-700">
              <Search className="h-5 w-5" />
            </button>
            
            {/* Messages */}
            <Link href="/messages">
              <button 
                className="text-gray-700 relative"
                aria-label="Messages"
              >
                <MessageCircle className="h-5 w-5" />
              </button>
            </Link>
            
            {/* User menu */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full p-0">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <Link href="/profile">
                    <DropdownMenuItem className="cursor-pointer">
                      <User className="h-4 w-4 mr-2" />
                      Profile
                    </DropdownMenuItem>
                  </Link>
                  {user.isSeller && (
                    <Link href="/seller/dashboard">
                      <DropdownMenuItem className="cursor-pointer">
                        <Package className="h-4 w-4 mr-2" />
                        Seller Dashboard
                      </DropdownMenuItem>
                    </Link>
                  )}
                  {user.isAdmin && (
                    <Link href="/admin/dashboard">
                      <DropdownMenuItem className="cursor-pointer">
                        <Shield className="h-4 w-4 mr-2" />
                        Admin Dashboard
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/auth">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white rounded-full">
                  Sign In
                </Button>
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
