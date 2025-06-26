import React, { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/ui/header';
import { Footer } from '@/components/ui/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Package, Clock, Star, ArrowRight } from 'lucide-react';
import { formatDateTimeNice } from '@/lib/date-utils';

interface BoostOrder {
  id: number;
  package_name: string;
  package_type: string;
  item_count: number;
  duration_hours: number;
  duration_formatted: string;
  price: number;
  status: string;
  created_at: string;
  expires_at: string;
  boosted_products: Array<{
    id: number;
    title: string;
    price: number;
    image_url: string;
    expires_at: string;
  }>;
}

export default function BoostSuccessPage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/boost/success/:orderId?');
  const [orderId, setOrderId] = useState<string | null>(null);

  // Extract orderId from URL parameters or query string
  useEffect(() => {
    if (params?.orderId) {
      setOrderId(params.orderId);
    } else {
      // Try to get from query parameters
      const urlParams = new URLSearchParams(window.location.search);
      const orderIdFromQuery = urlParams.get('orderId') || urlParams.get('order_id');
      if (orderIdFromQuery) {
        setOrderId(orderIdFromQuery);
      }
    }
  }, [params]);

  // Fetch boost order details
  const { data: orderDetails, isLoading, error } = useQuery({
    queryKey: ['/api/boost/order', orderId],
    queryFn: async () => {
      if (!orderId) throw new Error('Order ID is required');
      const response = await fetch(`/api/boost/order/${orderId}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch order details');
      }
      return response.json() as BoostOrder;
    },
    enabled: !!orderId,
    retry: 2
  });

  const handleViewBoostedProducts = () => {
    setLocation('/seller/dashboard?tab=boosted');
  };

  const handleBoostMoreProducts = () => {
    setLocation('/boost-checkout');
  };

  const handleBackToDashboard = () => {
    setLocation('/seller/dashboard');
  };

  if (!orderId) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container max-w-2xl py-16 mx-auto text-center">
          <div className="space-y-6">
            <div className="text-red-500">
              <CheckCircle className="h-16 w-16 mx-auto mb-4" />
              <h1 className="text-2xl font-bold">Order ID Missing</h1>
              <p className="text-muted-foreground mt-2">
                Unable to display order details. Please check your boost orders in the dashboard.
              </p>
            </div>
            <Button onClick={handleBackToDashboard}>
              Back to Dashboard
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container max-w-2xl py-16 mx-auto text-center">
          <div className="space-y-4">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-muted-foreground">Loading order details...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !orderDetails) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container max-w-2xl py-16 mx-auto text-center">
          <div className="space-y-6">
            <div className="text-red-500">
              <CheckCircle className="h-16 w-16 mx-auto mb-4" />
              <h1 className="text-2xl font-bold">Unable to Load Order</h1>
              <p className="text-muted-foreground mt-2">
                Failed to load order details. Please try again or contact support if the issue persists.
              </p>
            </div>
            <div className="flex justify-center space-x-4">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Try Again
              </Button>
              <Button onClick={handleBackToDashboard}>
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-4xl py-8 mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="text-green-500 mb-4">
            <CheckCircle className="h-20 w-20 mx-auto" />
          </div>
          <h1 className="text-3xl font-bold text-green-600 mb-2">
            Boost Order Successful!
          </h1>
          <p className="text-lg text-muted-foreground">
            Your products are now featured and will get increased visibility.
          </p>
        </div>

        {/* Order Details */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Order Summary
            </CardTitle>
            <CardDescription>
              Order #{orderDetails.id} • {formatDateTimeNice(new Date(orderDetails.created_at))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium">Package Type</span>
                  <Badge 
                    variant={orderDetails.package_type === 'premium' ? 'default' : 'secondary'}
                    className={orderDetails.package_type === 'premium' ? 'bg-purple-600' : ''}
                  >
                    {orderDetails.package_name}
                  </Badge>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium">Products Boosted</span>
                  <span>{orderDetails.boosted_products.length}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium">Duration</span>
                  <span>{orderDetails.duration_formatted}</span>
                </div>
                <div className="flex justify-between pt-2 font-bold">
                  <span>Total Paid</span>
                  <span>RM {(orderDetails.price / 100).toFixed(2)}</span>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Boost Active Until</span>
                </div>
                <p className="text-lg font-semibold">
                  {formatDateTimeNice(new Date(orderDetails.expires_at))}
                </p>
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-sm text-green-700">
                    Your products are now featured on the homepage and will appear at the top of search results.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Featured Products List */}
        {orderDetails.boosted_products.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                Your Boosted Products
              </CardTitle>
              <CardDescription>
                These products are now featured and getting increased visibility
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orderDetails.boosted_products.map((product) => (
                  <div key={product.id} className="border rounded-lg p-4">
                    <div className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden">
                      {product.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Package className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm mb-1 truncate">{product.title}</h3>
                    <p className="text-lg font-bold text-primary mb-2">
                      RM {(product.price / 100).toFixed(2)}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Until {formatDateTimeNice(new Date(product.expires_at))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Button 
            onClick={handleViewBoostedProducts}
            className="flex items-center gap-2"
          >
            View My Boosted Products
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            onClick={handleBoostMoreProducts}
            className="flex items-center gap-2"
          >
            <Star className="h-4 w-4" />
            Boost More Products
          </Button>
          <Button 
            variant="ghost" 
            onClick={handleBackToDashboard}
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
}