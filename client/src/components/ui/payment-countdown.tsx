import React, { useState, useEffect } from 'react';

interface PaymentCountdownProps {
  createdAt: string | Date;
  timeLimit: number; // In minutes
}

export function PaymentCountdown({ createdAt, timeLimit = 30 }: PaymentCountdownProps) {
  const [minutesRemaining, setMinutesRemaining] = useState(calculateRemainingMinutes());

  // Calculate remaining time on component mount and when createdAt changes
  function calculateRemainingMinutes(): number {
    const createdDate = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
    const expiryTime = new Date(createdDate.getTime() + timeLimit * 60 * 1000);
    const now = new Date();
    
    // Calculate minutes remaining
    const diffInMs = expiryTime.getTime() - now.getTime();
    const diffInMinutes = Math.max(0, Math.floor(diffInMs / (1000 * 60)));
    
    return diffInMinutes;
  }

  // Update the countdown every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = calculateRemainingMinutes();
      setMinutesRemaining(remaining);
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [createdAt, timeLimit]);

  // If time is up, show expired message
  if (minutesRemaining <= 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-center">
        <span className="text-amber-700 font-medium">
          ⏰ Payment window has expired
        </span>
      </div>
    );
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-center">
      <span className="text-amber-700 font-medium">
        ⏰ Payment window: {minutesRemaining} minutes remaining
      </span>
    </div>
  );
}