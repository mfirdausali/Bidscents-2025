import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Clock, DollarSign, User, Users, CheckCircle, MessageCircle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { useAuth } from "@/hooks/use-supabase-auth";
import { formatDateTime } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/utils";

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
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  
  // Calculate the next minimum bid amount (memoized to avoid unnecessary rerenders)
  const getNextBidAmount = useCallback((auctionData: Auction | undefined) => {
    if (!auctionData) return 0;
    return (auctionData.currentBid || auctionData.startingPrice) + auctionData.bidIncrement;
  }, []);

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
    // Determine the correct host and port
    const isDevelopment = import.meta.env.DEV;
    const host = isDevelopment ? 'localhost:3000' : window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;
    console.log('🎯 [AuctionDetail] WebSocket URL:', wsUrl, '(dev mode:', isDevelopment, ')');
    
    // Create WebSocket connection
    socket.current = new WebSocket(wsUrl);
    
    socket.current.onopen = () => {
      setWsConnected(true);
      console.log("WebSocket connected");
      
      // First authenticate if the user is logged in
      if (user?.id && socket.current?.readyState === WebSocket.OPEN) {
        const appToken = localStorage.getItem('app_token');
        if (appToken) {
          console.log("🔐 Authenticating auction WebSocket with JWT token");
          socket.current.send(JSON.stringify({
            type: 'auth',
            token: appToken
          }));
        } else {
          console.log("⚠️ No app token found for auction WebSocket authentication");
        }
      }
      
      // Then join auction room (regardless of authentication status)
      if (socket.current?.readyState === WebSocket.OPEN) {
        console.log(`Joining auction room ${id} as ${user?.id || 'guest'}`);
        socket.current.send(JSON.stringify({
          type: 'joinAuction',
          auctionId: parseInt(id),
          userId: user?.id || 'guest' // Use 'guest' for non-authenticated users
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
          
          // Check if this bid is from the current user and matches our temporary bid
          const isCurrentUserBid = user && newBid.bidderId === user.id;
          
          // For a user's own bid, replace the temporary bid with the confirmed one
          setLocalBids(prev => {
            // Look for a temporary bid from this user with matching amount
            if (isCurrentUserBid) {
              // Find any temp bids that match this user's bid amount (approximately)
              const tempBidIndex = prev.findIndex(b => 
                b.bidderId === newBid.bidderId && 
                Math.abs(b.amount - newBid.amount) < 0.001
              );
              
              // If we found a matching temp bid, replace it
              if (tempBidIndex >= 0) {
                const newBids = [...prev];
                newBids[tempBidIndex] = newBid;
                return newBids;
              }
            }
            
            // For other users' bids, just add to the list
            return [newBid, ...prev];
          });
          
          // Update auction data if provided in the message
          if (data.auction) {
            // Create optimistic update for auction data
            queryClient.setQueryData(['/api/auctions', id], (oldData: any) => {
              if (!oldData) return null;
              
              // Update the auction data while preserving other properties
              return {
                ...oldData,
                currentBid: data.auction.currentBid,
                currentBidderId: data.auction.currentBidderId,
                bidCount: (oldData.bidCount || 0) + 1
              };
            });
          } else {
            // If auction data not provided, invalidate to get fresh data
            queryClient.invalidateQueries({ queryKey: ['/api/auctions', id] });
          }
          
          // Notification for new bids
          if (user && newBid.bidderId !== user.id) {
            toast({
              title: "New Bid Placed",
              description: `A new bid of ${formatCurrency(newBid.amount)} has been placed.`,
            });
            
            // Update minimum bid amount after someone else bids
            if (auctionData) {
              const nextBid = newBid.amount + auctionData.bidIncrement;
              setBidAmount(nextBid.toString());
            }
          }
        }
        
        // Handle bid accepted message
        if (data.type === 'bidAccepted') {
          toast({
            title: "Bid Accepted",
            description: data.message,
          });
        }
        
        // Handle error messages
        if (data.type === 'error') {
          toast({
            title: "Error",
            description: data.message,
            variant: "destructive"
          });
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
            userId: user?.id || 'guest'
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
    
    // Prevent sellers from bidding on their own auctions
    if (auctionData.product?.seller && user.id === auctionData.product.seller.id) {
      toast({
        title: "Cannot Bid on Your Own Listing",
        description: "You are not allowed to bid on your own listings.",
        variant: "destructive",
      });
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
  
  // Handle Buy Now - direct to seller messaging with template
  const handleBuyNow = () => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'You need to log in to purchase items.',
        variant: 'default',
      });
      navigate('/auth');
      return;
    }

    if (!auctionData?.product?.seller) {
      toast({
        title: 'Error',
        description: 'Could not find seller information.',
        variant: 'destructive',
      });
      return;
    }

    const seller = auctionData.product.seller;
    const productName = auctionData.product.name;

    // Don't allow messaging yourself
    if (user.id === seller.id) {
      toast({
        title: 'Cannot Purchase Your Own Item',
        description: 'This is your own auction listing.',
        variant: 'default',
      });
      return;
    }

    toast({
      title: "Contacting Seller",
      description: "Redirecting you to message the seller about this purchase.",
    });
    
    // Create a template message for Buy Now
    const templateMessage = `Hi ${seller.username}, I would like to buy "${productName}" at the Buy Now price of ${formatCurrency(auctionData.buyNowPrice)}.`;
    
    // Store the selected seller information and template message in sessionStorage
    sessionStorage.setItem('selectedConversation', JSON.stringify({
      userId: seller.id,
      username: seller.username,
      profileImage: seller.avatar_url || null,
      productId: auctionData.productId,
      productName,
      templateMessage
    }));
    
    // Navigate to messages page
    navigate('/messages');
  };
  
  // Calculate next bid amount (only if we have auction data)
  const nextBidAmount = auctionData ? getNextBidAmount(auctionData) : 0;
  
  // Extract product from auction data (safely)
  const product = auctionData?.product;
  
  // Set the default bid amount when auction data loads or changes
  useEffect(() => {
    if (auctionData) {
      const nextBid = getNextBidAmount(auctionData);
      setBidAmount(nextBid.toString());
    }
  }, [auctionData, getNextBidAmount]);

  // LOADING STATE
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
  
  // ERROR STATE
  if (auctionError || !auctionData) {
    console.error("Auction detail error condition triggered:", { 
      auctionError, 
      auctionData: auctionData || "No auction data"
    });
    
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-grow container mx-auto p-6">
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <h1 className="text-2xl font-bold">Auction Not Found</h1>
            <p className="text-gray-500">The auction you're looking for does not exist or has ended.</p>
            {auctionData && <p className="text-red-500">Debug: Auction ID {auctionData.id} has issues</p>}
            <Button onClick={() => navigate("/")}>Return Home</Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }
  
  // MISSING PRODUCT STATE
  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-grow container mx-auto p-6">
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <h1 className="text-2xl font-bold">Product Information Unavailable</h1>
            <p className="text-gray-500">We're having trouble loading the product details for this auction.</p>
            <p className="text-gray-500">Auction ID: {auctionData.id}</p>
            <Button onClick={() => navigate("/")}>Return Home</Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-grow container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">{product.name}</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Product Image */}
          <div>
            <div className="aspect-square rounded-lg overflow-hidden bg-gray-50 mb-4">
              <img 
                src={product.images && product.images.length > 0 
                  ? `/api/images/${product.images[currentImageIndex]?.imageUrl}` 
                  : product.imageUrl 
                    ? `/api/images/${product.imageUrl}` 
                    : '/placeholder.jpg'} 
                alt={product.name}
                className="w-full h-full object-cover max-h-[500px]"
              />
            </div>
            
            {/* Image thumbnails */}
            {product.images && product.images.length > 0 && (
              <div className="flex space-x-2 mt-2 overflow-x-auto">
                {product.images.map((image, index) => (
                  <div 
                    key={image.id} 
                    className={`w-16 h-16 rounded-md overflow-hidden cursor-pointer border-2 ${
                      currentImageIndex === index ? 'border-amber-500' : 'border-transparent'
                    }`}
                    onClick={() => setCurrentImageIndex(index)}
                  >
                    <img 
                      src={`/api/images/${image.imageUrl}`} 
                      alt={`${product.name} - Image ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
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
            
            {/* Seller information */}
            {product.seller && (
              <div className="flex items-center mb-4 text-sm bg-gray-50 p-3 rounded-md">
                <div className="flex-1">
                  <p className="font-medium">Seller: {product.seller.username || 'Seller'}</p>
                  <p className="text-gray-500 text-xs">Trusted Seller</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (!user) {
                        toast({
                          title: 'Authentication Required',
                          description: 'You need to log in to contact sellers.',
                          variant: 'default',
                        });
                        navigate('/auth');
                        return;
                      }
                      
                      // Don't allow messaging yourself
                      if (user.id === product.seller.id) {
                        toast({
                          title: 'Cannot Message Yourself',
                          description: 'This is your own auction listing.',
                          variant: 'default',
                        });
                        return;
                      }
                      
                      // Create a template message for the conversation
                      const templateMessage = `Hi ${product.seller.username}, I am interested in your auction for "${product.name}".`;
                      
                      // Store the selected seller information and template message in sessionStorage
                      sessionStorage.setItem('selectedConversation', JSON.stringify({
                        userId: product.seller.id,
                        username: product.seller.username || 'Seller',
                        profileImage: product.seller.profileImage || null,
                        productId: product.id,
                        productName: product.name,
                        templateMessage
                      }));
                      
                      navigate('/messages');
                    }}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Contact Seller
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/sellers/${product.sellerId}`}>View Seller</Link>
                  </Button>
                </div>
              </div>
            )}
            
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
              {!!auctionData.buyNowPrice && (
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
                {user ? (
                  <>
                    <form onSubmit={handleBidSubmit} className="flex gap-2">
                      <Input 
                        type="number" 
                        placeholder={`Min bid: ${formatCurrency(nextBidAmount)}`}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        step={auctionData.bidIncrement.toString()}
                        min={nextBidAmount}
                        className="flex-grow"
                      />
                      <Button type="submit" className="bg-amber-500 hover:bg-amber-600">
                        Place Bid
                      </Button>
                    </form>
                    
                    {!!auctionData.buyNowPrice && (
                      <Button 
                        onClick={handleBuyNow} 
                        variant="outline" 
                        className="w-full border-green-600 text-green-600 hover:bg-green-50"
                      >
                        Buy Now for {formatCurrency(auctionData.buyNowPrice)}
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="border border-amber-200 bg-amber-50 p-4 rounded-lg text-center">
                    <p className="text-amber-800 mb-3">Sign in to participate in this auction</p>
                    <Button asChild className="bg-purple-600 hover:bg-purple-700">
                      <Link href={`/login?redirect=/auctions/${id}`}>
                        Sign In to Bid
                      </Link>
                    </Button>
                  </div>
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bidHistory">Bid History</TabsTrigger>
            <TabsTrigger value="details">Product Details</TabsTrigger>
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
                      {/* Highest bid indicator */}
                      {localBids.length > 0 && (
                        <div className="mb-2 text-sm text-gray-500">
                          The highest bid is shown at the top
                        </div>
                      )}
                      
                      {/* Show local bids first (from WebSocket) */}
                      {localBids.map((bid: Bid, index) => (
                        <div 
                          key={`local-${bid.id}`} 
                          className={`flex items-center justify-between border-b pb-3 p-2 rounded ${
                            index === 0 ? 'bg-green-50' : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center">
                            <User className="w-5 h-5 mr-2 text-gray-500" />
                            <span>{bid.bidder || `Bidder #${bid.bidderId}`}</span>
                            {user && bid.bidderId === user.id && (
                              <Badge className="ml-2 bg-purple-100 text-purple-800 text-xs">You</Badge>
                            )}
                            {index === 0 && (
                              <Badge className="ml-2 bg-green-100 text-green-800 text-xs">Highest</Badge>
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
                      {auctionData.bids && auctionData.bids.map((bid: Bid, index) => {
                        // Skip bids that are already shown in localBids
                        if (localBids.some(localBid => localBid.id === bid.id)) {
                          return null;
                        }
                        
                        return (
                          <div 
                            key={bid.id} 
                            className={`flex items-center justify-between border-b pb-3 p-2 ${
                              // Only highlight the first bid if there are no local bids
                              index === 0 && localBids.length === 0 ? 'bg-green-50 rounded' : ''
                            }`}
                          >
                            <div className="flex items-center">
                              <User className="w-5 h-5 mr-2 text-gray-500" />
                              <span>{bid.bidder || `Bidder #${bid.bidderId}`}</span>
                              {user && bid.bidderId === user.id && (
                                <Badge className="ml-2 bg-purple-100 text-purple-800 text-xs">You</Badge>
                              )}
                              {index === 0 && localBids.length === 0 && (
                                <Badge className="ml-2 bg-green-100 text-green-800 text-xs">Highest</Badge>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">{formatCurrency(bid.amount)}</div>
                              <div className="text-sm text-gray-500">
                                {formatDateTime(bid.placedAt)}
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
          

        </Tabs>
      </div>
      <Footer />
    </div>
  );
}