import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BoostPackageCard } from './BoostPackageCard';
import { Skeleton } from '@/components/ui/skeleton';

interface BoostPackage {
  id: number;
  name: string;
  package_type: string;
  item_count: number;
  price: number;
  duration_hours: number;
  effective_price: number;
  duration_formatted: string;
  is_active: boolean;
}

interface BoostPackageSelectorProps {
  onSelectPackage: (packageId: number) => void;
}

export function BoostPackageSelector({ onSelectPackage }: BoostPackageSelectorProps) {
  const [activeTab, setActiveTab] = useState('standard');
  
  const { data: packages, isLoading, error } = useQuery({
    queryKey: ['/api/boost/packages'],
    queryFn: async () => {
      const response = await fetch('/api/boost/packages');
      if (!response.ok) {
        throw new Error('Failed to fetch boost packages');
      }
      const result = await response.json();
      // Handle both array response (for empty results) and object response
      if (Array.isArray(result)) {
        return result as BoostPackage[];
      }
      return result.data as BoostPackage[];
    }
  });
  
  if (isLoading) {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-center">
          Select a Boost Package
        </h2>
        <Tabs defaultValue="standard">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="standard">Standard Boost</TabsTrigger>
            <TabsTrigger value="premium">Premium Boost</TabsTrigger>
          </TabsList>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-full h-64 rounded-lg border p-4">
                <Skeleton className="h-8 w-3/4 mb-2" />
                <Skeleton className="h-4 w-5/6 mb-4" />
                <Skeleton className="h-6 w-1/3 mb-2" />
                <Skeleton className="h-4 w-2/3 mb-6" />
                <Skeleton className="h-20 w-full mb-4" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </Tabs>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        Error loading boost packages. Please try again.
      </div>
    );
  }
  
  // Helper function to format duration
  const formatDuration = (hours: number): string => {
    if (hours < 24) {
      return `${hours} hours`;
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      if (remainingHours === 0) {
        return `${days} day${days > 1 ? 's' : ''}`;
      } else {
        return `${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''}`;
      }
    }
  };
  
  const standardPackages = packages?.filter(pkg => pkg.package_type === 'standard') || [];
  const premiumPackages = packages?.filter(pkg => pkg.package_type === 'premium') || [];
  
  return (
    <div className="w-full max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">
        Select a Boost Package
      </h2>
      
      <Tabs defaultValue="standard" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="standard">Standard Boost</TabsTrigger>
          <TabsTrigger value="premium">Premium Boost</TabsTrigger>
        </TabsList>
        
        <TabsContent value="standard">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {standardPackages.map(pkg => (
              <BoostPackageCard
                key={pkg.id}
                id={pkg.id}
                name={pkg.name}
                packageType={pkg.package_type}
                itemCount={pkg.item_count}
                price={pkg.price}
                durationHours={pkg.duration_hours}
                effectivePrice={pkg.effective_price}
                duration_formatted={formatDuration(pkg.duration_hours)}
                onSelect={onSelectPackage}
              />
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="premium">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {premiumPackages.map(pkg => (
              <BoostPackageCard
                key={pkg.id}
                id={pkg.id}
                name={pkg.name}
                packageType={pkg.package_type}
                itemCount={pkg.item_count}
                price={pkg.price}
                durationHours={pkg.duration_hours}
                effectivePrice={pkg.effective_price}
                duration_formatted={formatDuration(pkg.duration_hours)}
                onSelect={onSelectPackage}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}