import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './use-supabase-auth';
import { useToast } from './use-toast';
import { apiRequest } from '@/lib/queryClient';

// Message type definition
export interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string | null;
  createdAt: Date | string;
  isRead: boolean;
  productId?: number | null;
  messageType?: 'TEXT' | 'ACTION' | 'FILE';
  actionType?: 'INITIATE' | 'CONFIRM_PAYMENT' | 'CONFIRM_DELIVERY' | 'REVIEW' | null;
  isClicked?: boolean;
  fileUrl?: string | null;
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
    price?: number;
    imageUrl?: string | null;
  };
}

// WebSocket message types
interface WebSocketAuthMessage {
  type: 'auth';
  token: string;
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
        
        // Authenticate with the server using application JWT token
        if (user?.id) {
          // Get the application JWT token from localStorage
          const appToken = localStorage.getItem('app_token');
          
          if (appToken) {
            const authMessage = { 
              type: 'auth', 
              token: appToken
            };
            console.log('🔐 Sending application JWT authentication to WebSocket server');
            socket.send(JSON.stringify(authMessage));
          } else {
            console.error('❌ Cannot authenticate WebSocket - no app token found');
            setError('Authentication required. Please log in again.');
            toast({
              title: 'Authentication Error',
              description: 'Please log in again to use messaging features.',
              variant: 'destructive',
            });
          }
        } else {
          console.error('❌ Cannot authenticate WebSocket - user ID is missing');
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
            
            // Dispatch a custom event for other components (like unread count)
            const messagingEvent = new CustomEvent('messaging:update', {
              detail: data
            });
            window.dispatchEvent(messagingEvent);
          }
          
          // Handle sent message confirmation
          if (data.type === 'message_sent') {
            console.log('🚀 Message sent confirmation received:', data.message);
            console.log('📊 Current messages state before adding:', messages.length, 'messages');
            
            // Add the message to our state only if it doesn't already exist
            setMessages(prev => {
              // Check if message already exists in our state
              const exists = prev.some(msg => msg.id === data.message.id);
              console.log('🔍 Message exists check - ID:', data.message.id, 'Exists:', exists);
              
              if (!exists) {
                const newMessages = [data.message, ...prev];
                console.log('✅ Adding new message to state. New count:', newMessages.length);
                console.log('📝 New message details:', {
                  id: data.message.id,
                  content: data.message.content,
                  senderId: data.message.senderId,
                  receiverId: data.message.receiverId
                });
                return newMessages;
              } else {
                console.log('⚠️ Message already exists in state, not adding duplicate');
                return prev;
              }
            });
            
            // Dispatch update event
            const messagingEvent = new CustomEvent('messaging:message_sent', {
              detail: data.message
            });
            window.dispatchEvent(messagingEvent);
          }
          
          // Handle messages read confirmation
          if (data.type === 'messages_read') {
            console.log('Messages marked as read:', data);
            
            // Update message read state in our local messages list
            setMessages(prev => {
              return prev.map(msg => {
                // If the message was sent by the specified sender 
                // and received by the current user, mark it as read
                if ((data.messageId && msg.id === data.messageId) || 
                    (data.senderId && msg.senderId === data.senderId && msg.receiverId === user.id)) {
                  return { ...msg, isRead: true };
                }
                return msg;
              });
            });
            
            // Dispatch custom event for unread count update
            const messagingEvent = new CustomEvent('messaging:update', {
              detail: data
            });
            window.dispatchEvent(messagingEvent);
          }
          
          // Handle transaction action confirmation
          if (data.type === 'action_confirmed') {
            console.log('Transaction action confirmed:', data.message);
            
            // Update messages state to reflect the confirmed transaction
            setMessages(prev => {
              return prev.map(msg => {
                if (msg.id === data.message.id) {
                  return { ...msg, isClicked: true };
                }
                return msg;
              });
            });
            
            // Dispatch custom event for any components that need to know
            const actionEvent = new CustomEvent('messaging:action_confirmed', {
              detail: data
            });
            window.dispatchEvent(actionEvent);
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
        // Use authenticated API request that includes JWT token
        const res = await apiRequest('GET', '/api/messages');
        const data = await res.json();
        setMessages(data as Message[]);
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
    console.log('📤 SEND MESSAGE INITIATED');
    console.log('  ➤ Receiver ID:', receiverId);
    console.log('  ➤ Content length:', content.length);
    console.log('  ➤ Product ID:', productId);
    console.log('  ➤ Current user ID:', user?.id);
    console.log('  ➤ Messages in state:', messages.length);
    
    if (!socketRef.current) {
      console.error('❌ WebSocket is not initialized');
      toast({
        title: 'Connection Error',
        description: 'WebSocket connection not initialized. Please try again later.',
        variant: 'destructive',
      });
      return false;
    }
    
    if (socketRef.current.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket is not open. Current state:', socketRef.current.readyState);
      toast({
        title: 'Connection Error',
        description: 'Not connected to messaging server. Please try again.',
        variant: 'destructive',
      });
      return false;
    }

    if (!user) {
      console.error('❌ User is not authenticated');
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

      console.log('📡 Sending WebSocket message:', message);
      const messageJson = JSON.stringify(message);
      console.log('📦 Serialized message:', messageJson);
      
      socketRef.current.send(messageJson);
      console.log('✅ Message sent to WebSocket server successfully');
      console.log('⏳ Waiting for server confirmation...');
      return true;
    } catch (error) {
      console.error('❌ Error sending message:', error);
      toast({
        title: 'Send Error',
        description: 'Failed to send your message. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  }, [user, toast, messages.length]);

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
      
      // Dispatch custom event for unread count update
      const messagingEvent = new CustomEvent('messaging:update', {
        detail: {
          type: 'messages_read',
          messageId,
          senderId
        }
      });
      window.dispatchEvent(messagingEvent);
      
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
      
      // Fetch conversation data with authentication
      const res = await apiRequest('GET', url);
      console.log('Conversation API response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Error response from conversation API:', errorText);
        throw new Error(`Failed to fetch conversation: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      console.log('Conversation data received:', data);
      return data as Message[];
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

  // Send an action message (for transactions/confirmations)
  const sendActionMessage = useCallback((receiverId: number, productId: number, actionType: 'INITIATE' | 'CONFIRM_PAYMENT' | 'CONFIRM_DELIVERY' | 'REVIEW') => {
    console.log('Attempting to send action message to receiverId:', receiverId, 'for productId:', productId);
    
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

    try {
      const message = {
        type: 'send_action_message',
        receiverId,
        productId,
        actionType,
      };

      socketRef.current.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Failed to send action message:', error);
      toast({
        title: 'Message Error',
        description: 'Failed to send action message. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  }, [user, toast]);

  return {
    connected,
    messages,
    loading,
    error,
    sendMessage,
    sendActionMessage,
    markAsRead,
    getConversation,
  };
}