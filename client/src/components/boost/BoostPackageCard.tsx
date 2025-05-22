import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface BoostPackageProps {
  id: number;
  name: string;
  packageType: string;
  itemCount: number;
  price: number;
  durationHours: number;
  effectivePrice: number;
  duration_formatted: string;
  onSelect: (packageId: number) => void;
}

export function BoostPackageCard({ 
  id, name, packageType, itemCount, price, durationHours, effectivePrice, duration_formatted, onSelect 
}: BoostPackageProps) {
  const formattedPrice = (price / 100).toFixed(2);
  const formattedEffectivePrice = typeof effectivePrice === 'number' 
    ? effectivePrice.toFixed(2) 
    : (price / 100 / itemCount).toFixed(2);
  
  const isPremium = packageType === 'premium';
  
  return (
    <Card className={`w-full ${isPremium ? 'border-purple-400 bg-purple-50' : ''}`}>
      <CardHeader>
        <CardTitle className={isPremium ? 'text-purple-700' : ''}>
          {name}
        </CardTitle>
        <CardDescription>
          Boost {itemCount} {itemCount === 1 ? 'product' : 'products'} for {duration_formatted}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold mb-2">RM {formattedPrice}</div>
        <p className="text-sm text-muted-foreground">
          Effective price: RM {formattedEffectivePrice} per item
        </p>
        <div className="mt-4 text-sm">
          <ul className="list-disc pl-5 space-y-1">
            <li>Featured on homepage</li>
            <li>Priority in search results</li>
            <li>
              {isPremium 
                ? 'Extended visibility (36 hours)' 
                : 'Standard visibility (15 hours)'}
            </li>
          </ul>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={() => onSelect(id)} 
          className={`w-full ${isPremium ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
        >
          Select Package
        </Button>
      </CardFooter>
    </Card>
  );
}