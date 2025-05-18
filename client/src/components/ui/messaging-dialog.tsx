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
        

        
        <div className="h-[400px] overflow-y-auto p-4 border rounded-md">
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

              {conversation.map((msg) => {
                const isOwnMessage = msg.senderId === user?.id;
                
                // Render different message types
                if (msg.messageType === 'FILE' && msg.fileUrl) {
                  // File message type
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
                        <div className="text-sm">
                          <a 
                            href={msg.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            {msg.content || 'Shared a file'}
                          </a>
                        </div>
                        <div className="text-xs mt-1 opacity-70">
                          {formatMessageTime(msg.createdAt)}
                          {isOwnMessage && <span className="ml-2">{msg.isRead ? '✓✓' : '✓'}</span>}
                        </div>
                      </div>
                    </div>
                  );
                } else if (msg.messageType === 'ACTION' && msg.actionType) {
                  // Action message type (transaction)
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-3 rounded-lg border ${
                          isOwnMessage
                            ? 'border-primary/30 bg-primary/10'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex flex-col">
                          <div className="text-sm font-medium mb-2">
                            {msg.actionType === 'INITIATE' ? 'Purchase This Item' : 'Transaction Action'}
                          </div>
                          
                          {msg.product && (
                            <div className="flex items-center mb-2">
                              <div className="h-10 w-10 rounded bg-muted overflow-hidden mr-2">
                                {msg.product.imageUrl ? (
                                  <img 
                                    src={`/api/images/${msg.product.imageUrl}`} 
                                    alt={msg.product.name} 
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-full w-full">
                                    <span className="text-xs">No img</span>
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-medium">{msg.product.name}</div>
                                {msg.product.price && (
                                  <div className="text-xs">${msg.product.price.toFixed(2)}</div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {!msg.isClicked && msg.receiverId === user?.id && (
                            <Button 
                              size="sm" 
                              className="mt-1" 
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("Transaction action clicked for message:", msg.id);
                                
                                // For now, just update the local state
                                // Using this simpler approach until the API endpoint is implemented
                                setConversation(prev => 
                                  prev.map(m => 
                                    m.id === msg.id ? { ...m, isClicked: true } : m
                                  )
                                );
                              }}
                            >
                              Confirm Purchase
                            </Button>
                          )}
                          
                          {msg.isClicked && (
                            <div className="text-xs text-green-600 mt-1">
                              ✓ Purchase confirmed
                            </div>
                          )}
                        </div>
                        <div className="text-xs mt-2 opacity-70">
                          {formatMessageTime(msg.createdAt)}
                          {isOwnMessage && <span className="ml-2">{msg.isRead ? '✓✓' : '✓'}</span>}
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  // Default text message type
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
                }
              })}
              <div ref={messagesEndRef} />
            </>
          )}
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