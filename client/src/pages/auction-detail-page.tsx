import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Clock, DollarSign, User, Users, CheckCircle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { useAuth } from "@/hooks/use-auth";

interface Bid {
  id: number;
  auctionId: number;
  bidderId: number;
  amount: number;
  placedAt: string;
  isWinning: boolean;
  bidder?: string; // Display name for bidder
}

interface Auction {
  id: number;
  productId: number;
  startingPrice: number;
  currentBid: number | null;
  bidIncrement: number;
  buyNowPrice: number | null;
  startsAt: string;
  endsAt: string;
  status: string;
  bidCount?: number;
  bids?: Bid[];
  product?: any; // Product details included in API response
}

interface AuctionDetailProps {}

export default function AuctionDetailPage({}: AuctionDetailProps) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [bidAmount, setBidAmount] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);
  const [localBids, setLocalBids] = useState<Bid[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const socket = useRef<WebSocket | null>(null);
  
  // Fetch auction details which includes product info
  const { 
    data: auctionData, 
    isLoading: auctionLoading, 
    error: auctionError 
  } = useQuery<Auction>({
    queryKey: ['/api/auctions', id],
    queryFn: async () => {
      console.log("Fetching auction data for ID:", id);
      const res = await fetch(`/api/auctions/${id}`);
      
      // Handle HTTP errors
      if (!res.ok) {
        console.error("Failed to fetch auction with status:", res.status);
        throw new Error(`Failed to fetch auction: ${res.status}`);
      }
      
      const data = await res.json();
      console.log("Received auction data:", data);
      
      // Handle cases where product is missing or has an error message
      if (!data.product || data.message === 'Product not found' || data.message === 'Error retrieving product details') {
        // Create a manually wrapped response that includes both auction and dummy product
        // This is a temporary fix to allow viewing the auction without the associated product
        console.warn("Product not found for auction, using placeholder data");
        const basicAuctionData = {
          ...data,
          product: {
            id: data.productId || 0,
            name: "Product Unavailable",
            description: "This product information is not available.",
            brand: "Unknown",
            imageUrl: null
          }
        };
        return basicAuctionData;
      }
      
      return data;
    },
    retry: 2,
  });
  
  // WebSocket connection for real-time bid updates
  useEffect(() => {
    if (!id) return;
    
    // Setup WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    // Create WebSocket connection
    socket.current = new WebSocket(wsUrl);
    
    socket.current.onopen = () => {
      setWsConnected(true);
      console.log("WebSocket connected");
      
      // Join auction room
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(JSON.stringify({
          type: 'joinAuction',
          auctionId: parseInt(id),
          userId: user?.id || 0
        }));
      }
    };
    
    socket.current.onclose = () => {
      setWsConnected(false);
      console.log("WebSocket disconnected");
    };
    
    socket.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      toast({
        title: "Connection Error",
        description: "Could not connect to bid updates. Please refresh the page.",
        variant: "destructive"
      });
    };
    
    socket.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'newBid' && data.auctionId === parseInt(id)) {
          // Update bid list with new bid
          const newBid: Bid = data.bid;
          
          // Update local bids state
          setLocalBids(prev => [newBid, ...prev]);
          
          // Refresh auction data through React Query
          queryClient.invalidateQueries({ queryKey: ['/api/auctions', id] });
          
          // Notification for new bids
          if (user && newBid.bidderId !== user.id) {
            toast({
              title: "New Bid Placed",
              description: `A new bid of ${formatCurrency(newBid.amount)} has been placed.`,
            });
          }
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };
    
    // Cleanup function
    return () => {
      if (socket.current) {
        // Leave auction room
        if (socket.current.readyState === WebSocket.OPEN) {
          socket.current.send(JSON.stringify({
            type: 'leaveAuction',
            auctionId: parseInt(id),
            userId: user?.id || 0
          }));
        }
        
        socket.current.close();
      }
    };
  }, [id, user?.id, toast]);

  // Calculate time remaining until auction ends
  useEffect(() => {
    if (!auctionData?.endsAt) return;
    
    const calculateTimeRemaining = () => {
      const now = new Date();
      const endDate = new Date(auctionData.endsAt);
      
      // If auction has ended
      if (now > endDate) {
        setIsActive(false);
        setTimeRemaining("Auction Ended");
        return;
      }
      
      const diffMs = endDate.getTime() - now.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      
      setTimeRemaining(`${diffDays}d ${diffHours}h ${diffMinutes}m ${diffSeconds}s`);
    };
    
    // Initial calculation
    calculateTimeRemaining();
    
    // Update every second
    const interval = setInterval(calculateTimeRemaining, 1000);
    
    return () => clearInterval(interval);
  }, [auctionData?.endsAt]);
  
  // Format currency
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };
  
  // Handle bid submission
  const handleBidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!auctionData || !user) {
      // If user is not logged in
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "You need to be logged in to place a bid.",
          variant: "destructive",
        });
        return;
      }
      
      return;
    }
    
    // Validate bid amount
    const bidValue = parseFloat(bidAmount);
    if (isNaN(bidValue)) {
      toast({
        title: "Invalid Bid Amount",
        description: "Please enter a valid number.",
        variant: "destructive",
      });
      return;
    }
    
    const minBid = (auctionData.currentBid || auctionData.startingPrice) + auctionData.bidIncrement;
    if (bidValue < minBid) {
      toast({
        title: "Bid Too Low",
        description: `Your bid must be at least ${formatCurrency(minBid)}.`,
        variant: "destructive",
      });
      return;
    }
    
    // Check if the WebSocket connection is active
    if (!wsConnected || !socket.current || socket.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Connection Error",
        description: "Unable to place bid due to connection issues. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }
    
    // Send bid via WebSocket
    try {
      const bidMessage = {
        type: 'placeBid',
        auctionId: parseInt(id),
        userId: user.id,
        amount: bidValue,
        timestamp: new Date().toISOString()
      };
      
      socket.current.send(JSON.stringify(bidMessage));
      
      // Add temporary bid to local state (will be confirmed by server)
      const tempBid: Bid = {
        id: Date.now(), // Temporary ID until confirmed
        auctionId: parseInt(id),
        bidderId: user.id,
        amount: bidValue,
        placedAt: new Date().toISOString(),
        isWinning: true,
        bidder: user.username
      };
      
      setLocalBids(prev => [tempBid, ...prev]);
      
      // Optimistic UI update
      toast({
        title: "Bid Placed!",
        description: `Your bid of ${formatCurrency(bidValue)} was placed successfully.`,
      });
      
    } catch (error) {
      console.error("Error sending bid:", error);
      toast({
        title: "Error",
        description: "Failed to place bid. Please try again.",
        variant: "destructive",
      });
    }
    
    // Clear bid amount
    setBidAmount("");
  };
  
  // Handle Buy Now
  const handleBuyNow = () => {
    toast({
      title: "Purchase Successful!",
      description: "You have purchased this item at the Buy Now price.",
    });
    
    // Would redirect to checkout in a real implementation
    setTimeout(() => {
      navigate("/");
    }, 2000);
  };
  
  if (auctionLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-grow container mx-auto p-6">
          <div className="flex flex-col gap-4">
            <div className="h-8 bg-gray-200 animate-pulse rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="aspect-square bg-gray-200 animate-pulse rounded"></div>
              <div className="flex flex-col gap-4">
                <div className="h-8 bg-gray-200 animate-pulse rounded"></div>
                <div className="h-6 bg-gray-200 animate-pulse rounded"></div>
                <div className="h-6 bg-gray-200 animate-pulse rounded"></div>
                <div className="h-12 bg-gray-200 animate-pulse rounded mt-4"></div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }
  
  if (auctionError || !auctionData || !auctionData.product) {
    console.error("Auction detail error condition triggered:", { 
      auctionError, 
      auctionData: auctionData || "No auction data", 
      hasProduct: auctionData ? Boolean(auctionData.product) : false 
    });
    
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-grow container mx-auto p-6">
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <h1 className="text-2xl font-bold">Auction Not Found</h1>
            <p className="text-gray-500">The auction you're looking for does not exist or has ended.</p>
            {auctionData && <p className="text-red-500">Debug: Product missing from auction {auctionData.id}</p>}
            <Button onClick={() => navigate("/")}>Return Home</Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }
  
  // Extract product from auction data and calculate next bid amount
  const product = auctionData.product;
  const nextBidAmount = (auctionData.currentBid || auctionData.startingPrice) + auctionData.bidIncrement;
  
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-grow container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">{product.name}</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Product Image */}
          <div className="aspect-square rounded-lg overflow-hidden bg-gray-50">
            <img 
              src={product.images && product.images.length > 0 
                ? `/api/images/${product.images[0]?.imageUrl}` 
                : product.imageUrl 
                  ? `/api/images/${product.imageUrl}` 
                  : '/placeholder.jpg'} 
              alt={product.name}
              className="w-full h-full object-cover max-h-[500px]"
            />
          </div>
          
          {/* Auction Details */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <Badge className="bg-amber-500 hover:bg-amber-600 text-md py-1 px-3">
                Auction
              </Badge>
              <div className="flex items-center text-orange-500 font-semibold">
                <Clock className="w-5 h-5 mr-2" />
                {timeRemaining}
              </div>
            </div>
            
            <h2 className="text-2xl font-semibold mb-2">{product.brand} {product.name}</h2>
            <p className="text-gray-600 mb-4">{product.description}</p>
            
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Starting Price:</span>
                <span>{formatCurrency(auctionData.startingPrice)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Current Bid:</span>
                <span className="font-bold text-green-600">{formatCurrency(auctionData.currentBid || auctionData.startingPrice)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Bid Increment:</span>
                <span>{formatCurrency(auctionData.bidIncrement)}</span>
              </div>
              {auctionData.buyNowPrice && (
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Buy Now Price:</span>
                  <span className="font-bold">{formatCurrency(auctionData.buyNowPrice)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Total Bids:</span>
                <span>{auctionData.bidCount || auctionData.bids?.length || 0}</span>
              </div>
            </div>
            
            {isActive ? (
              <div className="space-y-4">
                <form onSubmit={handleBidSubmit} className="flex gap-2">
                  <Input 
                    type="number" 
                    placeholder={`Min bid: ${formatCurrency(nextBidAmount)}`}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    step="0.01"
                    min={nextBidAmount}
                    className="flex-grow"
                  />
                  <Button type="submit" className="bg-amber-500 hover:bg-amber-600">
                    Place Bid
                  </Button>
                </form>
                
                {auctionData.buyNowPrice && (
                  <Button 
                    onClick={handleBuyNow} 
                    variant="outline" 
                    className="w-full border-green-600 text-green-600 hover:bg-green-50"
                  >
                    Buy Now for {formatCurrency(auctionData.buyNowPrice)}
                  </Button>
                )}
              </div>
            ) : (
              <div className="bg-red-50 p-4 rounded-lg text-center">
                <p className="text-red-600 font-semibold">This auction has ended</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Tabs for additional information */}
        <Tabs defaultValue="bidHistory" className="mt-8">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="bidHistory">Bid History</TabsTrigger>
            <TabsTrigger value="details">Product Details</TabsTrigger>
            <TabsTrigger value="seller">Seller Information</TabsTrigger>
          </TabsList>
          
          <TabsContent value="bidHistory" className="p-4">
            <Card>
              <CardHeader>
                <CardTitle>Bid History</CardTitle>
              </CardHeader>
              <CardContent>
                {/* WebSocket connection status */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-500">Real-time updates</span>
                  <span className={`text-sm flex items-center ${wsConnected ? 'text-green-500' : 'text-red-500'}`}>
                    <span className={`h-2 w-2 rounded-full mr-1 ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    {wsConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                
                {/* Scrollable bid history */}
                <div className="h-80 overflow-y-auto border rounded-md p-4 bg-gray-50">
                  {(auctionData.bids && auctionData.bids.length > 0) || localBids.length > 0 ? (
                    <div className="space-y-4">
                      {/* Show local bids first (from WebSocket) */}
                      {localBids.map((bid: Bid) => (
                        <div key={`local-${bid.id}`} className="flex items-center justify-between border-b pb-3 bg-green-50 p-2 rounded">
                          <div className="flex items-center">
                            <User className="w-5 h-5 mr-2 text-gray-500" />
                            <span>{bid.bidder || `Bidder #${bid.bidderId}`}</span>
                            {user && bid.bidderId === user.id && (
                              <Badge className="ml-2 bg-purple-100 text-purple-800 text-xs">You</Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{formatCurrency(bid.amount)}</div>
                            <div className="text-sm text-gray-500">
                              {new Date(bid.placedAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* Show bids from the database */}
                      {auctionData.bids && auctionData.bids.map((bid: Bid) => {
                        // Skip bids that are already shown in localBids
                        if (localBids.some(localBid => localBid.id === bid.id)) {
                          return null;
                        }
                        
                        return (
                          <div key={bid.id} className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center">
                              <User className="w-5 h-5 mr-2 text-gray-500" />
                              <span>{bid.bidder || `Bidder #${bid.bidderId}`}</span>
                              {user && bid.bidderId === user.id && (
                                <Badge className="ml-2 bg-purple-100 text-purple-800 text-xs">You</Badge>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">{formatCurrency(bid.amount)}</div>
                              <div className="text-sm text-gray-500">
                                {new Date(bid.placedAt).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-center py-4 text-gray-500">No bids have been placed yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="details" className="p-4">
            <Card>
              <CardHeader>
                <CardTitle>Product Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {product.remainingPercentage && (
                    <div className="flex justify-between">
                      <span className="font-medium">Remaining:</span>
                      <span>{product.remainingPercentage}%</span>
                    </div>
                  )}
                  {product.batchCode && (
                    <div className="flex justify-between">
                      <span className="font-medium">Batch Code:</span>
                      <span>{product.batchCode}</span>
                    </div>
                  )}
                  {product.purchaseYear && (
                    <div className="flex justify-between">
                      <span className="font-medium">Purchase Year:</span>
                      <span>{product.purchaseYear}</span>
                    </div>
                  )}
                  {product.boxCondition && (
                    <div className="flex justify-between">
                      <span className="font-medium">Box Condition:</span>
                      <span>{product.boxCondition}</span>
                    </div>
                  )}
                  {product.volume && (
                    <div className="flex justify-between">
                      <span className="font-medium">Volume:</span>
                      <span>{product.volume} ml</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-medium">Category:</span>
                    <span>{product.category?.name || 'Uncategorized'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Brand:</span>
                    <span>{product.brand}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="seller" className="p-4">
            <Card>
              <CardHeader>
                <CardTitle>Seller Information</CardTitle>
              </CardHeader>
              <CardContent>
                {product.seller ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center space-x-2 mb-4">
                      <div className="h-16 w-16 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                        {product.seller.profileImage ? (
                          <img 
                            src={`/api/images/${product.seller.profileImage}`} 
                            alt={product.seller.username || 'Seller'} 
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <User className="h-8 w-8 text-gray-400" />
                        )}
                      </div>
                      <div className="text-center">
                        <h3 className="text-lg font-medium">{product.seller.username || 'Seller'}</h3>
                        <div className="flex items-center space-x-1 text-sm text-gray-500">
                          {product.seller.isVerified && (
                            <span className="flex items-center text-blue-500">
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Verified
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-center py-2">
                      <Button asChild variant="outline">
                        <Link href={`/seller/${product.sellerId}`}>
                          View Seller Profile
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <p>Seller information is not available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <Footer />
    </div>
  );
}