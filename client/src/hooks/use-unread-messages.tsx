import { useState, useEffect } from 'react';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';
import { useQuery } from '@tanstack/react-query';

// This hook handles fetching and updating the unread message count
export function useUnreadMessages() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Use React Query to fetch the unread message count
  const {
    data: unreadCount = 0,
    isLoading: loading,
    error,
    refetch
  } = useQuery({
    queryKey: ['/api/messages/unread-count'],
    queryFn: async () => {
      if (!user) return 0;
      
      const response = await fetch('/api/messages/unread-count');
      if (!response.ok) {
        throw new Error('Failed to fetch unread message count');
      }
      
      const data = await response.json();
      return data.count;
    },
    enabled: !!user, // Only run the query if the user is logged in
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
    retry: 3,
  });

  // This function can be called to manually refresh the unread count
  const refreshUnreadCount = () => {
    if (user) {
      refetch();
    }
  };

  // If there's an error, log it
  useEffect(() => {
    if (error) {
      console.error('Error fetching unread message count:', error);
    }
  }, [error]);

  return {
    unreadCount,
    loading,
    error,
    refreshUnreadCount
  };
}