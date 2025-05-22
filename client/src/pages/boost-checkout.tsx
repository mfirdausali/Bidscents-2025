import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BoostPackageSelector } from '@/components/boost/BoostPackageSelector';
import { ProductSelector } from '@/components/boost/ProductSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { Loader2 } from 'lucide-react';

interface BoostPackage {
  id: number;
  name: string;
  package_type: string;
  item_count: number;
  price: number;
  duration_hours: number;
  effective_price: number;
  duration_formatted: string;
}

export default function BoostCheckoutPage() {
  const [step, setStep] = useState<'select-package' | 'select-products' | 'checkout'>('select-package');
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Get selected package details
  const { data: packageDetails, isLoading: loadingPackage } = useQuery({
    queryKey: ['/api/boost/packages', selectedPackage],
    queryFn: async () => {
      if (!selectedPackage) return null;
      const response = await fetch(`/api/boost/packages?id=${selectedPackage}`);
      if (!response.ok) throw new Error('Failed to fetch package details');
      const data = await response.json();
      return data[0] as BoostPackage;
    },
    enabled: !!selectedPackage
  });
  
  // Create boost order mutation
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/boost/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boostPackageId: selectedPackage,
          productIds: selectedProducts
        }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create boost order');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh product data
      queryClient.invalidateQueries({ queryKey: ['/api/seller/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/boost/seller-boosted'] });
      
      // Redirect to Billplz payment page
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        setLocation('/seller/dashboard?tab=boosted');
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating boost order',
        description: error.message || 'Please try again later',
        variant: 'destructive'
      });
    }
  });
  
  const handlePackageSelected = (packageId: number) => {
    setSelectedPackage(packageId);
    setStep('select-products');
  };
  
  const handleProductsSelected = (productIds: number[]) => {
    setSelectedProducts(productIds);
    setStep('checkout');
  };
  
  const handleCheckout = () => {
    if (selectedPackage && selectedProducts.length > 0) {
      createOrderMutation.mutate();
    }
  };
  
  const handleCancel = () => {
    if (step === 'select-products') {
      setStep('select-package');
    } else if (step === 'checkout') {
      setStep('select-products');
    } else {
      setLocation('/seller/dashboard');
    }
  };
  
  return (
    <div className="container max-w-5xl py-8">
      <h1 className="text-3xl font-bold mb-4">Boost Your Products</h1>
      <p className="text-muted-foreground mb-8">
        Increase visibility and sales by featuring your products on the homepage and in search results.
      </p>
      
      {step === 'select-package' && (
        <BoostPackageSelector onSelectPackage={handlePackageSelected} />
      )}
      
      {step === 'select-products' && packageDetails && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Selected Package: {packageDetails.name}</CardTitle>
              <CardDescription>
                Duration: {packageDetails.duration_formatted} • Price: RM {(packageDetails.price / 100).toFixed(2)}
              </CardDescription>
            </CardHeader>
          </Card>
          
          <ProductSelector
            requiredCount={packageDetails.item_count}
            onProductsSelected={handleProductsSelected}
            onCancel={handleCancel}
          />
        </div>
      )}
      
      {step === 'checkout' && packageDetails && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
              <CardDescription>
                Review your boost package details before proceeding to payment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium">Package</span>
                  <span>{packageDetails.name}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium">Duration</span>
                  <span>{packageDetails.duration_formatted}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium">Products</span>
                  <span>{selectedProducts.length}</span>
                </div>
                <div className="flex justify-between pt-2 text-lg font-bold">
                  <span>Total</span>
                  <span>RM {(packageDetails.price / 100).toFixed(2)}</span>
                </div>
              </div>
              
              <div className="flex justify-end space-x-4 mt-8">
                <Button variant="outline" onClick={handleCancel} disabled={createOrderMutation.isPending}>
                  Back
                </Button>
                <Button
                  onClick={handleCheckout}
                  disabled={createOrderMutation.isPending}
                  className={packageDetails.package_type === 'premium' ? 'bg-purple-600 hover:bg-purple-700' : ''}
                >
                  {createOrderMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Proceed to Payment'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}