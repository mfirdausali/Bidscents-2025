import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { Message } from './use-messaging';

interface Conversation {
  userId: number;
  username: string;
  profileImage?: string | null;
  lastMessage: Message;
  unreadCount: number;
  productInfo?: {
    id: number;
    name: string;
  };
}

interface ConversationResponse {
  conversations: Conversation[];
  totalCount: number;
}

export function useConversations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch conversations list with caching
  const {
    data: conversationsData,
    isLoading: loadingConversations,
    error: conversationsError,
    refetch: refetchConversations
  } = useQuery<ConversationResponse>({
    queryKey: ['/api/conversations', user?.id],
    enabled: !!user?.id,
    staleTime: 30000, // Cache for 30 seconds
    gcTime: 300000, // Keep in cache for 5 minutes
  });

  // Fetch specific conversation messages with pagination
  const useConversationMessages = (otherUserId: number, productId?: number) => {
    return useQuery<Message[]>({
      queryKey: ['/api/conversations', user?.id, otherUserId, productId],
      enabled: !!user?.id && !!otherUserId,
      staleTime: 10000, // Cache for 10 seconds
      gcTime: 300000, // Keep in cache for 5 minutes
    });
  };

  // Invalidate conversations when new message is received
  const invalidateConversations = () => {
    queryClient.invalidateQueries({ 
      queryKey: ['/api/conversations', user?.id] 
    });
  };

  // Update specific conversation cache when message is sent/received
  const updateConversationCache = (otherUserId: number, newMessage: Message, productId?: number) => {
    queryClient.setQueryData(
      ['/api/conversations', user?.id, otherUserId, productId],
      (oldData: Message[] | undefined) => {
        if (!oldData) return [newMessage];
        
        // Check if message already exists
        const exists = oldData.some(msg => msg.id === newMessage.id);
        if (exists) return oldData;
        
        return [newMessage, ...oldData];
      }
    );

    // Also update the conversations list
    invalidateConversations();
  };

  // Mark messages as read and update cache
  const markMessagesAsRead = (otherUserId: number, productId?: number) => {
    queryClient.setQueryData(
      ['/api/conversations', user?.id, otherUserId, productId],
      (oldData: Message[] | undefined) => {
        if (!oldData) return oldData;
        
        return oldData.map(msg => {
          if (msg.senderId === otherUserId && msg.receiverId === user?.id && !msg.isRead) {
            return { ...msg, isRead: true };
          }
          return msg;
        });
      }
    );

    // Update conversations list to reflect new unread counts
    invalidateConversations();
  };

  return {
    conversations: conversationsData?.conversations || [],
    totalConversations: conversationsData?.totalCount || 0,
    loadingConversations,
    conversationsError,
    refetchConversations,
    useConversationMessages,
    updateConversationCache,
    markMessagesAsRead,
    invalidateConversations
  };
}