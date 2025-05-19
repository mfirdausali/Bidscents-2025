import { useState, useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Type for WebSocket message
type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

// This hook handles fetching and updating the unread message count
export function useUnreadMessages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
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

  // Listen for message updates from the messaging hook
  // instead of creating our own WebSocket connection
  useEffect(() => {
    // Set up an event listener for the custom message events
    const handleCustomMessageEvent = (event: CustomEvent) => {
      const data = event.detail;
      
      // Check if this is a new message for the current user
      if (data.type === 'new_message' && data.message?.receiverId === user?.id) {
        console.log('New message detected, refreshing unread count');
        refetch();
      }
      
      // Check if messages were marked as read
      if (data.type === 'messages_read') {
        console.log('Messages marked as read, refreshing unread count');
        refetch();
      }
    };

    // Add the event listener
    window.addEventListener('messaging:update' as any, handleCustomMessageEvent);
    
    // Clean up on unmount
    return () => {
      window.removeEventListener('messaging:update' as any, handleCustomMessageEvent);
    };
  }, [user, refetch]);
  
  // Always refresh the count when the component mounts
  useEffect(() => {
    if (user) {
      refetch();
    }
  }, [user, refetch]);

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

  // Invalidate the unread count query when the user changes
  useEffect(() => {
    if (user) {
      queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count'] });
    }
  }, [user, queryClient]);

  return {
    unreadCount,
    loading,
    error,
    refreshUnreadCount
  };
}