import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { CheckCircle2, Sparkles } from 'lucide-react';

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
  id,
  name,
  packageType,
  itemCount,
  price,
  durationHours,
  effectivePrice,
  duration_formatted,
  onSelect
}: BoostPackageProps) {
  const isPremium = packageType === 'premium';
  
  return (
    <Card className={`overflow-hidden ${isPremium ? 'border-purple-300' : ''}`}>
      <div className={`p-2 text-center text-white font-medium ${isPremium ? 'bg-purple-600' : 'bg-primary'}`}>
        {isPremium ? (
          <div className="flex items-center justify-center">
            <Sparkles className="h-4 w-4 mr-1" />
            <span>Premium Boost</span>
          </div>
        ) : (
          <span>Standard Boost</span>
        )}
      </div>
      
      <CardHeader className="pb-2 pt-4">
        <h3 className="text-lg font-bold text-center">{name}</h3>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="text-center">
          <p className="text-3xl font-bold">
            RM {(price / 100).toFixed(2)}
          </p>
          <p className="text-sm text-muted-foreground">
            {itemCount > 1 ? `${itemCount} Products` : '1 Product'}
          </p>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex items-start">
            <CheckCircle2 className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
            <span>Duration: {duration_formatted}</span>
          </div>
          
          <div className="flex items-start">
            <CheckCircle2 className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
            <span>Homepage feature</span>
          </div>
          
          <div className="flex items-start">
            <CheckCircle2 className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
            <span>Priority in search results</span>
          </div>
          
          {isPremium && (
            <>
              <div className="flex items-start">
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
                <span>Extended visibility</span>
              </div>
              <div className="flex items-start">
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
                <span>Enhanced product badge</span>
              </div>
            </>
          )}
        </div>
        
        {itemCount > 1 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-center text-muted-foreground">
              Effective price: RM {(effectivePrice / 100).toFixed(2)} per product
            </p>
          </div>
        )}
      </CardContent>
      
      <CardFooter>
        <Button 
          className={`w-full ${isPremium ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
          onClick={() => onSelect(id)}
        >
          Select Package
        </Button>
      </CardFooter>
    </Card>
  );
}