import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

export function useUnreadMessages() {
  const { user } = useAuth();
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/messages/unread-count'],
    queryFn: async () => {
      const response = await fetch('/api/messages/unread-count');
      if (!response.ok) {
        throw new Error('Failed to fetch unread message count');
      }
      return response.json();
    },
    enabled: !!user, // Only run query if user is logged in
    refetchInterval: 60000, // Refetch every 60 seconds
    refetchOnWindowFocus: true,
  });
  
  return {
    unreadCount: data?.count || 0,
    isLoading,
    error,
    refetch
  };
}