import React, { useState, useEffect, useRef } from 'react';
import { useMessaging, Message } from '@/hooks/use-messaging';
import { useAuth } from '@/hooks/use-auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Send, ArrowLeft } from 'lucide-react';

interface MessagingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiverId: number;
  receiverName: string;
  receiverImage?: string | null;
  productId?: number;
  productName?: string;
}

export function MessagingDialog({
  open,
  onOpenChange,
  receiverId,
  receiverName,
  receiverImage,
  productId,
  productName,
}: MessagingDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { sendMessage, getConversation, markAsRead } = useMessaging();
  const [messageText, setMessageText] = useState('');
  const [conversation, setConversation] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Load conversation when dialog opens
  useEffect(() => {
    if (open && receiverId && user?.id) {
      loadConversation();
    }
  }, [open, receiverId, user?.id]);
  
  // Mark messages as read when conversation loads
  useEffect(() => {
    if (open && conversation.length > 0 && user?.id) {
      const unreadMessages = conversation.filter(
        msg => !msg.isRead && msg.senderId === receiverId && msg.receiverId === user.id
      );
      
      if (unreadMessages.length > 0) {
        markAsRead(undefined, receiverId);
      }
    }
  }, [conversation, open, receiverId, user?.id, markAsRead]);
  
  // Scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);
  
  const loadConversation = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const messages = await getConversation(receiverId, productId);
      // Make sure we're handling the response properly
      if (Array.isArray(messages)) {
        setConversation(messages);
      } else {
        setConversation([]);
        console.error('Invalid conversation data format');
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSendMessage = () => {
    if (!messageText.trim() || !user?.id) return;
    
    const sent = sendMessage(receiverId, messageText, productId);
    if (sent) {
      setMessageText('');
    } else {
      toast({
        title: 'Message Not Sent',
        description: 'Failed to send your message. Please try again.',
        variant: 'destructive',
      });
    }
  };
  
  // Format timestamp for messages
  const formatMessageTime = (timestamp: string | Date) => {
    try {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
      return format(date, 'MMM d, h:mm a');
    } catch (error) {
      return 'Unknown time';
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={receiverImage || ''} alt={receiverName} />
              <AvatarFallback>{receiverName.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span>{receiverName}</span>
              {productName && (
                <span className="text-xs text-muted-foreground">
                  Regarding: {productName}
                </span>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[50vh] p-4 border rounded-md">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <p>Loading conversation...</p>
            </div>
          ) : conversation.length === 0 ? (
            <div className="flex justify-center items-center h-full text-muted-foreground">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            <>
              {conversation.map((msg) => {
                const isOwnMessage = msg.senderId === user?.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4`}
                  >
                    <div
                      className={`max-w-[80%] px-4 py-2 rounded-lg ${
                        isOwnMessage
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <div className="text-sm">{msg.content}</div>
                      <div className="text-xs mt-1 opacity-70">
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
            </>
          )}
        </ScrollArea>
        
        <DialogFooter className="flex">
          <div className="flex items-center w-full space-x-2">
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
            <Button onClick={handleSendMessage} disabled={!messageText.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}