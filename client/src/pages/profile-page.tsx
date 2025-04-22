import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  UserCircle, 
  Package, 
  Settings, 
  Heart, 
  CreditCard, 
  ShieldCheck, 
  Bell, 
  Lock, 
  Edit, 
  Save, 
  Wallet, 
  ListOrdered,
  Users,
  LogOut,
  CheckCircle2
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { User } from "@shared/schema";

export default function ProfilePage() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Redirect to /sellers/:id if user is logged in
  useEffect(() => {
    if (user?.id) {
      setLocation(`/sellers/${user.id}`);
    }
  }, [user, setLocation]);

  // Fallback UI in case redirection doesn't happen immediately
  const [activeTab, setActiveTab] = useState("overview");
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    address: user?.address || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const walletBalance = 2500.00; // Placeholder - in a real app, this would come from the API

  // Fetch user's orders
  const { data: orders, isLoading: isOrdersLoading } = useQuery({
    queryKey: ["/api/orders/user"],
    enabled: !!user
  });

  // Fetch user's favorites
  const { data: favorites, isLoading: isFavoritesLoading } = useQuery({
    queryKey: ["/api/favorites"],
    enabled: !!user
  });

  // Handle profile update
  const updateProfileMutation = useMutation({
    mutationFn: async (userData: Partial<User>) => {
      const response = await apiRequest("PATCH", `/api/user/${user?.id}`, userData);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your profile information has been updated successfully",
      });
      setEditMode(false);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Handle password change
  const changePasswordMutation = useMutation({
    mutationFn: async (passwordData: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("POST", `/api/user/change-password`, passwordData);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Password changed",
        description: "Your password has been changed successfully",
      });
      setFormData({ ...formData, currentPassword: "", newPassword: "", confirmPassword: "" });
    },
    onError: (error: Error) => {
      toast({
        title: "Password change failed",
        description: error.message || "Failed to change password. Please check your current password and try again.",
        variant: "destructive",
      });
    }
  });

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Handle profile update
  const handleProfileUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    
    updateProfileMutation.mutate({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      address: formData.address
    });
  };

  // Handle password change
  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.newPassword !== formData.confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "New password and confirmation password must match",
        variant: "destructive",
      });
      return;
    }
    
    changePasswordMutation.mutate({
      currentPassword: formData.currentPassword,
      newPassword: formData.newPassword
    });
  };

  // Handle logout
  const handleLogout = () => {
    logoutMutation.mutate();
    setLocation("/");
  };

  // Order status badges
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
      case "processing":
        return <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Processing</span>;
      case "shipped":
        return <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">Shipped</span>;
      case "delivered":
        return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Delivered</span>;
      case "cancelled":
        return <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Cancelled</span>;
      default:
        return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Profile Sidebar */}
          <div className="w-full md:w-1/4">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex justify-center mb-4">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-purple-100 flex items-center justify-center overflow-hidden">
                      {user?.profileImage ? (
                        <img src={user.profileImage} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        <UserCircle className="w-16 h-16 text-purple-600" />
                      )}
                    </div>
                    <button className="absolute bottom-0 right-0 bg-purple-600 text-white p-1 rounded-full hover:bg-purple-700">
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <CardTitle className="text-center">{user?.username}</CardTitle>
                <CardDescription className="text-center">
                  {user?.firstName && user?.lastName 
                    ? `${user.firstName} ${user.lastName}` 
                    : "Complete your profile"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <TabsList className="grid w-full grid-cols-1 h-auto">
                    <TabsTrigger 
                      value="overview" 
                      className={`justify-start py-2 px-3 ${activeTab === "overview" ? "bg-purple-100" : ""}`}
                      onClick={() => setActiveTab("overview")}
                    >
                      <UserCircle className="mr-2 h-4 w-4" />
                      <span>Profile Overview</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="orders" 
                      className={`justify-start py-2 px-3 ${activeTab === "orders" ? "bg-purple-100" : ""}`}
                      onClick={() => setActiveTab("orders")}
                    >
                      <Package className="mr-2 h-4 w-4" />
                      <span>My Orders</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="favorites" 
                      className={`justify-start py-2 px-3 ${activeTab === "favorites" ? "bg-purple-100" : ""}`}
                      onClick={() => setActiveTab("favorites")}
                    >
                      <Heart className="mr-2 h-4 w-4" />
                      <span>My Favorites</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="wallet" 
                      className={`justify-start py-2 px-3 ${activeTab === "wallet" ? "bg-purple-100" : ""}`}
                      onClick={() => setActiveTab("wallet")}
                    >
                      <Wallet className="mr-2 h-4 w-4" />
                      <span>My Wallet</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="settings" 
                      className={`justify-start py-2 px-3 ${activeTab === "settings" ? "bg-purple-100" : ""}`}
                      onClick={() => setActiveTab("settings")}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Account Settings</span>
                    </TabsTrigger>
                  </TabsList>
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </Button>
              </CardFooter>
            </Card>
          </div>
          
          {/* Content Area */}
          <div className="w-full md:w-3/4">
            {/* Profile Overview */}
            {activeTab === "overview" && (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Profile Overview</CardTitle>
                      <CardDescription>Manage your account information and settings</CardDescription>
                    </div>
                    <Button 
                      variant={editMode ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setEditMode(!editMode)}
                    >
                      {editMode ? (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Changes
                        </>
                      ) : (
                        <>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Profile
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleProfileUpdate}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Personal Information Section */}
                      <div className="md:col-span-2">
                        <h3 className="text-lg font-medium mb-4">Personal Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="firstName">First Name</Label>
                            {editMode ? (
                              <Input 
                                id="firstName" 
                                name="firstName" 
                                value={formData.firstName} 
                                onChange={handleInputChange} 
                              />
                            ) : (
                              <p className="py-2">{user?.firstName || "Not provided"}</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="lastName">Last Name</Label>
                            {editMode ? (
                              <Input 
                                id="lastName" 
                                name="lastName" 
                                value={formData.lastName} 
                                onChange={handleInputChange} 
                              />
                            ) : (
                              <p className="py-2">{user?.lastName || "Not provided"}</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <p className="py-2">{user?.username}</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            {editMode ? (
                              <Input 
                                id="email" 
                                name="email" 
                                type="email" 
                                value={formData.email} 
                                onChange={handleInputChange} 
                              />
                            ) : (
                              <p className="py-2">{user?.email}</p>
                            )}
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="address">Shipping Address</Label>
                            {editMode ? (
                              <Input 
                                id="address" 
                                name="address" 
                                value={formData.address} 
                                onChange={handleInputChange} 
                              />
                            ) : (
                              <p className="py-2">{user?.address || "No address provided"}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    
                      {/* Account Status Section */}
                      <div className="md:col-span-2">
                        <h3 className="text-lg font-medium mb-4">Account Status</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <div className="flex items-center mb-2">
                              <CreditCard className="h-5 w-5 text-purple-600 mr-2" />
                              <span className="font-medium">Account Type</span>
                            </div>
                            <p className="text-sm text-gray-600">
                              {user?.isSeller ? "Seller Account" : "Buyer Account"}
                            </p>
                          </div>
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <div className="flex items-center mb-2">
                              <ShieldCheck className="h-5 w-5 text-purple-600 mr-2" />
                              <span className="font-medium">Verification</span>
                            </div>
                            <p className="text-sm text-gray-600">
                              <span className="inline-flex items-center text-green-600">
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Verified User
                              </span>
                            </p>
                          </div>
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <div className="flex items-center mb-2">
                              <Users className="h-5 w-5 text-purple-600 mr-2" />
                              <span className="font-medium">Member Since</span>
                            </div>
                            <p className="text-sm text-gray-600">March 2025</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {editMode && (
                      <div className="mt-6 flex justify-end">
                        <Button type="button" variant="outline" className="mr-2" onClick={() => setEditMode(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={updateProfileMutation.isPending}>
                          {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                        </Button>
                      </div>
                    )}
                  </form>
                </CardContent>
              </Card>
            )}
            
            {/* My Orders */}
            {activeTab === "orders" && (
              <Card>
                <CardHeader>
                  <CardTitle>My Orders</CardTitle>
                  <CardDescription>Track and manage your orders</CardDescription>
                </CardHeader>
                <CardContent>
                  {isOrdersLoading ? (
                    <div className="flex justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700"></div>
                    </div>
                  ) : orders && orders.length > 0 ? (
                    <div className="space-y-4">
                      {/* Placeholder orders since we don't have real order data yet */}
                      <div className="bg-white shadow overflow-hidden rounded-md">
                        <div className="divide-y divide-gray-200">
                          <div className="p-4 sm:px-6 flex justify-between">
                            <div>
                              <p className="font-medium text-purple-600">Order #10432</p>
                              <p className="text-sm text-gray-500">March 28, 2025</p>
                              <div className="mt-2">{getStatusBadge("delivered")}</div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">RM 450.00</p>
                              <p className="text-sm text-gray-500">2 items</p>
                              <Button variant="link" size="sm" className="mt-1 px-0">
                                View Details
                              </Button>
                            </div>
                          </div>
                          <div className="p-4 sm:px-6 flex justify-between">
                            <div>
                              <p className="font-medium text-purple-600">Order #10429</p>
                              <p className="text-sm text-gray-500">March 20, 2025</p>
                              <div className="mt-2">{getStatusBadge("shipped")}</div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">RM 280.00</p>
                              <p className="text-sm text-gray-500">1 item</p>
                              <Button variant="link" size="sm" className="mt-1 px-0">
                                View Details
                              </Button>
                            </div>
                          </div>
                          <div className="p-4 sm:px-6 flex justify-between">
                            <div>
                              <p className="font-medium text-purple-600">Order #10421</p>
                              <p className="text-sm text-gray-500">March 15, 2025</p>
                              <div className="mt-2">{getStatusBadge("delivered")}</div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">RM 630.00</p>
                              <p className="text-sm text-gray-500">3 items</p>
                              <Button variant="link" size="sm" className="mt-1 px-0">
                                View Details
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <ListOrdered className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-1">No orders yet</h3>
                      <p className="text-gray-500 mb-4">You haven't placed any orders yet</p>
                      <Link href="/products">
                        <Button>Start Shopping</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* Favorites */}
            {activeTab === "favorites" && (
              <Card>
                <CardHeader>
                  <CardTitle>My Favorites</CardTitle>
                  <CardDescription>Products you've saved for later</CardDescription>
                </CardHeader>
                <CardContent>
                  {isFavoritesLoading ? (
                    <div className="flex justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700"></div>
                    </div>
                  ) : favorites && favorites.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {/* Placeholder favorites since we don't have real favorites data yet */}
                      <div className="border rounded-lg overflow-hidden">
                        <img 
                          src="https://images.unsplash.com/photo-1562558998-11ae23345568?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MTB8fHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=500&q=60" 
                          alt="Favorite product" 
                          className="w-full h-40 object-cover"
                        />
                        <div className="p-3">
                          <h4 className="font-medium">Dior Sauvage EDP</h4>
                          <p className="text-sm text-gray-500">85ml/100ml</p>
                          <div className="flex justify-between items-center mt-2">
                            <span className="font-semibold text-purple-600">RM 380</span>
                            <Button size="sm" variant="outline">Add to Cart</Button>
                          </div>
                        </div>
                      </div>
                      <div className="border rounded-lg overflow-hidden">
                        <img 
                          src="https://images.unsplash.com/photo-1608528577891-eb055944d3c9?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MTF8fHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=500&q=60" 
                          alt="Favorite product" 
                          className="w-full h-40 object-cover"
                        />
                        <div className="p-3">
                          <h4 className="font-medium">Tom Ford Tobacco Vanille</h4>
                          <p className="text-sm text-gray-500">50ml/50ml</p>
                          <div className="flex justify-between items-center mt-2">
                            <span className="font-semibold text-purple-600">RM 650</span>
                            <Button size="sm" variant="outline">Add to Cart</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-1">No favorites yet</h3>
                      <p className="text-gray-500 mb-4">Save your favorite items by clicking the heart icon</p>
                      <Link href="/products">
                        <Button>Explore Products</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* Wallet */}
            {activeTab === "wallet" && (
              <Card>
                <CardHeader>
                  <CardTitle>My Wallet</CardTitle>
                  <CardDescription>Manage your wallet balance and transactions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg p-6 mb-6">
                    <h3 className="text-lg font-medium mb-1">Your Balance</h3>
                    <p className="text-3xl font-bold mb-4">RM {walletBalance.toFixed(2)}</p>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline" className="bg-white/20 border-white hover:bg-white/30">
                        Top Up
                      </Button>
                      <Button size="sm" variant="outline" className="bg-white/20 border-white hover:bg-white/30">
                        Withdraw
                      </Button>
                    </div>
                  </div>
                  
                  <h3 className="font-medium text-lg mb-4">Recent Transactions</h3>
                  <div className="space-y-3">
                    {/* Placeholder transactions */}
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">Order Payment</p>
                        <p className="text-sm text-gray-500">Mar 28, 2025</p>
                      </div>
                      <p className="font-medium text-red-600">-RM 450.00</p>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">Wallet Top-up</p>
                        <p className="text-sm text-gray-500">Mar 25, 2025</p>
                      </div>
                      <p className="font-medium text-green-600">+RM 1000.00</p>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">Order Payment</p>
                        <p className="text-sm text-gray-500">Mar 20, 2025</p>
                      </div>
                      <p className="font-medium text-red-600">-RM 280.00</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Account Settings */}
            {activeTab === "settings" && (
              <Card>
                <CardHeader>
                  <CardTitle>Account Settings</CardTitle>
                  <CardDescription>Manage your account preferences and security</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-8">
                    {/* Security Section */}
                    <div>
                      <h3 className="text-lg font-medium mb-4 flex items-center">
                        <Lock className="h-5 w-5 mr-2 text-purple-600" />
                        Security
                      </h3>
                      <form onSubmit={handlePasswordChange} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="currentPassword">Current Password</Label>
                          <Input 
                            id="currentPassword" 
                            name="currentPassword" 
                            type="password" 
                            value={formData.currentPassword}
                            onChange={handleInputChange}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="newPassword">New Password</Label>
                          <Input 
                            id="newPassword" 
                            name="newPassword" 
                            type="password" 
                            value={formData.newPassword}
                            onChange={handleInputChange}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Confirm Password</Label>
                          <Input 
                            id="confirmPassword" 
                            name="confirmPassword" 
                            type="password" 
                            value={formData.confirmPassword}
                            onChange={handleInputChange}
                            required
                          />
                        </div>
                        <Button type="submit" disabled={changePasswordMutation.isPending}>
                          {changePasswordMutation.isPending ? "Updating..." : "Change Password"}
                        </Button>
                      </form>
                    </div>
                    
                    <Separator />
                    
                    {/* Notifications Section */}
                    <div>
                      <h3 className="text-lg font-medium mb-4 flex items-center">
                        <Bell className="h-5 w-5 mr-2 text-purple-600" />
                        Notification Preferences
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Order Updates</p>
                            <p className="text-sm text-gray-500">Receive updates about your orders</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input type="checkbox" id="orderEmail" className="rounded text-purple-600" checked />
                            <Label htmlFor="orderEmail" className="text-sm">Email</Label>
                            
                            <input type="checkbox" id="orderSms" className="rounded text-purple-600 ml-4" checked />
                            <Label htmlFor="orderSms" className="text-sm">SMS</Label>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Promotions & Deals</p>
                            <p className="text-sm text-gray-500">Get notified about discounts and special offers</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input type="checkbox" id="promoEmail" className="rounded text-purple-600" checked />
                            <Label htmlFor="promoEmail" className="text-sm">Email</Label>
                            
                            <input type="checkbox" id="promoSms" className="rounded text-purple-600 ml-4" />
                            <Label htmlFor="promoSms" className="text-sm">SMS</Label>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Price Alerts</p>
                            <p className="text-sm text-gray-500">Get notified when prices drop on your favorites</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input type="checkbox" id="priceEmail" className="rounded text-purple-600" checked />
                            <Label htmlFor="priceEmail" className="text-sm">Email</Label>
                            
                            <input type="checkbox" id="priceSms" className="rounded text-purple-600 ml-4" />
                            <Label htmlFor="priceSms" className="text-sm">SMS</Label>
                          </div>
                        </div>
                      </div>
                      <Button className="mt-4">Save Preferences</Button>
                    </div>
                    
                    <Separator />
                    
                    {/* Account Actions Section */}
                    <div>
                      <h3 className="text-lg font-medium mb-4">Account Actions</h3>
                      {!user?.isSeller && (
                        <div className="mb-4">
                          <Button variant="outline">
                            <Package className="mr-2 h-4 w-4" />
                            Become a Seller
                          </Button>
                          <p className="text-sm text-gray-500 mt-2">Apply to sell your perfumes on our platform</p>
                        </div>
                      )}
                      <div>
                        <Button variant="destructive">Deactivate Account</Button>
                        <p className="text-sm text-gray-500 mt-2">
                          Your account will be deactivated and hidden from other users
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}