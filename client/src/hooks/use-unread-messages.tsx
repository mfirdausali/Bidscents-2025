import { useState, useEffect, useRef } from 'react';
import { useAuth } from './use-supabase-auth';
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
      
      // Import the apiRequest function here to avoid circular dependencies
      const { apiRequest } = await import('@/lib/queryClient');
      const response = await apiRequest('GET', '/api/messages/unread-count');
      
      if (!response.ok) {
        throw new Error('Failed to fetch unread message count');
      }
      
      const data = await response.json();
      console.log('📊 [UnreadMessages] Fetched unread count:', data.count);
      return data.count;
    },
    enabled: !!user, // Only run the query if the user is logged in
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 5000, // Consider data stale after 5 seconds for faster updates
    retry: 3,
  });

  // Listen for message updates from the messaging hook
  // instead of creating our own WebSocket connection
  useEffect(() => {
    // Set up an event listener for the custom message events
    const handleCustomMessageEvent = (event: CustomEvent) => {
      const data = event.detail;
      console.log('🔔 [UnreadMessages] Received messaging event:', data.type, data);
      
      // Check if this is a new message for the current user
      if (data.type === 'new_message' && data.message?.receiverId === user?.id) {
        console.log('📩 [UnreadMessages] New message detected, refreshing unread count');
        // Use a small delay to ensure the server has processed the message
        setTimeout(() => {
          refetch();
        }, 500);
      }
      
      // Check if messages were marked as read
      if (data.type === 'messages_read') {
        console.log('✅ [UnreadMessages] Messages marked as read, refreshing unread count');
        // Immediate refresh for read events
        refetch();
      }
      
      // Also listen for direct message read events
      if (data.type === 'message_read') {
        console.log('✅ [UnreadMessages] Single message marked as read, refreshing count');
        refetch();
      }
    };

    // Add the event listener
    window.addEventListener('messaging:update' as any, handleCustomMessageEvent);
    
    // Also listen for specific read events
    window.addEventListener('messaging:read' as any, handleCustomMessageEvent);
    
    // Clean up on unmount
    return () => {
      window.removeEventListener('messaging:update' as any, handleCustomMessageEvent);
      window.removeEventListener('messaging:read' as any, handleCustomMessageEvent);
    };
  }, [user, refetch]);
  
  // Always refresh the count when the component mounts
  useEffect(() => {
    if (user) {
      console.log('👤 [UnreadMessages] User logged in, fetching initial unread count');
      refetch();
    }
  }, [user, refetch]);

  // Add a manual refresh function for external components to trigger
  useEffect(() => {
    const handleForceRefresh = () => {
      console.log('🔄 [UnreadMessages] Force refresh triggered');
      refetch();
    };

    window.addEventListener('unread-messages:force-refresh', handleForceRefresh);
    
    return () => {
      window.removeEventListener('unread-messages:force-refresh', handleForceRefresh);
    };
  }, [refetch]);

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