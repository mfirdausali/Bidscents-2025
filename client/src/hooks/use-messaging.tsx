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
  
  // State to track conversation message limits
  const [messageCountMap, setMessageCountMap] = useState<Record<string, {
    count: number,
    hasSellerReplied: boolean
  }>>({});

  // Connect to WebSocket with retry mechanism
  useEffect(() => {
    if (!user) {
      setConnected(false);
      return;
    }

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isCleanupPhase = false;
    
    // Setup WebSocket connection
    const connectWebSocket = () => {
      // Don't attempt reconnection during cleanup
      if (isCleanupPhase) {
        console.log('Skipping connection attempt during cleanup');
        return;
      }
      
      console.log('Attempting WebSocket connection...');
      
      // Clear any existing reconnect timeout
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('WebSocket URL:', wsUrl);
      
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      
      // Handle connection error and reconnect logic
      socket.addEventListener('error', (event) => {
        console.error('WebSocket connection error:', event);
        setError('WebSocket connection error');
        setConnected(false);
        
        if (!isCleanupPhase && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`Connection failed. Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
          
          // Exponential backoff: wait longer between each retry
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
          console.log(`Reconnecting in ${delay}ms...`);
          
          reconnectTimeout = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else if (!isCleanupPhase) {
          console.error('Max reconnect attempts reached. Giving up.');
          toast({
            title: 'Connection Error',
            description: 'Failed to connect to messaging server after multiple attempts. Please try again later.',
            variant: 'destructive',
          });
        }
      });

      // Connection opened
      socket.addEventListener('open', () => {
        console.log('WebSocket connection established');
        // Reset reconnect attempts on successful connection
        reconnectAttempts = 0;
        
        // Authenticate with the server
        if (user?.id) {
          const authMessage = { type: 'auth', userId: user.id };
          console.log('Sending authentication message to WebSocket server:', authMessage);
          socket.send(JSON.stringify(authMessage));
        } else {
          console.error('Cannot authenticate WebSocket - user ID is missing');
        }
      });

      // Listen for messages
      socket.addEventListener('message', (event) => {
        try {
          console.log('WebSocket message received:', event.data);
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
            console.log('New message received:', data.message);
            
            // Add the message to our state only if it doesn't already exist
            setMessages(prev => {
              // Check if message already exists in our state
              const exists = prev.some(msg => msg.id === data.message.id);
              if (!exists) {
                return [data.message, ...prev];
              }
              return prev;
            });
            
            // Show a toast notification for new messages
            toast({
              title: `New message from ${data.message.sender?.username || 'someone'}`,
              description: data.message.content.substring(0, 50) + (data.message.content.length > 50 ? '...' : ''),
              variant: 'default',
            });
          }
          
          // Handle sent message confirmation
          if (data.type === 'message_sent') {
            console.log('Message sent confirmation received:', data.message);
            
            // Add the message to our state only if it doesn't already exist
            setMessages(prev => {
              // Check if message already exists in our state
              const exists = prev.some(msg => msg.id === data.message.id);
              if (!exists) {
                return [data.message, ...prev];
              }
              return prev;
            });
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
          console.error('Error parsing WebSocket message:', event.data, error);
        }
      });

      // Connection closed
      socket.addEventListener('close', (event) => {
        console.log('WebSocket connection closed with code:', event.code);
        setConnected(false);
        
        // Attempt to reconnect on unexpected closure (not intentional via cleanup)
        if (!isCleanupPhase && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
          console.log(`Connection closed. Reconnecting in ${delay}ms... (${reconnectAttempts}/${maxReconnectAttempts})`);
          
          reconnectTimeout = setTimeout(() => {
            connectWebSocket();
          }, delay);
        }
      });

      return socket;
    };

    // Initialize WebSocket connection
    const socket = connectWebSocket();
    
    // Clean up on unmount
    return () => {
      console.log('Cleaning up WebSocket connection...');
      isCleanupPhase = true;
      
      if (reconnectTimeout) {
        console.log('Clearing reconnect timeout');
        clearTimeout(reconnectTimeout);
      }
      
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        console.log('Closing WebSocket connection on cleanup');
        socketRef.current.close();
      } else if (socketRef.current) {
        console.log('WebSocket already closed or closing, current state:', socketRef.current.readyState);
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
    console.log('Attempting to send message to receiverId:', receiverId, 'with productId:', productId);
    
    if (!socketRef.current) {
      console.error('WebSocket is not initialized');
      toast({
        title: 'Connection Error',
        description: 'WebSocket connection not initialized. Please try again later.',
        variant: 'destructive',
      });
      return false;
    }
    
    if (socketRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not open. Current state:', socketRef.current.readyState);
      toast({
        title: 'Connection Error',
        description: 'Not connected to messaging server. Please try again.',
        variant: 'destructive',
      });
      return false;
    }

    if (!user) {
      console.error('User is not authenticated');
      toast({
        title: 'Authentication Error',
        description: 'You must be logged in to send messages.',
        variant: 'destructive',
      });
      return false;
    }
    
    // Check if the buyer has reached the message limit before seller's first reply
    const conversationKey = productId ? `${receiverId}-${productId}` : `${receiverId}`;
    const messageInfo = messageCountMap[conversationKey];
    
    // If we have message info and seller hasn't replied yet, check the count
    if (messageInfo && !messageInfo.hasSellerReplied && messageInfo.count >= 5) {
      toast({
        title: 'Message Limit Reached',
        description: 'You can send up to 5 messages until the seller responds. Please wait for a reply.',
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

      console.log('Sending WebSocket message:', message);
      const messageJson = JSON.stringify(message);
      console.log('Serialized message:', messageJson);
      
      socketRef.current.send(messageJson);
      console.log('Message sent successfully');
      
      // Update the message count for this conversation
      setMessageCountMap(prev => {
        const currentInfo = prev[conversationKey] || { count: 0, hasSellerReplied: false };
        return {
          ...prev,
          [conversationKey]: {
            count: currentInfo.count + 1,
            hasSellerReplied: currentInfo.hasSellerReplied
          }
        };
      });
      
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
  }, [user, toast, messageCountMap]);

  // Mark a message as read
  const markAsRead = useCallback((messageId?: number, senderId?: number) => {
    console.log('Attempting to mark messages as read. MessageId:', messageId, 'SenderId:', senderId);
    
    if (!socketRef.current) {
      console.error('WebSocket is not initialized');
      return false;
    }
    
    if (socketRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not open. Current state:', socketRef.current.readyState);
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

      console.log('Sending mark as read message:', message);
      socketRef.current.send(JSON.stringify(message));
      console.log('Mark as read message sent successfully');
      
      // Update local state as well
      setMessages(prev => {
        console.log('Updating local messages state for read status');
        return prev.map(msg => {
          if ((messageId && msg.id === messageId) || 
              (senderId && msg.senderId === senderId && msg.receiverId === user.id)) {
            console.log('Marking message as read locally:', msg.id);
            return { ...msg, isRead: true };
          }
          return msg;
        });
      });
      
      return true;
    } catch (error) {
      console.error('Error marking message as read:', error);
      return false;
    }
  }, [user]);
  
  // Get conversation with a specific user
  const getConversation = useCallback(async (userId: number, productId?: number) => {
    console.log('Fetching conversation with userId:', userId, 'productId:', productId);
    
    if (!user) {
      console.error('User is not authenticated');
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
      
      console.log('Fetching conversation from URL:', url);
      
      // Fetch conversation data
      const res = await fetch(url);
      console.log('Conversation API response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Error response from conversation API:', errorText);
        throw new Error(`Failed to fetch conversation: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json() as Message[];
      console.log('Conversation data received:', data);
      
      // Update message count and seller reply status for this conversation
      const conversationKey = productId ? `${userId}-${productId}` : `${userId}`;
      
      let hasSellerReplied = false;
      
      // If this is a buyer viewing messages
      if (!user.isSeller) {
        // Check if the seller has replied by checking if any messages are from them
        hasSellerReplied = data.some(msg => msg.senderId === userId);
      } else {
        // If this is a seller, check if the buyer has sent any messages
        // (this isn't used for limits but completes the data model)
        hasSellerReplied = data.some(msg => msg.senderId === userId);
      }
      
      // Count messages sent by the current user 
      const userMessageCount = data.filter(msg => msg.senderId === user.id).length;
      
      // Update the message count and seller reply status
      setMessageCountMap(prev => ({
        ...prev,
        [conversationKey]: {
          count: userMessageCount,
          hasSellerReplied
        }
      }));
      
      return data;
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

  // Helper function to check if a user can send more messages
  const canSendMoreMessages = useCallback((receiverId: number, productId?: number) => {
    // If this is the seller sending messages to a buyer, always allow it
    if (user?.isSeller) {
      return {
        canSend: true,
        remainingMessages: 5,
        hasSellerReplied: true
      };
    }
    
    const conversationKey = productId ? `${receiverId}-${productId}` : `${receiverId}`;
    const messageInfo = messageCountMap[conversationKey];
    
    // If no message info yet, or if seller has already replied, user can send messages
    if (!messageInfo || messageInfo.hasSellerReplied) {
      return {
        canSend: true,
        remainingMessages: 5,
        hasSellerReplied: messageInfo?.hasSellerReplied || false
      };
    }
    
    const remainingMessages = Math.max(0, 5 - messageInfo.count);
    return {
      canSend: remainingMessages > 0,
      remainingMessages,
      hasSellerReplied: false
    };
  }, [messageCountMap, user?.isSeller]);

  return {
    connected,
    messages,
    loading,
    error,
    sendMessage,
    markAsRead,
    getConversation,
    canSendMoreMessages,
    messageCountMap,
  };
}