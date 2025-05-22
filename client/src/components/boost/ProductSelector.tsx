import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Product {
  id: number;
  name: string;
  image_url: string;
  price: number;
  is_featured: boolean;
  status: string;
}

interface ProductSelectorProps {
  requiredCount: number;
  onProductsSelected: (productIds: number[]) => void;
  onCancel: () => void;
}

export function ProductSelector({ requiredCount, onProductsSelected, onCancel }: ProductSelectorProps) {
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  
  const { data: products, isLoading, error } = useQuery({
    queryKey: ['/api/seller/products'],
    queryFn: async () => {
      const response = await fetch('/api/seller/products');
      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }
      return response.json();
    }
  });
  
  const toggleProduct = (productId: number) => {
    setSelectedProducts(current => {
      if (current.includes(productId)) {
        return current.filter(id => id !== productId);
      } else {
        // Only allow selecting up to requiredCount
        if (current.length < requiredCount) {
          return [...current, productId];
        }
        return current;
      }
    });
  };
  
  const handleSubmit = () => {
    if (selectedProducts.length === requiredCount) {
      onProductsSelected(selectedProducts);
    }
  };
  
  if (isLoading) {
    return (
      <div className="w-full">
        <h3 className="text-xl font-semibold mb-4">
          Select {requiredCount} {requiredCount === 1 ? 'Product' : 'Products'} to Boost
        </h3>
        <div className="border rounded-md divide-y">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center p-4">
              <Skeleton className="h-4 w-4 rounded-full" />
              <div className="ml-4 flex items-center flex-1">
                <Skeleton className="w-12 h-12 rounded-md mr-4" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        Error loading your products. Please try again.
      </div>
    );
  }
  
  // Filter active products only
  const activeProducts = products?.filter((product: Product) => product.status === 'active') || [];
  
  if (activeProducts.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="mb-4">You don't have any active products to boost.</p>
        <Button variant="outline" onClick={onCancel}>
          Go Back
        </Button>
      </div>
    );
  }
  
  return (
    <div className="w-full">
      <h3 className="text-xl font-semibold mb-4">
        Select {requiredCount} {requiredCount === 1 ? 'Product' : 'Products'} to Boost
      </h3>
      
      <div className="mb-4">
        <Badge variant="outline" className="text-sm">
          {selectedProducts.length} of {requiredCount} selected
        </Badge>
      </div>
      
      <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto">
        {activeProducts.map((product: Product) => (
          <div 
            key={product.id} 
            className={`flex items-center p-4 hover:bg-slate-50 ${
              product.is_featured ? 'bg-[#FFF9E6]' : ''
            }`}
          >
            <Checkbox
              checked={selectedProducts.includes(product.id)}
              onCheckedChange={() => toggleProduct(product.id)}
              disabled={selectedProducts.length >= requiredCount && !selectedProducts.includes(product.id)}
              id={`product-${product.id}`}
            />
            
            <div className="ml-4 flex items-center flex-1">
              {product.image_url && (
                <img 
                  src={`/api/images/${product.image_url}`} 
                  alt={product.name}
                  className="w-12 h-12 object-cover rounded-md mr-4"
                />
              )}
              
              <div className="flex-1">
                <label
                  htmlFor={`product-${product.id}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {product.name}
                </label>
                <p className="text-sm text-muted-foreground">
                  RM {(product.price / 100).toFixed(2)}
                </p>
              </div>
              
              {product.is_featured && (
                <Badge variant="secondary" className="ml-auto">
                  Currently Featured
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex justify-end space-x-4 mt-6">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={selectedProducts.length !== requiredCount}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}