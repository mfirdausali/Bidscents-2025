import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useMessaging, Message } from '@/hooks/use-messaging';
import { MessagingDialog } from '@/components/ui/messaging-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useLocation, useRoute, Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, User, ArrowLeft, RefreshCw } from 'lucide-react';

export default function MessagesPage() {
  const { user } = useAuth();
  const { messages, loading, error } = useMessaging();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedUser, setSelectedUser] = useState<{
    id: number;
    name: string;
    image?: string | null;
    productId?: number;
    productName?: string;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
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
  
  // Check if user is authenticated
  useEffect(() => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'You must be logged in to view your messages.',
        variant: 'destructive',
      });
      setLocation('/auth');
    }
  }, [user, toast, setLocation]);
  
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
  
  // Open message dialog with selected user
  const openConversation = (conversation: typeof conversations[0]) => {
    setSelectedUser({
      id: conversation.userId,
      name: conversation.username,
      image: conversation.profileImage,
      productId: conversation.productInfo?.id,
      productName: conversation.productInfo?.name,
    });
    setDialogOpen(true);
  };
  
  if (!user) {
    // Instead of returning null, we'll render a simple message
    return (
      <div className="container mx-auto py-6 max-w-4xl">
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
  
  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="icon" onClick={() => setLocation('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Messages</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      {loading ? (
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
      ) : conversations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No messages yet</h3>
            <p className="text-muted-foreground mb-4 text-center">
              Start a conversation by messaging a seller through their product page.
            </p>
            <Button asChild>
              <Link href="/">Browse Products</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {conversations.map((conversation, index) => (
                <React.Fragment key={conversation.userId}>
                  <div 
                    className="flex items-center p-3 hover:bg-accent rounded-md cursor-pointer"
                    onClick={() => openConversation(conversation)}
                  >
                    <div className="relative">
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
                  {index < conversations.length - 1 && <Separator />}
                </React.Fragment>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {selectedUser && (
        <MessagingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          receiverId={selectedUser.id}
          receiverName={selectedUser.name}
          receiverImage={selectedUser.image}
          productId={selectedUser.productId}
          productName={selectedUser.productName}
        />
      )}
    </div>
  );
}