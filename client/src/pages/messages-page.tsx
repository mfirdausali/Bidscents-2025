import { useEffect, useState, useRef } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useMessaging } from '@/hooks/use-messaging';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, MessageSquare, Send } from 'lucide-react';
import { formatDistance } from 'date-fns';

interface Conversation {
  userId: number;
  username: string;
  profileImage: string | null;
  lastMessage: {
    id: number;
    content: string;
    createdAt: Date;
    senderId: number;
    isRead: boolean;
  };
  productId?: number | null;
  productName?: string | null;
  unreadCount: number;
}

export function MessagesPage() {
  const { user } = useAuth();
  const { 
    getConversations, 
    getMessages, 
    sendMessage, 
    markAsRead,
    subscribeToMessages,
    unsubscribeFromMessages
  } = useMessaging();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Format time relative to now (e.g., "2 hours ago")
  const formatMessageTime = (dateString: Date) => {
    try {
      const date = new Date(dateString);
      return formatDistance(date, new Date(), { addSuffix: true });
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Unknown time";
    }
  };

  // Fetch conversations on component mount
  useEffect(() => {
    const fetchConversations = async () => {
      setLoading(true);
      try {
        if (user) {
          const conversationsData = await getConversations();
          setConversations(conversationsData);

          // Check if there's a receiverId in the URL to auto-select a conversation
          const params = new URLSearchParams(window.location.search);
          const receiverId = params.get('receiverId');
          
          if (receiverId) {
            const conversation = conversationsData.find(
              (c) => c.userId === parseInt(receiverId)
            );
            
            if (conversation) {
              setSelectedConversation(conversation);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching conversations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
    
    // Subscribe to message updates
    if (user) {
      subscribeToMessages((newMessage) => {
        // Update conversation list with new message
        setConversations((prevConversations) => {
          return prevConversations.map((conversation) => {
            if (
              (conversation.userId === newMessage.senderId && user.id === newMessage.receiverId) ||
              (conversation.userId === newMessage.receiverId && user.id === newMessage.senderId)
            ) {
              return {
                ...conversation,
                lastMessage: {
                  id: newMessage.id,
                  content: newMessage.content,
                  createdAt: newMessage.createdAt,
                  senderId: newMessage.senderId,
                  isRead: newMessage.isRead,
                },
                unreadCount: 
                  newMessage.senderId !== user.id && !newMessage.isRead
                    ? conversation.unreadCount + 1
                    : conversation.unreadCount,
              };
            }
            return conversation;
          });
        });
        
        // Update active chat if this message belongs to the selected conversation
        if (selectedConversation && 
            ((selectedConversation.userId === newMessage.senderId && user.id === newMessage.receiverId) || 
             (selectedConversation.userId === newMessage.receiverId && user.id === newMessage.senderId))) {
          setActiveChat((prevMessages) => [...prevMessages, newMessage]);
          
          // Mark message as read if it's incoming
          if (newMessage.senderId !== user.id && !newMessage.isRead) {
            markAsRead(newMessage.id);
          }
        }
      });
    }
    
    return () => {
      // Unsubscribe when component unmounts
      unsubscribeFromMessages();
    };
  }, [user, getConversations, subscribeToMessages, unsubscribeFromMessages, markAsRead]);

  // Fetch messages when a conversation is selected
  useEffect(() => {
    const loadMessages = async () => {
      if (selectedConversation && user) {
        setLoadingChat(true);
        try {
          const messages = await getMessages(selectedConversation.userId);
          setActiveChat(messages);
          
          // Mark unread messages as read
          const unreadMessages = messages.filter(
            (msg) => msg.senderId !== user.id && !msg.isRead
          );
          
          for (const msg of unreadMessages) {
            await markAsRead(msg.id);
          }
          
          // Update unread count in the selected conversation
          setConversations((prevConversations) => 
            prevConversations.map((conversation) => 
              conversation.userId === selectedConversation.userId
                ? { ...conversation, unreadCount: 0 }
                : conversation
            )
          );
        } catch (error) {
          console.error('Error loading messages:', error);
        } finally {
          setLoadingChat(false);
        }
      }
    };

    loadMessages();
  }, [selectedConversation, user, getMessages, markAsRead]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat]);

  const handleSendMessage = async () => {
    if (messageText.trim() && selectedConversation && user) {
      try {
        await sendMessage({
          content: messageText,
          receiverId: selectedConversation.userId,
          productId: selectedConversation.productId || null,
        });
        setMessageText('');
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
  };

  if (!user) {
    return (
      <div className="container mx-auto p-4 my-8">
        <Card className="p-8 max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Sign In Required</h1>
          <p className="mb-6">You need to be signed in to view your messages.</p>
          <Button asChild>
            <Link href="/auth">Sign In</Link>
          </Button>
        </Card>
      </div>
    );
  }

  // Render the message bubbles
  const renderMessages = () => {
    if (loadingChat) {
      return (
        <div className="flex justify-center items-center h-full">
          <p>Loading conversation...</p>
        </div>
      );
    } 
    
    if (activeChat.length === 0) {
      return (
        <div className="flex justify-center items-center h-full text-muted-foreground">
          <p>No messages yet. Start the conversation!</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        {activeChat.map((msg) => {
          const isOwnMessage = msg.senderId === user?.id;
          return (
            <div
              key={msg.id}
              className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4`}
            >
              {!isOwnMessage && selectedConversation && (
                <Avatar className="h-8 w-8 mr-2 mt-1">
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
                    : 'bg-muted rounded-tl-none'
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
    );
  };

  return (
    <div className="container mx-auto p-4 my-8">
      <h1 className="text-2xl font-bold mb-6">Messages</h1>
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <p>Loading conversations...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Conversations List - Left Side */}
          <div className="md:col-span-1">
            <Card className="h-full">
              <div className="p-4 border-b">
                <h2 className="font-semibold">Conversations</h2>
              </div>
              <ScrollArea className="h-[600px]">
                {conversations.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No conversations yet</p>
                    <p className="text-sm mt-1">
                      Start by contacting a seller from a product page
                    </p>
                  </div>
                ) : (
                  conversations.map((conversation) => (
                    <div
                      key={conversation.userId}
                      className={`p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                        selectedConversation?.userId === conversation.userId
                          ? 'bg-muted'
                          : ''
                      }`}
                      onClick={() => handleSelectConversation(conversation)}
                    >
                      <div className="flex items-center">
                        <Avatar className="h-10 w-10 mr-3">
                          <AvatarImage src={conversation.profileImage || ''} alt={conversation.username} />
                          <AvatarFallback>
                            {conversation.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline">
                            <h3 className="font-medium truncate">{conversation.username}</h3>
                            <span className="text-xs text-muted-foreground ml-2">
                              {formatMessageTime(conversation.lastMessage.createdAt)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-sm text-muted-foreground truncate">
                              {conversation.lastMessage.senderId === user.id ? (
                                <span className="text-muted-foreground">You: </span>
                              ) : null}
                              {conversation.lastMessage.content}
                            </p>
                            {conversation.unreadCount > 0 && (
                              <span className="ml-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                                {conversation.unreadCount}
                              </span>
                            )}
                          </div>
                          {conversation.productName && (
                            <p className="text-xs text-muted-foreground mt-1 italic truncate">
                              About: {conversation.productName}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </ScrollArea>
            </Card>
          </div>
          
          {/* Active Conversation - Right Side */}
          <div className="md:col-span-2 h-full">
            <Card className="h-full flex flex-col">
              {!selectedConversation ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <User className="h-16 w-16 text-muted-foreground mb-4" />
                  <h2 className="text-xl font-medium mb-2">No conversation selected</h2>
                  <p className="text-muted-foreground mb-6">
                    Select a conversation from the list to view messages or start a new conversation
                    by contacting a seller.
                  </p>
                  <Button asChild>
                    <Link href="/">Browse Products</Link>
                  </Button>
                </div>
              ) : (
                <>
                  {/* Conversation Header */}
                  <div className="p-4 border-b flex items-center">
                    <Avatar className="h-10 w-10 mr-3">
                      <AvatarImage 
                        src={selectedConversation.profileImage || ''} 
                        alt={selectedConversation.username} 
                      />
                      <AvatarFallback>
                        {selectedConversation.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="font-semibold text-lg">{selectedConversation.username}</h2>
                      {selectedConversation.productName && (
                        <p className="text-xs text-muted-foreground">
                          About: {selectedConversation.productName}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Messages Area */}
                  <div className="flex-1 p-4 overflow-hidden">
                    <div className="h-[400px] overflow-auto border rounded p-4">
                      {renderMessages()}
                    </div>
                  </div>
                  
                  {/* Message Input Area */}
                  <div className="p-4 border-t">
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
                      />
                      <Button 
                        onClick={handleSendMessage} 
                        disabled={!messageText.trim() || loadingChat} 
                        size="icon"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}