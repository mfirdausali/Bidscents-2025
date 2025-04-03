import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  User, 
  Package, 
  Heart, 
  Gavel, 
  ShoppingBag, 
  Settings, 
  PieChart, 
  Lock, 
  LogOut,
  Edit,
  Trash2,
  Eye,
  Clock,
  Check,
  XCircle
} from "lucide-react";
import { ProductCard } from "@/components/ui/product-card";
import { 
  Avatar, 
  AvatarFallback, 
  AvatarImage 
} from "@/components/ui/avatar";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";

import { Badge } from "@/components/ui/badge";

interface SaleRecord {
  id: number;
  product: {
    name: string;
    imageUrl: string;
  };
  date: Date | string | null;
  type: 'fixed' | 'auction';
  buyer: string;
  amount: number;
}
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ProductWithDetails, Order, User as UserType } from "@shared/schema";

// Profile information form schema
const profileFormSchema = z.object({
  username: z.string().min(3, {
    message: "Username must be at least 3 characters."
  }),
  email: z.string().email({
    message: "Please enter a valid email address."
  }),
  name: z.string().optional(),
  location: z.string().optional(),
  bio: z.string().max(160).optional(),
});

// Password change form schema
const passwordFormSchema = z.object({
  currentPassword: z.string().min(6, {
    message: "Current password must be at least 6 characters."
  }),
  newPassword: z.string().min(6, {
    message: "New password must be at least 6 characters."
  }),
  confirmPassword: z.string().min(6, {
    message: "Please confirm your new password."
  }),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

export default function ProfilePage() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  // Get user bookmarks
  const { data: bookmarks, isLoading: bookmarksLoading } = useQuery<ProductWithDetails[]>({
    queryKey: ["/api/bookmarks"],
    enabled: !!user,
  });

  // Get user listings
  const { data: listings, isLoading: listingsLoading } = useQuery<ProductWithDetails[]>({
    queryKey: ["/api/user/listings"],
    enabled: !!user,
  });

  // Get user active bids
  const { data: activeBids, isLoading: activeBidsLoading } = useQuery<ProductWithDetails[]>({
    queryKey: ["/api/user/bids/active"],
    enabled: !!user,
  });

  // Get user won auctions
  const { data: wonAuctions, isLoading: wonAuctionsLoading } = useQuery<ProductWithDetails[]>({
    queryKey: ["/api/user/bids/won"],
    enabled: !!user,
  });

  // Get user orders
  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/user/orders"],
    enabled: !!user,
  });

  // Get sales analytics
  const { data: salesData, isLoading: salesDataLoading } = useQuery<any>({
    queryKey: ["/api/user/analytics/sales"],
    enabled: !!user && user.isSeller,
  });

  // Profile form
  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: user?.username || "",
      email: user?.email || "",
      name: user?.name || "",
      location: user?.location || "",
      bio: user?.bio || "",
    },
  });

  // Password form
  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (profileData: ProfileFormValues) => {
      const response = await apiRequest("PATCH", "/api/user", profileData);
      const data = await response.json();
      return data as UserType;
    },
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your profile information has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (passwordData: PasswordFormValues) => {
      const response = await apiRequest("POST", "/api/user/password", {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      const data = await response.json();
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Password changed",
        description: "Your password has been changed successfully.",
      });
      passwordForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    },
  });

  // Delete listing mutation
  const deleteListingMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/products/${id}`);
      return id;
    },
    onSuccess: () => {
      toast({
        title: "Listing deleted",
        description: "Your listing has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/listings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete listing",
        variant: "destructive",
      });
    },
  });

  // Remove bookmark mutation
  const removeBookmarkMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/bookmarks/${id}`);
      return id;
    },
    onSuccess: () => {
      toast({
        title: "Bookmark removed",
        description: "The item has been removed from your bookmarks.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove bookmark",
        variant: "destructive",
      });
    },
  });

  // Handle profile form submission
  const onProfileSubmit = (data: ProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  // Handle password form submission
  const onPasswordSubmit = (data: PasswordFormValues) => {
    changePasswordMutation.mutate(data);
  };

  // Handle logout
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Handle delete listing
  const handleDeleteListing = (id: number) => {
    if (window.confirm("Are you sure you want to delete this listing?")) {
      deleteListingMutation.mutate(id);
    }
  };

  // Handle remove bookmark
  const handleRemoveBookmark = (id: number) => {
    removeBookmarkMutation.mutate(id);
  };

  // Format listing status
  const getListingStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case "sold":
        return <Badge className="bg-blue-100 text-blue-800">Sold</Badge>;
      case "expired":
        return <Badge className="bg-gray-100 text-gray-800">Expired</Badge>;
      case "draft":
        return <Badge className="bg-yellow-100 text-yellow-800">Draft</Badge>;
      default:
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-grow container mx-auto py-8 px-4">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">Please Login</h1>
            <p className="mb-6">You need to be logged in to view your profile.</p>
            <Button className="bg-purple-600 hover:bg-purple-700" asChild>
              <a href="/auth">Login or Register</a>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Get user initials for avatar fallback
  const getInitials = () => {
    return user.username.substring(0, 2).toUpperCase();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <div className="flex-grow container mx-auto py-8 px-4">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar */}
          <div className="w-full md:w-1/4">
            <Card>
              <CardHeader>
                <div className="flex flex-col items-center">
                  <Avatar className="w-24 h-24 mb-4">
                    <AvatarImage src={user.avatarUrl || undefined} alt={user.username} />
                    <AvatarFallback className="bg-purple-100 text-purple-800 text-xl">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <CardTitle className="text-center">{user.name || user.username}</CardTitle>
                  <CardDescription className="text-center">{user.email}</CardDescription>
                  
                  {user.isSeller && (
                    <Badge className="mt-2 bg-purple-100 text-purple-800">Seller</Badge>
                  )}
                  
                  {user.isAdmin && (
                    <Badge className="mt-2 bg-amber-100 text-amber-800">Admin</Badge>
                  )}
                </div>
              </CardHeader>
              
              <CardContent>
                <nav className="space-y-2">
                  <Button 
                    variant={activeTab === "overview" ? "default" : "ghost"} 
                    className={`w-full justify-start ${activeTab === "overview" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                    onClick={() => setActiveTab("overview")}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Profile Overview
                  </Button>
                  
                  <Button 
                    variant={activeTab === "bookmarks" ? "default" : "ghost"} 
                    className={`w-full justify-start ${activeTab === "bookmarks" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                    onClick={() => setActiveTab("bookmarks")}
                  >
                    <Heart className="mr-2 h-4 w-4" />
                    Bookmarked Listings
                  </Button>
                  
                  <Button 
                    variant={activeTab === "listings" ? "default" : "ghost"} 
                    className={`w-full justify-start ${activeTab === "listings" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                    onClick={() => setActiveTab("listings")}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    My Listings
                  </Button>
                  
                  <Button 
                    variant={activeTab === "bids" ? "default" : "ghost"} 
                    className={`w-full justify-start ${activeTab === "bids" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                    onClick={() => setActiveTab("bids")}
                  >
                    <Gavel className="mr-2 h-4 w-4" />
                    Bidding & Auctions
                  </Button>
                  
                  <Button 
                    variant={activeTab === "orders" ? "default" : "ghost"} 
                    className={`w-full justify-start ${activeTab === "orders" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                    onClick={() => setActiveTab("orders")}
                  >
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    Purchase History
                  </Button>
                  
                  {user.isSeller && (
                    <Button 
                      variant={activeTab === "analytics" ? "default" : "ghost"} 
                      className={`w-full justify-start ${activeTab === "analytics" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                      onClick={() => setActiveTab("analytics")}
                    >
                      <PieChart className="mr-2 h-4 w-4" />
                      Selling & Earnings
                    </Button>
                  )}
                  
                  <Button 
                    variant={activeTab === "settings" ? "default" : "ghost"} 
                    className={`w-full justify-start ${activeTab === "settings" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                    onClick={() => setActiveTab("settings")}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Account Settings
                  </Button>
                  
                  <Button 
                    variant={activeTab === "security" ? "default" : "ghost"} 
                    className={`w-full justify-start ${activeTab === "security" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                    onClick={() => setActiveTab("security")}
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    Security
                  </Button>
                </nav>
              </CardContent>
              
              <CardFooter>
                <Button 
                  variant="outline" 
                  className="w-full border-red-300 text-red-600 hover:bg-red-50"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log Out
                </Button>
              </CardFooter>
            </Card>
          </div>
          
          {/* Main Content */}
          <div className="w-full md:w-3/4">
            {/* Profile Overview */}
            {activeTab === "overview" && (
              <Card>
                <CardHeader>
                  <CardTitle>Profile Overview</CardTitle>
                  <CardDescription>
                    View and manage your personal information.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Username</h3>
                        <p className="text-sm font-medium">{user.username}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Email</h3>
                        <p className="text-sm font-medium">{user.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Name</h3>
                        <p className="text-sm font-medium">{user.name || "Not provided"}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Location</h3>
                        <p className="text-sm font-medium">{user.location || "Not provided"}</p>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Bio</h3>
                      <p className="text-sm font-medium">{user.bio || "No bio provided"}</p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-4 pt-6">
                      <Button 
                        className="bg-purple-600 hover:bg-purple-700"
                        onClick={() => setActiveTab("settings")}
                      >
                        Edit Profile
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => setActiveTab("security")}
                      >
                        Change Password
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Bookmarked Listings */}
            {activeTab === "bookmarks" && (
              <Card>
                <CardHeader>
                  <CardTitle>Bookmarked Listings</CardTitle>
                  <CardDescription>
                    Items you've saved for later.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {bookmarksLoading ? (
                    <div className="text-center py-10">
                      <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p>Loading your bookmarks...</p>
                    </div>
                  ) : bookmarks && bookmarks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {bookmarks.map((product) => (
                        <div key={product.id} className="relative group">
                          <ProductCard product={product} />
                          <Button
                            variant="destructive"
                            size="sm"
                            className="absolute top-2 right-12 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleRemoveBookmark(product.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <Heart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-1">No bookmarks yet</h3>
                      <p className="text-gray-500 mb-4">
                        When you bookmark items you're interested in, they'll appear here.
                      </p>
                      <Button className="bg-purple-600 hover:bg-purple-700" asChild>
                        <a href="/products">Browse Products</a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* My Listings */}
            {activeTab === "listings" && (
              <Card>
                <CardHeader>
                  <CardTitle>My Listings</CardTitle>
                  <CardDescription>
                    Manage your product listings.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {listingsLoading ? (
                    <div className="text-center py-10">
                      <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p>Loading your listings...</p>
                    </div>
                  ) : listings && listings.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {listings.map((listing) => (
                            <TableRow key={listing.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center space-x-3">
                                  <div className="h-12 w-12 rounded overflow-hidden bg-gray-100">
                                    <img 
                                      src={listing.imageUrl} 
                                      alt={listing.name} 
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                  <div className="truncate max-w-[150px]">{listing.name}</div>
                                </div>
                              </TableCell>
                              <TableCell>RM {listing.price.toFixed(0)}</TableCell>
                              <TableCell className="capitalize">{listing.listingType || "Fixed"}</TableCell>
                              <TableCell>
                                {getListingStatusBadge(listing.status || "active")}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end space-x-2">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    asChild
                                  >
                                    <a href={`/products/${listing.id}`} title="View">
                                      <Eye className="h-4 w-4" />
                                    </a>
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    asChild
                                  >
                                    <a href={`/seller/dashboard?edit=${listing.id}`} title="Edit">
                                      <Edit className="h-4 w-4" />
                                    </a>
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-900 hover:bg-red-50"
                                    onClick={() => handleDeleteListing(listing.id)}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-1">No listings yet</h3>
                      <p className="text-gray-500 mb-4">
                        Start selling your perfumes by creating a new listing.
                      </p>
                      <Button className="bg-purple-600 hover:bg-purple-700" asChild>
                        <a href="/seller/dashboard">Create Listing</a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* Bidding & Auctions */}
            {activeTab === "bids" && (
              <Card>
                <CardHeader>
                  <CardTitle>Bidding & Auctions</CardTitle>
                  <CardDescription>
                    Track your bids and auctions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="active">
                    <TabsList className="mb-4">
                      <TabsTrigger value="active">Active Bids</TabsTrigger>
                      <TabsTrigger value="won">Won Auctions</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="active">
                      {activeBidsLoading ? (
                        <div className="text-center py-10">
                          <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                          <p>Loading your active bids...</p>
                        </div>
                      ) : activeBids && activeBids.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {activeBids.map((product) => (
                            <div key={product.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                              <div className="p-4 flex items-start space-x-4">
                                <div className="h-20 w-20 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                                  <img 
                                    src={product.imageUrl} 
                                    alt={product.name} 
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                                <div className="flex-grow">
                                  <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                                  <p className="text-sm text-gray-500 truncate">{product.brand}</p>
                                  <div className="flex justify-between items-center mt-2">
                                    <div>
                                      <p className="text-sm text-gray-600">
                                        Your bid: <span className="font-medium">RM {product.highestBid?.amount.toFixed(0) || product.price.toFixed(0)}</span>
                                      </p>
                                      <p className="text-xs text-amber-600 flex items-center mt-1">
                                        <Clock className="h-3 w-3 mr-1" />
                                        Ends in 2 days
                                      </p>
                                    </div>
                                    <Button 
                                      size="sm" 
                                      className="bg-amber-500 hover:bg-amber-600 text-white"
                                      asChild
                                    >
                                      <a href={`/products/${product.id}`}>Increase Bid</a>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-10">
                          <Gavel className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-lg font-medium mb-1">No active bids</h3>
                          <p className="text-gray-500 mb-4">
                            You don't have any active bids at the moment.
                          </p>
                          <Button className="bg-purple-600 hover:bg-purple-700" asChild>
                            <a href="/products?type=auction">Browse Auctions</a>
                          </Button>
                        </div>
                      )}
                    </TabsContent>
                    
                    <TabsContent value="won">
                      {wonAuctionsLoading ? (
                        <div className="text-center py-10">
                          <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                          <p>Loading your won auctions...</p>
                        </div>
                      ) : wonAuctions && wonAuctions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {wonAuctions.map((product) => (
                            <div key={product.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                              <div className="p-4 flex items-start space-x-4">
                                <div className="h-20 w-20 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                                  <img 
                                    src={product.imageUrl} 
                                    alt={product.name} 
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                                <div className="flex-grow">
                                  <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                                  <p className="text-sm text-gray-500 truncate">{product.brand}</p>
                                  <div className="flex justify-between items-center mt-2">
                                    <div>
                                      <p className="text-sm text-gray-600">
                                        Winning bid: <span className="font-medium">RM {product.highestBid?.amount.toFixed(0) || product.price.toFixed(0)}</span>
                                      </p>
                                      <Badge className="mt-1 bg-green-100 text-green-800">
                                        <Check className="h-3 w-3 mr-1" /> Auction Won
                                      </Badge>
                                    </div>
                                    <Button 
                                      size="sm" 
                                      className="bg-purple-600 hover:bg-purple-700"
                                      asChild
                                    >
                                      <a href={`/checkout/${product.id}`}>Complete Purchase</a>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-10">
                          <Gavel className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-lg font-medium mb-1">No won auctions</h3>
                          <p className="text-gray-500 mb-4">
                            You haven't won any auctions yet.
                          </p>
                          <Button className="bg-purple-600 hover:bg-purple-700" asChild>
                            <a href="/products?type=auction">Browse Auctions</a>
                          </Button>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
            
            {/* Purchase History */}
            {activeTab === "orders" && (
              <Card>
                <CardHeader>
                  <CardTitle>Purchase History</CardTitle>
                  <CardDescription>
                    Your order history and tracking information.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {ordersLoading ? (
                    <div className="text-center py-10">
                      <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p>Loading your purchase history...</p>
                    </div>
                  ) : orders && orders.length > 0 ? (
                    <div className="space-y-6">
                      {orders.map((order) => (
                        <Card key={order.id}>
                          <CardHeader className="pb-2">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
                              <div>
                                <CardTitle className="text-base">Order #{order.id}</CardTitle>
                                <CardDescription>
                                  {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "N/A"}
                                </CardDescription>
                              </div>
                              <div className="mt-2 sm:mt-0">
                                <Badge className={
                                  order.status === "completed" 
                                    ? "bg-green-100 text-green-800" 
                                    : order.status === "processing" 
                                      ? "bg-blue-100 text-blue-800"
                                      : order.status === "shipped"
                                        ? "bg-purple-100 text-purple-800"
                                        : "bg-gray-100 text-gray-800"
                                }>
                                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {((order as any).items || []).map((item: any) => (
                                <div key={item.id} className="flex space-x-4">
                                  <div className="h-16 w-16 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                                    <img 
                                      src={item.product?.imageUrl} 
                                      alt={item.product?.name} 
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                  <div className="flex-grow">
                                    <h4 className="font-medium text-gray-900 text-sm">{item.product?.name}</h4>
                                    <p className="text-xs text-gray-500">{item.product?.brand}</p>
                                    <div className="flex justify-between mt-1">
                                      <p className="text-xs text-gray-600">
                                        Qty: {item.quantity}
                                      </p>
                                      <p className="text-sm font-medium">
                                        RM {item.price.toFixed(0)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              
                              <div className="border-t pt-3 mt-3">
                                <div className="flex justify-between">
                                  <span className="text-sm font-medium">Total</span>
                                  <span className="text-sm font-bold">
                                    RM {order.total.toFixed(0)}
                                  </span>
                                </div>
                              </div>
                              
                              {(order as any).trackingNumber && (
                                <div className="border-t pt-3 mt-3">
                                  <p className="text-xs text-gray-600">
                                    Tracking Number: {(order as any).trackingNumber}
                                  </p>
                                  <Button 
                                    variant="link" 
                                    className="p-0 h-auto text-purple-600 text-xs"
                                    asChild
                                  >
                                    <a href={`https://www.tracking.my/?trackingNo=${(order as any).trackingNumber}`} target="_blank">
                                      Track Package
                                    </a>
                                  </Button>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-1">No orders yet</h3>
                      <p className="text-gray-500 mb-4">
                        When you make a purchase, your order history will appear here.
                      </p>
                      <Button className="bg-purple-600 hover:bg-purple-700" asChild>
                        <a href="/products">Start Shopping</a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* Selling & Earnings (Seller only) */}
            {activeTab === "analytics" && user.isSeller && (
              <Card>
                <CardHeader>
                  <CardTitle>Selling & Earnings</CardTitle>
                  <CardDescription>
                    Track your sales performance and earnings.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {salesDataLoading ? (
                    <div className="text-center py-10">
                      <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p>Loading your sales data...</p>
                    </div>
                  ) : salesData ? (
                    <div>
                      {/* Sales Summary Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <h3 className="text-sm font-medium text-gray-500 mb-1">Total Sales</h3>
                              <p className="text-2xl font-bold text-purple-600">RM {salesData.totalSales.toFixed(0)}</p>
                              <p className="text-xs text-gray-500 mt-1">Lifetime earnings</p>
                            </div>
                          </CardContent>
                        </Card>
                        
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <h3 className="text-sm font-medium text-gray-500 mb-1">Items Sold</h3>
                              <p className="text-2xl font-bold text-purple-600">{salesData.itemsSold}</p>
                              <p className="text-xs text-gray-500 mt-1">Total products sold</p>
                            </div>
                          </CardContent>
                        </Card>
                        
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <h3 className="text-sm font-medium text-gray-500 mb-1">Active Listings</h3>
                              <p className="text-2xl font-bold text-purple-600">{salesData.activeListings}</p>
                              <p className="text-xs text-gray-500 mt-1">Currently for sale</p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                      
                      {/* Recent Sales */}
                      <h3 className="text-lg font-medium mb-4">Recent Sales</h3>
                      {salesData.recentSales && salesData.recentSales.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Buyer</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {salesData.recentSales.map((sale: SaleRecord) => (
                              <TableRow key={sale.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center space-x-3">
                                    <div className="h-10 w-10 rounded overflow-hidden bg-gray-100">
                                      <img 
                                        src={sale.product.imageUrl} 
                                        alt={sale.product.name} 
                                        className="h-full w-full object-cover"
                                      />
                                    </div>
                                    <span className="truncate max-w-[150px]">{sale.product.name}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {sale.date ? new Date(sale.date).toLocaleDateString() : 'N/A'}
                                </TableCell>
                                <TableCell className="capitalize">
                                  {sale.type}
                                </TableCell>
                                <TableCell>
                                  {sale.buyer}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  RM {sale.amount.toFixed(0)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="text-center py-6 bg-gray-50 rounded-lg">
                          <p className="text-gray-500">No recent sales to display</p>
                        </div>
                      )}
                      
                      {/* Monthly Performance (could add chart here) */}
                      <h3 className="text-lg font-medium mt-8 mb-4">Monthly Performance</h3>
                      <div className="bg-gray-50 p-6 rounded-lg text-center">
                        <p className="text-gray-500 mb-2">No chart available in this preview</p>
                        <p className="text-sm text-gray-400">Monthly performance data would display here with charts</p>
                      </div>
                      
                      <div className="mt-6">
                        <Button className="bg-purple-600 hover:bg-purple-700" asChild>
                          <a href="/seller/dashboard">Manage Listings</a>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <PieChart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-1">No sales data yet</h3>
                      <p className="text-gray-500 mb-4">
                        Start selling your perfumes to see your earnings and analytics.
                      </p>
                      <Button className="bg-purple-600 hover:bg-purple-700" asChild>
                        <a href="/seller/dashboard">Create Listing</a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* Account Settings */}
            {activeTab === "settings" && (
              <Card>
                <CardHeader>
                  <CardTitle>Account Settings</CardTitle>
                  <CardDescription>
                    Update your profile information.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...profileForm}>
                    <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex justify-center mb-4">
                          <div className="relative">
                            <Avatar className="w-24 h-24">
                              <AvatarImage src={user.avatarUrl || undefined} alt={user.username} />
                              <AvatarFallback className="bg-purple-100 text-purple-800 text-xl">
                                {getInitials()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-2 -right-2">
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="h-8 w-8 p-0 rounded-full bg-white"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        
                        <FormField
                          control={profileForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={profileForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input {...field} type="email" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={profileForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full Name</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={profileForm.control}
                          name="location"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Location</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={profileForm.control}
                          name="bio"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bio</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormDescription>
                                Brief description for your profile. Max 160 characters.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setActiveTab("overview")}
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          className="bg-purple-600 hover:bg-purple-700"
                          disabled={updateProfileMutation.isPending}
                        >
                          {updateProfileMutation.isPending ? (
                            <span className="flex items-center">
                              <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-white rounded-full"></span>
                              Saving...
                            </span>
                          ) : "Save Changes"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}
            
            {/* Security */}
            {activeTab === "security" && (
              <Card>
                <CardHeader>
                  <CardTitle>Security</CardTitle>
                  <CardDescription>
                    Update your password and security settings.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...passwordForm}>
                    <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
                      <div className="space-y-4">
                        <FormField
                          control={passwordForm.control}
                          name="currentPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Current Password</FormLabel>
                              <FormControl>
                                <Input {...field} type="password" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={passwordForm.control}
                          name="newPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>New Password</FormLabel>
                              <FormControl>
                                <Input {...field} type="password" />
                              </FormControl>
                              <FormDescription>
                                Password must be at least 6 characters long.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={passwordForm.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Confirm New Password</FormLabel>
                              <FormControl>
                                <Input {...field} type="password" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setActiveTab("overview")}
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          className="bg-purple-600 hover:bg-purple-700"
                          disabled={changePasswordMutation.isPending}
                        >
                          {changePasswordMutation.isPending ? (
                            <span className="flex items-center">
                              <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-white rounded-full"></span>
                              Updating...
                            </span>
                          ) : "Change Password"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}