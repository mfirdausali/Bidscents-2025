import React from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  UserCircle,
  Heart,
  Tag,
  Clock,
  DollarSign,
  MessageSquare,
  Settings,
  Plus,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { BookmarkWithProduct, BidWithProduct, Order, MessageWithDetails } from "@shared/schema";
import { ProductCard } from "../ui/product-card";
import { Separator } from "@/components/ui/separator";

export function UserProfile() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = React.useState("profile");
  
  // Get user's bookmarks
  const bookmarksQuery = useQuery({
    queryKey: ["/api/bookmarks"],
    queryFn: () => apiRequest<BookmarkWithProduct[]>("/api/bookmarks"),
    enabled: !!user
  });
  
  // Get user's bids
  const bidsQuery = useQuery({
    queryKey: ["/api/bids"],
    queryFn: () => apiRequest<BidWithProduct[]>("/api/bids"),
    enabled: !!user
  });
  
  // Get user's orders
  const ordersQuery = useQuery({
    queryKey: ["/api/orders"],
    queryFn: () => apiRequest<Order[]>("/api/orders"),
    enabled: !!user
  });
  
  // Get user's messages
  const messagesQuery = useQuery({
    queryKey: ["/api/messages"],
    queryFn: () => apiRequest<MessageWithDetails[]>("/api/messages"),
    enabled: !!user
  });
  
  // Get user's listings
  const listingsQuery = useQuery({
    queryKey: ["/api/listings"],
    queryFn: () => apiRequest<any[]>("/api/listings"),
    enabled: !!user && user.isSeller === true
  });

  if (!user) {
    return (
      <div className="container mx-auto p-6 text-center">
        <h2 className="text-2xl font-bold mb-4">Please log in to view your profile</h2>
        <Link href="/auth">
          <Button>Sign In</Button>
        </Link>
      </div>
    );
  }

  const userInitials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}` || user.username?.[0]?.toUpperCase() || 'U';
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Your Account</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar with user info */}
        <Card className="md:col-span-1">
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user.profileImage || undefined} alt={user.username} />
                <AvatarFallback className="text-xl">{userInitials}</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle>{user.firstName} {user.lastName}</CardTitle>
                <CardDescription>@{user.username}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p>{user.email}</p>
              </div>
              {user.address && (
                <div>
                  <p className="text-sm text-muted-foreground">Shipping Address</p>
                  <p>{user.address}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Wallet Balance</p>
                <p className="text-lg font-medium">${user.walletBalance?.toFixed(2) || '0.00'}</p>
              </div>
              {user.bio && (
                <div>
                  <p className="text-sm text-muted-foreground">About</p>
                  <p>{user.bio}</p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Account Settings
              </Link>
            </Button>
          </CardFooter>
        </Card>
        
        {/* Main content area */}
        <div className="md:col-span-2">
          <Tabs defaultValue="profile" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-6 mb-6">
              <TabsTrigger value="profile">
                <UserCircle className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Profile</span>
              </TabsTrigger>
              <TabsTrigger value="bookmarks">
                <Heart className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Saved</span>
              </TabsTrigger>
              <TabsTrigger value="listings" disabled={!user.isSeller}>
                <Tag className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Listings</span>
              </TabsTrigger>
              <TabsTrigger value="bids">
                <Clock className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Bids</span>
              </TabsTrigger>
              <TabsTrigger value="orders">
                <DollarSign className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Orders</span>
              </TabsTrigger>
              <TabsTrigger value="messages">
                <MessageSquare className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Messages</span>
              </TabsTrigger>
            </TabsList>
            
            {/* Profile Tab */}
            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle>Account Overview</CardTitle>
                  <CardDescription>Manage your BidLelong activity and preferences</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-lg font-medium mb-2">Recent Activity</h3>
                      <p className="text-muted-foreground mb-4">Your recent actions on BidLelong</p>
                      
                      {ordersQuery.data && ordersQuery.data.length > 0 ? (
                        <div className="space-y-2">
                          <p>Recent order: {new Date(ordersQuery.data[0].createdAt as string).toLocaleDateString()}</p>
                          <Separator />
                        </div>
                      ) : (
                        <p>No recent orders</p>
                      )}
                      
                      {bidsQuery.data && bidsQuery.data.length > 0 ? (
                        <div className="space-y-2 mt-4">
                          <p>Active bids: {bidsQuery.data.filter(b => b.status === 'active').length}</p>
                          <Separator />
                        </div>
                      ) : (
                        <p className="mt-4">No active bids</p>
                      )}
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-medium mb-2">Quick Actions</h3>
                      <div className="space-y-2">
                        <Button asChild className="w-full justify-start">
                          <Link href="/settings">
                            <Settings className="mr-2 h-4 w-4" />
                            Edit Profile
                          </Link>
                        </Button>
                        
                        {user.isSeller && (
                          <Button asChild variant="outline" className="w-full justify-start">
                            <Link href="/listings/new">
                              <Plus className="mr-2 h-4 w-4" />
                              Create New Listing
                            </Link>
                          </Button>
                        )}
                        
                        <Button asChild variant="outline" className="w-full justify-start">
                          <Link href="/wallet">
                            <DollarSign className="mr-2 h-4 w-4" />
                            Manage Wallet
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Bookmarks Tab */}
            <TabsContent value="bookmarks">
              <Card>
                <CardHeader>
                  <CardTitle>Saved Items</CardTitle>
                  <CardDescription>Products you've bookmarked for later</CardDescription>
                </CardHeader>
                <CardContent>
                  {bookmarksQuery.isLoading ? (
                    <p>Loading your saved items...</p>
                  ) : bookmarksQuery.error ? (
                    <p>Error loading bookmarks: {bookmarksQuery.error.message}</p>
                  ) : bookmarksQuery.data && bookmarksQuery.data.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {bookmarksQuery.data.map((bookmark) => (
                        <ProductCard key={bookmark.id} product={bookmark.product} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <Heart className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-medium">No saved items yet</h3>
                      <p className="text-muted-foreground mb-4">Products you bookmark will appear here</p>
                      <Button asChild>
                        <Link href="/products">Browse Products</Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Listings Tab */}
            <TabsContent value="listings">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Your Listings</CardTitle>
                    <CardDescription>Manage your products for sale</CardDescription>
                  </div>
                  <Button asChild>
                    <Link href="/listings/new">
                      <Plus className="mr-2 h-4 w-4" />
                      New Listing
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {!user.isSeller ? (
                    <div className="text-center py-10">
                      <p>You need to be registered as a seller to create listings.</p>
                      <Button className="mt-4" asChild>
                        <Link href="/settings">Become a Seller</Link>
                      </Button>
                    </div>
                  ) : listingsQuery.isLoading ? (
                    <p>Loading your listings...</p>
                  ) : listingsQuery.error ? (
                    <p>Error loading listings: {listingsQuery.error.message}</p>
                  ) : listingsQuery.data && listingsQuery.data.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {listingsQuery.data.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <Tag className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-medium">No listings yet</h3>
                      <p className="text-muted-foreground mb-4">Create your first listing to start selling</p>
                      <Button asChild>
                        <Link href="/listings/new">Create Listing</Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Bids Tab */}
            <TabsContent value="bids">
              <Card>
                <CardHeader>
                  <CardTitle>Your Bids</CardTitle>
                  <CardDescription>Track your current and past bids</CardDescription>
                </CardHeader>
                <CardContent>
                  {bidsQuery.isLoading ? (
                    <p>Loading your bids...</p>
                  ) : bidsQuery.error ? (
                    <p>Error loading bids: {bidsQuery.error.message}</p>
                  ) : bidsQuery.data && bidsQuery.data.length > 0 ? (
                    <ScrollArea className="h-[500px] pr-4">
                      <div className="space-y-4">
                        {bidsQuery.data.map((bid) => (
                          <div key={bid.id} className="flex items-start gap-4 p-4 border rounded-lg">
                            <div className="w-20 h-20 rounded-md overflow-hidden flex-shrink-0">
                              <img 
                                src={bid.product.imageUrl} 
                                alt={bid.product.name} 
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between">
                                <Link href={`/products/${bid.product.id}`} className="font-medium hover:underline">
                                  {bid.product.name}
                                </Link>
                                <Badge variant={bid.status === 'active' ? "default" : 
                                  bid.status === 'won' ? "success" : "secondary"}>
                                  {bid.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{bid.product.brand}</p>
                              <div className="mt-2 flex justify-between">
                                <p className="font-medium">${bid.amount.toFixed(2)}</p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(bid.createdAt as string).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-10">
                      <Clock className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-medium">No bids yet</h3>
                      <p className="text-muted-foreground mb-4">You haven't placed any bids yet</p>
                      <Button asChild>
                        <Link href="/products?listingType=auction">Browse Auctions</Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Orders Tab */}
            <TabsContent value="orders">
              <Card>
                <CardHeader>
                  <CardTitle>Order History</CardTitle>
                  <CardDescription>View your purchase history</CardDescription>
                </CardHeader>
                <CardContent>
                  {ordersQuery.isLoading ? (
                    <p>Loading your orders...</p>
                  ) : ordersQuery.error ? (
                    <p>Error loading orders: {ordersQuery.error.message}</p>
                  ) : ordersQuery.data && ordersQuery.data.length > 0 ? (
                    <div className="space-y-4">
                      {ordersQuery.data.map((order) => (
                        <div key={order.id} className="border rounded-lg p-4">
                          <div className="flex justify-between mb-2">
                            <p className="font-medium">Order #{order.id}</p>
                            <Badge>{order.status}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-4">
                            Placed on {new Date(order.createdAt as string).toLocaleDateString()}
                          </p>
                          <div className="flex justify-between">
                            <p>Total</p>
                            <p className="font-medium">${order.total.toFixed(2)}</p>
                          </div>
                          <div className="mt-4">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/orders/${order.id}`}>View Details</Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <DollarSign className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-medium">No orders yet</h3>
                      <p className="text-muted-foreground mb-4">You haven't made any purchases yet</p>
                      <Button asChild>
                        <Link href="/products">Start Shopping</Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Messages Tab */}
            <TabsContent value="messages">
              <Card>
                <CardHeader>
                  <CardTitle>Messages</CardTitle>
                  <CardDescription>Your conversations with other users</CardDescription>
                </CardHeader>
                <CardContent>
                  {messagesQuery.isLoading ? (
                    <p>Loading your messages...</p>
                  ) : messagesQuery.error ? (
                    <p>Error loading messages: {messagesQuery.error.message}</p>
                  ) : messagesQuery.data && messagesQuery.data.length > 0 ? (
                    <ScrollArea className="h-[500px] pr-4">
                      <div className="space-y-4">
                        {messagesQuery.data.map((message) => {
                          const otherUser = message.senderId === user.id ? message.receiver : message.sender;
                          return (
                            <div key={message.id} className="flex items-start gap-4 p-4 border rounded-lg">
                              <Avatar>
                                <AvatarImage src={otherUser.profileImage || undefined} alt={otherUser.username} />
                                <AvatarFallback>
                                  {otherUser.firstName?.[0]}{otherUser.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <div className="flex justify-between">
                                  <p className="font-medium">{otherUser.username}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {new Date(message.createdAt as string).toLocaleDateString()}
                                  </p>
                                </div>
                                <p className="truncate text-sm">{message.content}</p>
                                {message.productId && message.product && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Re: {message.product.name}
                                  </p>
                                )}
                                <div className="mt-2">
                                  <Button variant="outline" size="sm" asChild>
                                    <Link href={`/messages/${otherUser.id}`}>View Conversation</Link>
                                  </Button>
                                </div>
                              </div>
                              {!message.isRead && message.receiverId === user.id && (
                                <Badge>New</Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-10">
                      <MessageSquare className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-medium">No messages yet</h3>
                      <p className="text-muted-foreground mb-4">Your conversations will appear here</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}