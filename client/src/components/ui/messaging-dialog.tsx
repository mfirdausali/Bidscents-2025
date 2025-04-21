import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMessaging } from "@/hooks/use-messaging";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDistance } from "date-fns";
import { Send } from "lucide-react";

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
  const { getMessages, sendMessage, markAsRead, subscribeToMessages, unsubscribeFromMessages } = useMessaging();
  const [conversation, setConversation] = useState<any[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
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

  // Fetch messages when dialog opens
  useEffect(() => {
    const loadMessages = async () => {
      if (open && user) {
        setLoading(true);
        try {
          const messages = await getMessages(receiverId);
          setConversation(messages);
          
          // Mark unread messages as read
          const unreadMessages = messages.filter(
            (msg) => msg.senderId !== user.id && !msg.isRead
          );
          
          for (const msg of unreadMessages) {
            await markAsRead(msg.id);
          }
        } catch (error) {
          console.error("Error loading messages:", error);
        } finally {
          setLoading(false);
        }
      }
    };

    loadMessages();
    
    // Subscribe to message updates
    if (open && user) {
      subscribeToMessages((newMessage) => {
        // Only update if message is part of this conversation
        if (
          (newMessage.senderId === receiverId && newMessage.receiverId === user.id) ||
          (newMessage.senderId === user.id && newMessage.receiverId === receiverId)
        ) {
          setConversation((prevMessages) => [...prevMessages, newMessage]);
          
          // Mark incoming messages as read
          if (newMessage.senderId !== user.id && !newMessage.isRead) {
            markAsRead(newMessage.id);
          }
        }
      });
    }
    
    return () => {
      // Clean up subscription when dialog closes
      if (open) {
        unsubscribeFromMessages();
      }
    };
  }, [open, user, receiverId, getMessages, markAsRead, subscribeToMessages, unsubscribeFromMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const handleSendMessage = async () => {
    if (messageText.trim() && user) {
      try {
        await sendMessage({
          content: messageText,
          receiverId: receiverId,
          productId: productId || null,
        });
        setMessageText("");
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Avatar className="h-8 w-8 mr-2">
              <AvatarImage src={receiverImage || ""} alt={receiverName} />
              <AvatarFallback>{receiverName.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <span>{receiverName}</span>
              {productName && (
                <p className="text-xs text-muted-foreground">
                  About: {productName}
                </p>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="h-[400px] overflow-auto border rounded-md">
          <div className="p-4">
            {loading ? (
              <div className="flex justify-center items-center h-full">
                <p>Loading conversation...</p>
              </div>
            ) : conversation.length === 0 ? (
              <div className="flex justify-center items-center h-full text-muted-foreground">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              <div>
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
              </div>
            )}
          </div>
        </div>
        
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