import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Header } from "@/components/ui/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Table, TableBody, TableCaption, TableCell, 
  TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Dialog, DialogContent, DialogDescription, 
  DialogHeader, DialogTitle 
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { User, Order } from "@shared/schema";
import { 
  Users, Package, Truck, AlertCircle, CheckCircle, 
  UserX, UserCheck, ShoppingBag, MessageSquare
} from "lucide-react";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("users");
  const [userToAction, setUserToAction] = useState<User | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"ban" | "unban" | null>(null);
  
  // Fetch all users
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user?.isAdmin,
  });
  
  // Fetch all orders
  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user?.isAdmin && activeTab === "orders",
  });
  
  // Ban/unban user mutation
  const banUserMutation = useMutation({
    mutationFn: async ({ userId, isBanned }: { userId: number, isBanned: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/ban`, { isBanned });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setIsDialogOpen(false);
      toast({
        title: "Success",
        description: dialogAction === "ban" ? "User has been banned" : "User has been unbanned",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Update order status mutation
  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number, status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/orders/${orderId}/status`, { status });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({
        title: "Success",
        description: "Order status has been updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Redirect if not admin
  useEffect(() => {
    if (user && !user.isAdmin) {
      window.location.href = "/";
    }
  }, [user]);
  
  // Handlers
  const handleBanUser = (user: User) => {
    setUserToAction(user);
    setDialogAction(user.isBanned ? "unban" : "ban");
    setIsDialogOpen(true);
  };
  
  const confirmBanUser = () => {
    if (userToAction && dialogAction) {
      banUserMutation.mutate({ 
        userId: userToAction.id, 
        isBanned: dialogAction === "ban" 
      });
    }
  };
  
  const handleUpdateOrderStatus = (orderId: number, status: string) => {
    updateOrderStatusMutation.mutate({ orderId, status });
  };

  // Handler for messaging a user
  const handleMessageUser = (targetUser: User) => {
    // Store user data in sessionStorage to be accessed by the messages page
    sessionStorage.setItem("selectedConversation", JSON.stringify({
      userId: targetUser.id,
      username: targetUser.username,
      isAdmin: targetUser.isAdmin
    }));
    
    // Redirect to messages page
    setLocation("/messages");
  };
  
  // Calculate stats
  const totalUsers = users.length;
  const totalSellers = users.filter(u => u.isSeller).length;
  const totalBannedUsers = users.filter(u => u.isBanned).length;
  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === "pending").length;
  const completedOrders = orders.filter(o => o.status === "completed").length;
  
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow bg-gray-50">
        <div className="container mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="font-playfair text-3xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-gray-600">Manage users, products, and orders</p>
          </div>
          
          {/* Dashboard summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="bg-gold/20 p-3 rounded-full mr-4">
                    <Users className="h-6 w-6 text-gold" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Users</p>
                    <h3 className="text-2xl font-bold">{totalUsers}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="bg-gold/20 p-3 rounded-full mr-4">
                    <Package className="h-6 w-6 text-gold" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Sellers</p>
                    <h3 className="text-2xl font-bold">{totalSellers}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="bg-gold/20 p-3 rounded-full mr-4">
                    <ShoppingBag className="h-6 w-6 text-gold" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Orders</p>
                    <h3 className="text-2xl font-bold">{totalOrders}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
            </TabsList>
            
            <TabsContent value="users">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableCaption>A list of all users.</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>{user.id}</TableCell>
                          <TableCell>{user.username}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{`${user.firstName || ''} ${user.lastName || ''}`}</TableCell>
                          <TableCell>
                            {user.isAdmin ? (
                              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">Admin</span>
                            ) : user.isSeller ? (
                              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">Seller</span>
                            ) : (
                              <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs">Customer</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {user.isBanned ? (
                              <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs">Banned</span>
                            ) : (
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Active</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleBanUser(user)}
                              className={user.isBanned ? "text-green-600" : "text-red-600"}
                              disabled={user.isAdmin} // Can't ban admins
                            >
                              {user.isBanned ? (
                                <>
                                  <UserCheck className="h-4 w-4 mr-1" />
                                  Unban
                                </>
                              ) : (
                                <>
                                  <UserX className="h-4 w-4 mr-1" />
                                  Ban
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="orders">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableCaption>A list of all orders.</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell>#{order.id}</TableCell>
                          <TableCell>{order.userId}</TableCell>
                          <TableCell>${order.total.toFixed(2)}</TableCell>
                          <TableCell>{new Date(order.createdAt!).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {order.status === "pending" && (
                              <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs">Pending</span>
                            )}
                            {order.status === "processing" && (
                              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">Processing</span>
                            )}
                            {order.status === "shipped" && (
                              <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-xs">Shipped</span>
                            )}
                            {order.status === "delivered" && (
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Delivered</span>
                            )}
                            {order.status === "cancelled" && (
                              <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs">Cancelled</span>
                            )}
                          </TableCell>
                          <TableCell className="space-x-2">
                            {order.status === "pending" && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleUpdateOrderStatus(order.id, "processing")}
                              >
                                <Truck className="h-4 w-4 mr-1" />
                                Process
                              </Button>
                            )}
                            {order.status === "processing" && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleUpdateOrderStatus(order.id, "shipped")}
                              >
                                <Truck className="h-4 w-4 mr-1" />
                                Ship
                              </Button>
                            )}
                            {order.status === "shipped" && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleUpdateOrderStatus(order.id, "delivered")}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Deliver
                              </Button>
                            )}
                            {(order.status === "pending" || order.status === "processing") && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-red-600"
                                onClick={() => handleUpdateOrderStatus(order.id, "cancelled")}
                              >
                                <AlertCircle className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      
      {/* Ban User Confirmation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAction === "ban" ? "Ban User" : "Unban User"}
            </DialogTitle>
            <DialogDescription>
              {dialogAction === "ban"
                ? "Are you sure you want to ban this user? They will no longer be able to make purchases."
                : "Are you sure you want to unban this user? They will be able to use the platform again."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="default" 
              onClick={confirmBanUser}
              className={dialogAction === "ban" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {dialogAction === "ban" ? "Ban User" : "Unban User"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}