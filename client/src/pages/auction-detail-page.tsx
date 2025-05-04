import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Clock, DollarSign, User, Users } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";

interface AuctionDetailProps {}

export default function AuctionDetailPage({}: AuctionDetailProps) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [bidAmount, setBidAmount] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);
  
  // Query product details by ID
  const { data: product, isLoading: productLoading, error: productError } = useQuery({
    queryKey: ['/api/products', Number(id)],
    queryFn: async () => {
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) throw new Error('Failed to fetch product');
      return res.json();
    },
  });
  
  // Query auction details by product ID
  const { data: auction, isLoading: auctionLoading, error: auctionError } = useQuery({
    queryKey: ['/api/auctions', product?.id],
    queryFn: async () => {
      // This would be replaced with a real API call to get auction details by product ID
      // For now, this is a placeholder until we implement the proper endpoint
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) throw new Error('Failed to fetch auction');
      const product = await res.json();
      
      // Placeholder auction data
      return {
        id: 1,
        productId: product.id,
        startingPrice: product.price * 0.8,
        currentBid: product.price,
        bidIncrement: 5,
        buyNowPrice: product.price * 1.5,
        startsAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
        endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(), // 3 days from now
        status: 'active',
        bids: [
          { id: 1, bidder: 'User123', amount: product.price * 0.8, time: '1 day ago' },
          { id: 2, bidder: 'User456', amount: product.price * 0.9, time: '12 hours ago' },
          { id: 3, bidder: 'User789', amount: product.price, time: '6 hours ago' },
        ]
      };
    },
    enabled: !!product?.id, // Only run this query once we have the product ID
  });
  
  // Calculate time remaining until auction ends
  useEffect(() => {
    if (!auction?.endsAt) return;
    
    const calculateTimeRemaining = () => {
      const now = new Date();
      const endDate = new Date(auction.endsAt);
      
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
  }, [auction?.endsAt]);
  
  // Format currency
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };
  
  // Handle bid submission
  const handleBidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
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
    
    const minBid = (auction?.currentBid || auction?.startingPrice || 0) + (auction?.bidIncrement || 1);
    if (bidValue < minBid) {
      toast({
        title: "Bid Too Low",
        description: `Your bid must be at least ${formatCurrency(minBid)}.`,
        variant: "destructive",
      });
      return;
    }
    
    // Placeholder for bid submission
    toast({
      title: "Bid Placed!",
      description: `Your bid of ${formatCurrency(bidValue)} was placed successfully.`,
    });
    
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
  
  if (productLoading || auctionLoading) {
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
  
  if (productError || auctionError || !product || !auction) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-grow container mx-auto p-6">
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <h1 className="text-2xl font-bold">Auction Not Found</h1>
            <p className="text-gray-500">The auction you're looking for does not exist or has ended.</p>
            <Button onClick={() => navigate("/")}>Return Home</Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }
  
  const nextBidAmount = (auction.currentBid || auction.startingPrice) + auction.bidIncrement;
  
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-grow container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">{product.name}</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Product Image */}
        <div className="aspect-square rounded-lg overflow-hidden">
          <img 
            src={product.imageUrl ? `/api/images/${product.imageUrl}` : '/placeholder.jpg'} 
            alt={product.name}
            className="w-full h-full object-cover"
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
              <span>{formatCurrency(auction.startingPrice)}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Current Bid:</span>
              <span className="font-bold text-green-600">{formatCurrency(auction.currentBid || auction.startingPrice)}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Bid Increment:</span>
              <span>{formatCurrency(auction.bidIncrement)}</span>
            </div>
            {auction.buyNowPrice && (
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Buy Now Price:</span>
                <span className="font-bold">{formatCurrency(auction.buyNowPrice)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Total Bids:</span>
              <span>{auction.bids?.length || 0}</span>
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
              
              {auction.buyNowPrice && (
                <Button 
                  onClick={handleBuyNow} 
                  variant="outline" 
                  className="w-full border-green-600 text-green-600 hover:bg-green-50"
                >
                  Buy Now for {formatCurrency(auction.buyNowPrice)}
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
              {auction.bids && auction.bids.length > 0 ? (
                <div className="space-y-4">
                  {auction.bids.map((bid) => (
                    <div key={bid.id} className="flex items-center justify-between border-b pb-3">
                      <div className="flex items-center">
                        <User className="w-5 h-5 mr-2 text-gray-500" />
                        <span>{bid.bidder}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatCurrency(bid.amount)}</div>
                        <div className="text-sm text-gray-500">{bid.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-4 text-gray-500">No bids have been placed yet.</p>
              )}
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
                  <span>{product.category || 'Uncategorized'}</span>
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
              <div className="text-center py-4">
                <Button asChild variant="outline">
                  <Link href={`/seller/${product.sellerId}`}>
                    View Seller Profile
                  </Link>
                </Button>
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