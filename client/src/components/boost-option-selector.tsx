import { useState, useEffect } from 'react';
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface BoostOption {
  id: number;
  name: string;
  duration_hours: number;
  price: number;
  description: string;
  duration_formatted: string;
  is_active: boolean;
}

interface BoostOptionSelectorProps {
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
}

export default function BoostOptionSelector({ value, onChange, className = '' }: BoostOptionSelectorProps) {
  const [options, setOptions] = useState<BoostOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchBoostOptions() {
      try {
        setLoading(true);
        const response = await fetch('/api/boost-options');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch boost options: ${response.statusText}`);
        }
        
        const data = await response.json();
        setOptions(data);
        
        // Auto-select first option if none selected
        if (!value && data.length > 0) {
          onChange(data[0].id.toString());
        }
      } catch (err) {
        console.error("Error fetching boost options:", err);
        setError("Unable to load boost options. Using default pricing (RM10.00 for 7 days).");
        
        // Create fallback options if fetch fails
        const fallbackOption = {
          id: 0,
          name: "7 Day Boost",
          duration_hours: 168,
          price: 1000,
          description: "7 days of featured product placement",
          duration_formatted: "7 days",
          is_active: true
        };
        
        setOptions([fallbackOption]);
        
        // Select fallback option
        if (!value) {
          onChange("0");
        }
      } finally {
        setLoading(false);
      }
    }
    
    fetchBoostOptions();
  }, [value, onChange]);
  
  if (loading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <h3 className="text-lg font-medium">Select Boost Duration</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center space-x-2 border p-4 rounded-md">
              <Skeleton className="h-4 w-4 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="text-lg font-medium">Select Boost Duration</h3>
      
      {error && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-3 text-sm text-amber-800">
            {error}
          </CardContent>
        </Card>
      )}
      
      <RadioGroup value={value || undefined} onValueChange={onChange}>
        <div className="grid gap-3">
          {options.map((option) => (
            <div 
              key={option.id} 
              className="flex items-start border rounded-lg p-3 hover:bg-accent transition-colors cursor-pointer"
              onClick={() => onChange(option.id.toString())}
            >
              <RadioGroupItem 
                value={option.id.toString()} 
                id={`option-${option.id}`} 
                className="mt-1"
              />
              <div className="ml-3">
                <Label 
                  htmlFor={`option-${option.id}`} 
                  className="text-base font-medium flex justify-between w-full cursor-pointer"
                >
                  <span>{option.name}</span>
                  <span className="text-primary font-semibold">
                    RM {(option.price / 100).toFixed(2)}
                  </span>
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {option.description}
                  <span className="block text-xs mt-1 text-gray-500">
                    Duration: {option.duration_formatted}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </RadioGroup>
    </div>
  );
}