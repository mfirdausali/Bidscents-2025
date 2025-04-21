import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';
import { apiRequest } from '@/lib/queryClient';

// Message type definition
export interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  createdAt: Date | string;
  isRead: boolean;
  productId?: number | null;
  sender?: {
    id: number;
    username: string;
    profileImage?: string | null;
  };
  receiver?: {
    id: number;
    username: string;
    profileImage?: string | null;
  };
  product?: {
    id: number;
    name: string;
    imageUrl?: string | null;
  };
}

// WebSocket message types
interface WebSocketAuthMessage {
  type: 'auth';
  userId: number;
}

interface WebSocketSendMessage {
  type: 'send_message';
  receiverId: number;
  content: string;
  productId?: number;
}

interface WebSocketMarkReadMessage {
  type: 'mark_read';
  messageId?: number;
  senderId?: number;
}

type WebSocketOutgoingMessage = 
  | WebSocketAuthMessage
  | WebSocketSendMessage
  | WebSocketMarkReadMessage;

// Use messaging hook
export function useMessaging() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    if (!user) {
      setConnected(false);
      return;
    }

    // Setup WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    // Connection opened
    socket.addEventListener('open', () => {
      console.log('WebSocket connection established');
      // Authenticate with the server
      if (user?.id) {
        socket.send(JSON.stringify({ 
          type: 'auth', 
          userId: user.id 
        }));
      }
    });

    // Listen for messages
    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle connection confirmation
        if (data.type === 'connected') {
          console.log('Connected to messaging server:', data.message);
        }
        
        // Handle authentication success
        if (data.type === 'auth_success') {
          setConnected(true);
          console.log('Authentication successful for user:', data.userId);
        }
        
        // Handle new message received
        if (data.type === 'new_message') {
          setMessages(prev => [data.message, ...prev]);
          
          // Show a toast notification for new messages
          toast({
            title: `New message from ${data.message.sender?.username || 'someone'}`,
            description: data.message.content.substring(0, 50) + (data.message.content.length > 50 ? '...' : ''),
            variant: 'default',
          });
        }
        
        // Handle sent message confirmation
        if (data.type === 'message_sent') {
          setMessages(prev => [data.message, ...prev]);
        }
        
        // Handle errors
        if (data.type === 'error') {
          console.error('WebSocket error:', data.message);
          setError(data.message);
          toast({
            title: 'Messaging Error',
            description: data.message,
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    // Connection closed
    socket.addEventListener('close', () => {
      console.log('WebSocket connection closed');
      setConnected(false);
    });

    // Connection error
    socket.addEventListener('error', (event) => {
      console.error('WebSocket error:', event);
      setError('WebSocket connection error');
      setConnected(false);
      toast({
        title: 'Connection Error',
        description: 'Failed to connect to messaging server. Please try again later.',
        variant: 'destructive',
      });
    });

    // Clean up on unmount
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [user, toast]);

  // Load user's message history
  useEffect(() => {
    if (!user) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const fetchMessages = async () => {
      setLoading(true);
      try {
        // Get response data from API
        const res = await fetch('/api/messages');
        if (res.ok) {
          const data = await res.json();
          setMessages(data as Message[]);
        } else {
          throw new Error('Failed to fetch messages');
        }
        setError(null);
      } catch (err: any) {
        console.error('Error fetching messages:', err);
        setError(err.message || 'Failed to load messages');
        toast({
          title: 'Error Loading Messages',
          description: err.message || 'Failed to load your message history.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [user, toast]);

  // Send a message
  const sendMessage = useCallback((receiverId: number, content: string, productId?: number) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: 'Connection Error',
        description: 'Not connected to messaging server. Please try again.',
        variant: 'destructive',
      });
      return false;
    }

    if (!user) {
      toast({
        title: 'Authentication Error',
        description: 'You must be logged in to send messages.',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const message: WebSocketSendMessage = {
        type: 'send_message',
        receiverId,
        content,
        ...(productId && { productId }),
      };

      socketRef.current.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Send Error',
        description: 'Failed to send your message. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  }, [user, toast]);

  // Mark a message as read
  const markAsRead = useCallback((messageId?: number, senderId?: number) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error('Not connected to messaging server');
      return false;
    }

    if (!user) {
      console.error('User not authenticated');
      return false;
    }

    if (!messageId && !senderId) {
      console.error('Either messageId or senderId must be provided');
      return false;
    }

    try {
      const message: WebSocketMarkReadMessage = {
        type: 'mark_read',
        ...(messageId && { messageId }),
        ...(senderId && { senderId }),
      };

      socketRef.current.send(JSON.stringify(message));
      
      // Update local state as well
      setMessages(prev => prev.map(msg => {
        if ((messageId && msg.id === messageId) || 
            (senderId && msg.senderId === senderId && msg.receiverId === user.id)) {
          return { ...msg, isRead: true };
        }
        return msg;
      }));
      
      return true;
    } catch (error) {
      console.error('Error marking message as read:', error);
      return false;
    }
  }, [user]);
  
  // Get conversation with a specific user
  const getConversation = useCallback(async (userId: number, productId?: number) => {
    if (!user) {
      toast({
        title: 'Authentication Error',
        description: 'You must be logged in to view conversations.',
        variant: 'destructive',
      });
      return [];
    }
    
    try {
      let url = `/api/messages/conversation/${userId}`;
      if (productId) {
        url += `?productId=${productId}`;
      }
      
      // Fetch conversation data
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return data as Message[];
      }
      return [];
    } catch (error: any) {
      console.error('Error fetching conversation:', error);
      toast({
        title: 'Error Loading Conversation',
        description: error.message || 'Failed to load conversation history.',
        variant: 'destructive',
      });
      return [];
    }
  }, [user, toast]);

  return {
    connected,
    messages,
    loading,
    error,
    sendMessage,
    markAsRead,
    getConversation,
  };
}