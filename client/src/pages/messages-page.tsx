import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useMessaging, Message } from '@/hooks/use-messaging';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useLocation, Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ArrowLeft, RefreshCw, Send, User } from 'lucide-react';

export default function MessagesPage() {
  const { user } = useAuth();
  const { messages, loading, error, sendMessage, getConversation, markAsRead, canSendMoreMessages } = useMessaging();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [messageText, setMessageText] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<{
    userId: number;
    username: string;
    profileImage?: string | null;
    productId?: number;
    productName?: string;
  } | null>(null);
  const [messageStatus, setMessageStatus] = useState<{
    canSend: boolean;
    remainingMessages: number;
    hasSellerReplied: boolean;
  }>({ canSend: true, remainingMessages: 5, hasSellerReplied: false });
  const [activeChat, setActiveChat] = useState<Message[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Group messages by conversation (unique user pairs)
  const conversations = React.useMemo(() => {
    if (!user || !messages.length) return [];
    
    const conversationMap = new Map<number, {
      userId: number;
      username: string;
      profileImage?: string | null;
      lastMessage: Message;
      unreadCount: number;
      productInfo?: {
        id: number;
        name: string;
      };
    }>();
    
    // Group messages by the other user in the conversation
    messages.forEach(message => {
      let otherUserId: number;
      let otherUsername: string;
      let otherUserImage: string | null | undefined;
      
      if (message.senderId === user.id) {
        // Message sent by current user
        otherUserId = message.receiverId;
        otherUsername = message.receiver?.username || 'Unknown User';
        otherUserImage = message.receiver?.profileImage;
      } else {
        // Message received by current user
        otherUserId = message.senderId;
        otherUsername = message.sender?.username || 'Unknown User';
        otherUserImage = message.sender?.profileImage;
      }
      
      const existingConversation = conversationMap.get(otherUserId);
      
      // Check if message is unread and not sent by current user
      const isUnread = !message.isRead && message.receiverId === user.id;
      
      // Get product info if available
      const productInfo = message.product ? {
        id: message.product.id,
        name: message.product.name
      } : undefined;
      
      if (!existingConversation || 
          new Date(message.createdAt) > new Date(existingConversation.lastMessage.createdAt)) {
        conversationMap.set(otherUserId, {
          userId: otherUserId,
          username: otherUsername,
          profileImage: otherUserImage,
          lastMessage: message,
          unreadCount: isUnread ? 1 : (existingConversation?.unreadCount || 0),
          productInfo: productInfo || existingConversation?.productInfo
        });
      } else if (isUnread) {
        // Update unread count for existing conversation
        existingConversation.unreadCount += 1;
        conversationMap.set(otherUserId, existingConversation);
      }
    });
    
    // Convert map to array and sort by most recent message
    return Array.from(conversationMap.values()).sort((a, b) => 
      new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
    );
  }, [messages, user]);
  
  // Fetch conversation messages when a user is selected
  const loadConversation = useCallback(async (userId: number, productId?: number) => {
    if (!user?.id) return;
    
    setLoadingChat(true);
    try {
      const messages = await getConversation(userId, productId);
      if (Array.isArray(messages)) {
        setActiveChat(messages);
        
        // Mark messages as read
        const unreadMessages = messages.filter(
          msg => !msg.isRead && msg.senderId === userId && msg.receiverId === user.id
        );
        
        if (unreadMessages.length > 0) {
          markAsRead(undefined, userId);
        }
        
        // Check message limit status - canSendMoreMessages is now async
        const status = await canSendMoreMessages(userId, productId);
        setMessageStatus(status);
      } else {
        setActiveChat([]);
        console.error('Invalid conversation data format');
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      toast({
        title: 'Error Loading Conversation',
        description: 'Failed to load conversation messages. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingChat(false);
      // Close mobile menu when conversation is loaded
      setIsMobileMenuOpen(false);
    }
  }, [user?.id, getConversation, markAsRead, toast, canSendMoreMessages]);

  // Check if user is authenticated and handle pre-selected conversation
  useEffect(() => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'You must be logged in to view your messages.',
        variant: 'destructive',
      });
      setLocation('/auth');
      return;
    }
    
    // Check if there's a selected conversation in session storage
    try {
      const savedConversation = sessionStorage.getItem('selectedConversation');
      if (savedConversation) {
        const conversationData = JSON.parse(savedConversation);
        // Set the selected conversation from sessionStorage
        setSelectedConversation(conversationData);
        
        // Set template message if coming from a product card/detail page
        if (conversationData.templateMessage) {
          setMessageText(conversationData.templateMessage);
        }
        
        // Load the conversation messages
        loadConversation(conversationData.userId, conversationData.productId);
        // Clear the storage after using it
        sessionStorage.removeItem('selectedConversation');
      }
    } catch (error) {
      console.error('Error loading saved conversation:', error);
    }
  }, [user, toast, setLocation, loadConversation]);
  
  // Format timestamp for messages
  const formatMessageTime = (timestamp: string | Date) => {
    try {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
      const now = new Date();
      
      // If message is from today, show only time
      if (date.toDateString() === now.toDateString()) {
        return format(date, 'h:mm a');
      }
      
      // If message is from this year, show month and day
      if (date.getFullYear() === now.getFullYear()) {
        return format(date, 'MMM d');
      }
      
      // Otherwise show month, day and year
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      return 'Unknown time';
    }
  };
  
  // Truncate message content for preview
  const truncateMessage = (content: string, maxLength = 60) => {
    return content.length > maxLength
      ? content.substring(0, maxLength) + '...'
      : content;
  };
  
  // Select a conversation to view
  const selectConversation = useCallback((conversation: typeof conversations[0]) => {
    setSelectedConversation({
      userId: conversation.userId,
      username: conversation.username,
      profileImage: conversation.profileImage,
      productId: conversation.productInfo?.id,
      productName: conversation.productInfo?.name,
    });
    
    loadConversation(conversation.userId, conversation.productInfo?.id);
  }, [loadConversation]);
  
  // Handle sending a message
  const handleSendMessage = useCallback(async () => {
    if (!messageText.trim() || !user?.id || !selectedConversation) return;
    
    // Check if the user can send more messages
    if (!messageStatus.canSend) {
      toast({
        title: 'Message Limit Reached',
        description: 'You can send up to 5 messages until the seller responds. Please wait for a reply.',
        variant: 'destructive',
      });
      return;
    }
    
    // Get the latest message status before sending
    const currentStatus = await canSendMoreMessages(
      selectedConversation.userId,
      selectedConversation.productId
    );
    
    // Final check with the latest data
    if (!currentStatus.canSend) {
      toast({
        title: 'Message Limit Reached',
        description: 'You can send up to 5 messages until the seller responds. Please wait for a reply.',
        variant: 'destructive',
      });
      setMessageStatus(currentStatus);
      return;
    }
    
    const sent = await sendMessage(
      selectedConversation.userId, 
      messageText, 
      selectedConversation.productId
    );
    
    if (sent) {
      setMessageText('');
      
      // After sending, refresh the conversation to get the updated message limit
      loadConversation(selectedConversation.userId, selectedConversation.productId);
    } else {
      toast({
        title: 'Message Not Sent',
        description: 'Failed to send your message. Please try again.',
        variant: 'destructive',
      });
    }
  }, [messageText, user?.id, selectedConversation, sendMessage, toast, messageStatus, canSendMoreMessages, loadConversation]);
  
  // Scroll to bottom of messages when new ones arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat]);
  
  // Listen for WebSocket updates to add new messages directly to activeChat
  useEffect(() => {
    if (selectedConversation && user?.id) {
      // Filter for new messages that belong to the current conversation
      const newMessages = messages.filter(msg => 
        // Message is part of the current conversation
        ((msg.senderId === selectedConversation.userId && msg.receiverId === user.id) ||
         (msg.senderId === user.id && msg.receiverId === selectedConversation.userId)) &&
        // Message is not already in activeChat
        !activeChat.some(chatMsg => chatMsg.id === msg.id)
      );
      
      // If we have new messages, add them to the activeChat state
      if (newMessages.length > 0) {
        // Check if any messages are from the seller (which means they've replied)
        const sellerMessages = newMessages.filter(msg => msg.senderId === selectedConversation.userId);
        
        // If seller has replied, update message status to allow unlimited future messages
        if (sellerMessages.length > 0 && !messageStatus.hasSellerReplied) {
          setMessageStatus({
            canSend: true,
            remainingMessages: 5,
            hasSellerReplied: true
          });
        }
        
        setActiveChat(prev => {
          // Sort messages by creation time (oldest first)
          return [...prev, ...newMessages].sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
      }
    }
  }, [messages, selectedConversation, user?.id, activeChat, messageStatus.hasSellerReplied]);
  
  if (!user) {
    return (
      <div className="container mx-auto py-6 max-w-7xl">
        <div className="flex flex-col items-center justify-center h-64">
          <h2 className="text-xl font-semibold mb-4">Authentication Required</h2>
          <p className="text-muted-foreground mb-4">Please log in to view your messages</p>
          <Button asChild>
            <Link href="/auth">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }
  
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between bg-background z-10">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="icon" onClick={() => setLocation('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">Messages</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      {loading && conversations.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <p>Loading your messages...</p>
        </div>
      ) : error ? (
        <div className="bg-destructive/20 p-4 rounded-md text-center">
          <p>Error loading messages: {error}</p>
          <Button variant="outline" className="mt-2" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Conversation List - Left Sidebar */}
          <div className={`md:w-1/3 lg:w-1/4 border-r md:flex flex-col ${isMobileMenuOpen ? 'fixed inset-0 z-50 bg-background' : 'hidden'} md:relative md:block`}>
            {/* Mobile header for conversation list */}
            <div className="border-b p-3 flex items-center justify-between md:hidden">
              <h2 className="font-semibold text-lg">Conversations</h2>
              <Button variant="ghost" size="sm" onClick={toggleMobileMenu}>
                Close
              </Button>
            </div>
            
            <div className="overflow-y-auto flex-1">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center h-full">
                  <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="text-base font-medium mb-2">No messages yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start a conversation by messaging a seller through their product page.
                  </p>
                  <Button asChild size="sm">
                    <Link href="/">Browse Products</Link>
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {conversations.map((conversation) => (
                    <div 
                      key={conversation.userId}
                      className={`flex items-center p-3 hover:bg-accent/50 cursor-pointer transition-colors ${
                        selectedConversation?.userId === conversation.userId ? 'bg-accent' : ''
                      }`}
                      onClick={() => selectConversation(conversation)}
                    >
                      <div className="relative flex-shrink-0">
                        <Avatar>
                          <AvatarImage src={conversation.profileImage || ''} alt={conversation.username} />
                          <AvatarFallback>{conversation.username.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {conversation.unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="ml-3 flex-1 overflow-hidden">
                        <div className="flex justify-between items-start">
                          <h3 className="font-medium">{conversation.username}</h3>
                          <span className="text-xs text-muted-foreground">
                            {formatMessageTime(conversation.lastMessage.createdAt)}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {conversation.lastMessage.senderId === user.id && (
                            <span className="text-muted-foreground mr-1">You:</span>
                          )}
                          {truncateMessage(conversation.lastMessage.content)}
                        </div>
                        {conversation.productInfo && (
                          <Badge variant="outline" className="mt-1 text-xs px-2 py-0">
                            {conversation.productInfo.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Main Chat Area - Right Side */}
          <div className="flex-1 flex flex-col h-full">
            {/* Mobile top header - Toggle contacts */}
            <div className="md:hidden border-b p-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full flex items-center justify-between"
                onClick={toggleMobileMenu}
              >
                <span>
                  {selectedConversation ? selectedConversation.username : 'Select Conversation'}
                </span>
                <MessageSquare className="h-4 w-4 ml-2" />
              </Button>
            </div>
            
            {!selectedConversation ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <User className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-medium mb-2">No conversation selected</h2>
                <p className="text-muted-foreground mb-6">
                  {conversations.length > 0 
                    ? "Select a conversation from the list to view messages." 
                    : "Start a new conversation by contacting a seller."}
                </p>
                <Button asChild>
                  <Link href="/">Browse Products</Link>
                </Button>
              </div>
            ) : (
              <>
                {/* Conversation Header */}
                <div className="p-3 border-b flex items-center flex-shrink-0 bg-background sticky top-0 z-10">
                  <Avatar className="h-10 w-10 mr-3">
                    <AvatarImage 
                      src={selectedConversation.profileImage || ''} 
                      alt={selectedConversation.username} 
                    />
                    <AvatarFallback>
                      {selectedConversation.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-lg truncate">{selectedConversation.username}</h2>
                    {selectedConversation.productName && (
                      <p className="text-xs text-muted-foreground truncate">
                        About: {selectedConversation.productName}
                      </p>
                    )}
                  </div>
                </div>
                

                
                {/* Messages Area - Scrollable */}
                <div className="flex-1 overflow-y-auto p-4 bg-accent/5">
                  {loadingChat ? (
                    <div className="flex justify-center items-center h-full">
                      <p>Loading conversation...</p>
                    </div>
                  ) : activeChat.length === 0 ? (
                    <div className="flex justify-center items-center h-full text-muted-foreground">
                      <p>No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    <div className="space-y-4 pb-2">
                      {/* Security Alert Banner */}
                      <div className="w-full flex justify-center mb-4">
                        <div className="max-w-[90%] p-3 bg-blue-50 border border-blue-100 rounded-md text-sm shadow-sm">
                          <div className="mb-1 font-semibold text-blue-800 flex items-center">
                            <span role="img" aria-label="lock" className="mr-1">🔐</span> Stay Safe: Important Reminder
                          </div>
                          <p className="text-blue-700 text-xs mb-2">For your safety, please keep in mind:</p>
                          <ul className="text-blue-700 text-xs space-y-1 pl-4">
                            <li className="flex items-start">
                              <span role="img" aria-label="check" className="mr-1 flex-shrink-0">✅</span>
                              <span>Double check payment details before making any transfers.</span>
                            </li>
                            <li className="flex items-start">
                              <span role="img" aria-label="document" className="mr-1 flex-shrink-0">📄</span>
                              <span>Always ask for proof of purchase, such as a receipt, invoice, or original packaging.</span>
                            </li>
                            <li className="flex items-start">
                              <span role="img" aria-label="prohibited" className="mr-1 flex-shrink-0">🚫</span>
                              <span>Never share personal or banking information outside of our secure platform.</span>
                            </li>
                          </ul>
                          <p className="text-blue-700 text-xs mt-2 italic">
                            If something feels off, report the user immediately or contact us at admin@bidscents.com.
                          </p>
                        </div>
                      </div>
                      
                      {activeChat.map((msg) => {
                        const isOwnMessage = msg.senderId === user?.id;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                          >
                            {!isOwnMessage && (
                              <Avatar className="h-8 w-8 mr-2 mt-1 flex-shrink-0">
                                <AvatarImage 
                                  src={selectedConversation.profileImage || ''} 
                                  alt={selectedConversation.username} 
                                />
                                <AvatarFallback>
                                  {selectedConversation.username.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div
                              className={`max-w-[80%] px-4 py-2 rounded-lg ${
                                isOwnMessage
                                  ? 'bg-primary text-primary-foreground rounded-tr-none'
                                  : 'bg-background rounded-tl-none shadow-sm'
                              }`}
                            >
                              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                              <div className="text-xs mt-1 opacity-70 flex justify-end">
                                {formatMessageTime(msg.createdAt)}
                                {isOwnMessage && (
                                  <span className="ml-2">
                                    {msg.isRead ? '✓✓' : '✓'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
                
                {/* Message Input Area - Fixed at bottom */}
                <div className="p-3 border-t flex-shrink-0 bg-background">
                  {/* Message limit indicator */}
                  {!messageStatus.hasSellerReplied && (
                    <div className={`text-xs mb-2 ${messageStatus.remainingMessages <= 1 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {messageStatus.remainingMessages > 0 ? (
                        <>
                          <span className="font-medium">
                            {messageStatus.remainingMessages} message{messageStatus.remainingMessages !== 1 ? 's' : ''} remaining
                          </span> until seller responds
                        </>
                      ) : (
                        <span className="font-medium">
                          Message limit reached. Please wait for seller to respond.
                        </span>
                      )}
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-2">
                    <Input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Type your message..."
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      disabled={!messageStatus.canSend}
                    />
                    <Button 
                      onClick={handleSendMessage} 
                      disabled={!messageText.trim() || loadingChat || !messageStatus.canSend} 
                      size="icon"
                      className="h-10 w-10 rounded-full"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}