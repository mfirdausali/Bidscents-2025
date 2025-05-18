import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Clock } from 'lucide-react';

interface PaymentCountdownProps {
  createdAt: string | Date;
  timeLimit: number; // In minutes
}

export function PaymentCountdown({ createdAt, timeLimit = 30 }: PaymentCountdownProps) {
  const [remainingMinutes, setRemainingMinutes] = useState<number>(calculateRemainingMinutes());
  const [progress, setProgress] = useState<number>(100);
  
  // Calculate remaining time when component mounts and every minute after
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = calculateRemainingMinutes();
      setRemainingMinutes(remaining);
      setProgress((remaining / timeLimit) * 100);
      
      // Clear interval if time is up
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 60000); // Update every minute
    
    // Initial calculation
    const remaining = calculateRemainingMinutes();
    setRemainingMinutes(remaining);
    setProgress((remaining / timeLimit) * 100);
    
    return () => clearInterval(timer);
  }, [createdAt, timeLimit]);
  
  // Calculate minutes remaining from now until expiration
  function calculateRemainingMinutes(): number {
    const created = new Date(createdAt);
    const expiration = new Date(created.getTime() + timeLimit * 60000);
    const now = new Date();
    
    const diffMs = expiration.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    
    return Math.max(0, diffMinutes);
  }
  
  // Determine text color based on remaining time
  const getTextColorClass = () => {
    if (remainingMinutes <= 5) return 'text-red-500';
    if (remainingMinutes <= 10) return 'text-amber-500';
    return 'text-emerald-500';
  };
  
  if (remainingMinutes <= 0) {
    return (
      <Card className="m-2 border-red-200 bg-red-50">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Clock className="mr-2 h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-red-700">
                Payment window expired
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="m-2 border-blue-200 bg-blue-50">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center">
            <Clock className="mr-2 h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">
              Payment window: <span className={getTextColorClass()}>{remainingMinutes} minutes remaining</span>
            </span>
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />
      </CardContent>
    </Card>
  );
}