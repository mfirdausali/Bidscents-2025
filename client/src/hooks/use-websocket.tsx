import { useState, useEffect, useCallback, useRef } from 'react';

// Define message types
export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

// Custom hook for WebSocket connection
export function useWebSocket(userId: number | null | undefined) {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  // Connect to the WebSocket server
  useEffect(() => {
    // Don't connect if there's no userId (user not logged in)
    if (!userId) return;

    // Create WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    // Connection opened
    socket.addEventListener('open', () => {
      console.log('WebSocket connection established');
      setIsConnected(true);
      
      // Send authentication message
      socket.send(JSON.stringify({
        type: 'auth',
        userId: userId
      }));
    });

    // Listen for messages
    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Add message to state
        setMessages(prevMessages => [...prevMessages, data]);
        
        // You can add specific handling for different message types here
        console.log('WebSocket message received:', data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    // Connection closed
    socket.addEventListener('close', () => {
      console.log('WebSocket connection closed');
      setIsConnected(false);
    });

    // Connection error
    socket.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    });

    // Clean up on unmount
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [userId]);

  // Send a message through the WebSocket
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Send a chat message to another user
  const sendChatMessage = useCallback((recipientId: number, content: string) => {
    return sendMessage({
      type: 'message',
      recipientId,
      content
    });
  }, [sendMessage]);

  return {
    isConnected,
    messages,
    sendMessage,
    sendChatMessage
  };
}