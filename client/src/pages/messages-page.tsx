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
import { MessageSquare, ArrowLeft, RefreshCw, Send, User, Plus, Upload, File, FileText, Image as ImageIcon, FileIcon, PaperclipIcon } from 'lucide-react';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

// Component to handle different file type previews
interface FilePreviewProps {
  fileUrl: string;
}

const FilePreviewComponent: React.FC<FilePreviewProps> = ({ fileUrl }) => {
  const [previewType, setPreviewType] = useState<string>('unknown');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Attempt to detect file type by extension or try loading it
    const detectFileType = async () => {
      setLoading(true);
      try {
        // Try a HEAD request to get content type if possible
        const response = await fetch(fileUrl, { method: 'HEAD' });
        const contentType = response.headers.get('content-type');
        
        if (contentType) {
          if (contentType.startsWith('image/')) {
            setPreviewType('image');
          } else if (contentType === 'application/pdf') {
            setPreviewType('pdf');
          } else {
            setPreviewType('other');
          }
        } else {
          // Fallback to extension checking if header doesn't work
          if (fileUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?|$)/i)) {
            setPreviewType('image');
          } else if (fileUrl.match(/\.(pdf)(\?|$)/i)) {
            setPreviewType('pdf');
          } else {
            setPreviewType('other');
          }
        }
        setLoading(false);
      } catch (err) {
        console.error('Error detecting file type:', err);
        setError('Failed to load preview');
        setLoading(false);
      }
    };

    detectFileType();
  }, [fileUrl]);

  if (loading) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center">
        <Skeleton className="h-[60vh] w-full rounded-md" />
        <p className="text-sm text-muted-foreground mt-2">Loading preview...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center bg-muted rounded-md">
        <FileIcon className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  // Render based on file type
  if (previewType === 'image') {
    return (
      <div className="w-full max-h-[60vh] flex items-center justify-center bg-background">
        <img 
          src={fileUrl} 
          alt="File preview" 
          className="max-w-full max-h-[60vh] object-contain" 
          onError={() => setError('Failed to load image')}
        />
      </div>
    );
  }
  
  if (previewType === 'pdf') {
    return (
      <iframe 
        src={fileUrl}
        className="w-full h-[60vh] border rounded"
        title="PDF preview"
      />
    );
  }
  
  // For other file types, we'll use a tabbed interface
  return (
    <div className="w-full h-[60vh] flex flex-col">
      <div className="mb-2 p-2 bg-muted rounded-t-md">
        <Tabs defaultValue="preview" className="w-full">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="info">File Info</TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="p-0">
            <iframe 
              src={fileUrl} 
              className="w-full h-[50vh] border rounded bg-background"
              title="File preview"
            />
          </TabsContent>
          <TabsContent value="info" className="bg-card p-4 rounded-md">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center py-8">
                {previewType.includes('pdf') ? (
                  <FileText className="h-20 w-20 text-primary" />
                ) : previewType.includes('image') ? (
                  <ImageIcon className="h-20 w-20 text-primary" />
                ) : (
                  <FileText className="h-20 w-20 text-primary" />
                )}
              </div>
              <p className="text-sm text-muted-foreground text-center">
                This file may need to be downloaded to view its contents properly.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default function MessagesPage() {
  const { user } = useAuth();
  const { messages, loading, error, sendMessage, sendActionMessage, getConversation, markAsRead } = useMessaging();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [messageText, setMessageText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedConversation, setSelectedConversation] = useState<{
    userId: number;
    username: string;
    profileImage?: string | null;
    productId?: number;
    productName?: string;
  } | null>(null);
  const [activeChat, setActiveChat] = useState<Message[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [sellerProducts, setSellerProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  
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
          console.log(`Marking ${unreadMessages.length} messages as read from sender ID ${userId}`);
          const success = markAsRead(undefined, userId);
          
          if (success) {
            // Update local state to show messages as read
            setActiveChat(prev => 
              prev.map(msg => 
                msg.senderId === userId && msg.receiverId === user.id && !msg.isRead 
                  ? { ...msg, isRead: true } 
                  : msg
              )
            );
            
            // Also ensure we update the unread message count in the header
            // This will be handled by the WebSocket notification in useUnreadMessages
          }
        }
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
  }, [user?.id, getConversation, markAsRead, toast]);

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
  const truncateMessage = (content: string | null, maxLength = 60) => {
    // Handle null content (like for FILE type messages)
    if (!content) {
      return '[File Attachment]';
    }
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
  
  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    console.log("Handling file upload:", file.name, file.type, file.size);
    if (!user?.id || !selectedConversation) {
      toast({
        title: 'Upload Failed',
        description: 'You must select a conversation before uploading files.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsUploading(true);
    
    try {
      // Create form data for the file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('receiverId', selectedConversation.userId.toString());
      if (selectedConversation.productId) {
        formData.append('productId', selectedConversation.productId.toString());
      }
      
      console.log("Sending file to server...");
      console.log("Receiver ID:", selectedConversation.userId);
      if (selectedConversation.productId) {
        console.log("Product ID:", selectedConversation.productId);
      }
      
      // Send the file to server
      const response = await fetch('/api/messages/upload-file', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      console.log("Upload response status:", response.status);
      
      let responseData;
      try {
        const responseText = await response.text();
        console.log("Raw response text:", responseText);
        
        if (responseText.trim()) {
          try {
            responseData = JSON.parse(responseText);
            console.log("Upload response data:", responseData);
          } catch (parseError) {
            console.error("Error parsing JSON response:", parseError);
            // Continue despite parse error
          }
        }
      } catch (readError) {
        console.error("Error reading response:", readError);
      }
      
      if (!response.ok) {
        throw new Error(responseData?.message || 'Failed to upload file');
      }
      
      toast({
        title: 'File Uploaded',
        description: 'Your file has been sent successfully.',
        variant: 'default',
      });
      
      // Immediately add the file message to the UI
      if (responseData && responseData.success && responseData.message) {
        // Add the new message to the state
        const newMessage: Message = {
          id: responseData.message.id,
          senderId: user?.id || 0,
          receiverId: selectedConversation.userId,
          content: null,
          fileUrl: responseData.message.fileUrl || `/api/message-files/${responseData.message.file_url}`,
          messageType: 'FILE',
          createdAt: new Date(),
          isRead: false,
          productId: selectedConversation.productId || null
        };
        
        // Add the new message to the current conversation
        setActiveChat(prevChat => [newMessage, ...prevChat]);
        
        // Scroll to the bottom to show the new message
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  }, [user?.id, selectedConversation, toast]);
  
  // Trigger the file input click
  const triggerFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  // Open transaction dialog
  const openCreateTransaction = useCallback(async () => {
    if (!user?.id || !user.isSeller || !selectedConversation) {
      toast({
        title: 'Action Not Allowed',
        description: 'You must be a seller and have a selected conversation to create a transaction.',
        variant: 'destructive',
      });
      return;
    }
    
    console.log("Opening transaction dialog for seller:", user.id);
    setLoadingProducts(true);
    setIsTransactionDialogOpen(true);
    
    try {
      // Fetch seller's active products - try the more specific endpoint with status filter
      console.log("Fetching seller products...");
      const sellerId = user.id;
      const response = await fetch(`/api/sellers/${sellerId}/products?status=active`);
      
      console.log("API response status:", response.status);
      
      if (!response.ok) {
        throw new Error('Failed to load products');
      }
      
      const result = await response.json();
      console.log("API response data:", result);
      
      // Check if the response contains a nested 'products' property
      const data = result.products || result;
      console.log("Products data extracted:", data);
      
      // Filter active products, but don't filter if none have status field
      // This handles both legacy and new product structures
      const hasStatusField = data.some((product: any) => product.status !== undefined);
      const filteredProducts = hasStatusField 
        ? data.filter((product: any) => product.status === 'active')
        : data;
      
      console.log("Filtered products:", filteredProducts);
      console.log("Products with active status:", 
        hasStatusField ? data.filter((product: any) => product.status === 'active').length : 'N/A');
      console.log("Total products:", data.length);
      
      setSellerProducts(filteredProducts);
    } catch (error) {
      console.error('Error loading seller products:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your products. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingProducts(false);
    }
  }, [user, selectedConversation, toast]);
  
  // Create transaction message
  const createTransactionMessage = useCallback(async (product: any) => {
    if (!user?.id || !selectedConversation) return;
    
    try {
      // Send action message through our hook
      const success = sendActionMessage(
        selectedConversation.userId,
        product.id,
        'INITIATE'
      );
      
      if (success) {
        // Close the transaction dialog
        setIsTransactionDialogOpen(false);
        
        toast({
          title: 'Transaction Created',
          description: 'Your purchase confirmation has been sent.',
        });
      } else {
        throw new Error('Failed to send action message');
      }
    } catch (error) {
      console.error('Error creating transaction:', error);
      toast({
        title: 'Error',
        description: 'Failed to create transaction. Please try again.',
        variant: 'destructive',
      });
    }
  }, [user, selectedConversation, toast, sendActionMessage]);
  

  
  // Handle file selection from input
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset the input value so the same file can be selected again
    if (e.target) e.target.value = '';
  }, [handleFileUpload]);

  // Handle sending a message
  const handleSendMessage = useCallback(() => {
    if (!messageText.trim() || !user?.id || !selectedConversation) return;
    
    const sent = sendMessage(
      selectedConversation.userId, 
      messageText, 
      selectedConversation.productId
    );
    
    if (sent) {
      setMessageText('');
      // No need to refresh - WebSocket will deliver the message and we'll update state
    } else {
      toast({
        title: 'Message Not Sent',
        description: 'Failed to send your message. Please try again.',
        variant: 'destructive',
      });
    }
  }, [messageText, user?.id, selectedConversation, sendMessage, toast]);
  
  // Handle confirming a purchase
  const handleConfirmPurchase = useCallback(async (messageId: number) => {
    try {
      console.log("Confirming purchase for message:", messageId);
      
      // Call API to confirm the purchase
      const response = await fetch('/api/messages/action/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to confirm purchase');
      }
      
      // Update the UI to show confirmation
      setActiveChat(prevChat => 
        prevChat.map(msg => 
          msg.id === messageId ? { ...msg, isClicked: true } : msg
        )
      );
      
      toast({
        title: 'Purchase Confirmed',
        description: 'The seller has been notified of your confirmation.',
        variant: 'default',
      });
    } catch (error: any) {
      console.error("Error confirming purchase:", error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to confirm purchase. Please try again.',
        variant: 'destructive',
      });
    }
  }, [toast, setActiveChat]);
  
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
        setActiveChat(prev => {
          // Sort messages by creation time (oldest first)
          return [...prev, ...newMessages].sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
      }
    }
  }, [messages, selectedConversation, user?.id, activeChat]);
  
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
  
  // Transaction dialog component
  const TransactionDialog = () => {
    return (
      <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Transaction</DialogTitle>
            <DialogDescription>
              Select a product to create a purchase confirmation
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {loadingProducts ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : sellerProducts.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground">No active listings found</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {sellerProducts.map((product) => (
                  <div 
                    key={product.id}
                    className="flex items-center space-x-4 border rounded-md p-3 hover:bg-accent cursor-pointer"
                    onClick={() => {
                      console.log("Selected product for transaction:", product);
                      createTransactionMessage(product);
                    }}
                  >
                    <div className="flex-shrink-0 h-16 w-16 rounded-md overflow-hidden bg-muted">
                      <img
                        src={
                          // First, try to find an image with imageOrder=0
                          product.images &&
                          product.images.find(
                            (img: any) => img.imageOrder === 0
                          )
                            ? `/api/images/${product.images.find((img: any) => img.imageOrder === 0)?.imageUrl}`
                            : // Then try any available image
                              product.images &&
                                product.images.length > 0
                              ? `/api/images/${product.images[0].imageUrl}`
                              : // Then try a single imageUrl if present
                                product.imageUrl
                                ? `/api/images/${product.imageUrl}`
                                : // Default placeholder if no images are available
                                  "/placeholder.jpg"
                        }
                        alt={product.name}
                        onError={(e) => {
                          // If image fails to load, use placeholder
                          (e.target as HTMLImageElement).src =
                            "/placeholder.jpg";
                        }}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        ${typeof product.price === 'number' ? product.price.toFixed(2) : 'Price unavailable'}
                      </p>
                      {product.remainingPercentage && (
                        <p className="text-xs">{product.remainingPercentage}% remaining</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsTransactionDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
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
                          {conversation.lastMessage.messageType === 'FILE' 
                            ? '[File Attachment]' 
                            : truncateMessage(conversation.lastMessage.content)}
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
                              {/* Handle different message types */}
                              {msg.messageType === 'FILE' && (
                                <div className="file-message">
                                  {msg.fileUrl && (
                                    <Dialog>
                                      <DialogTrigger asChild>
                                        <button 
                                          className="flex w-full items-center p-2 bg-muted rounded-md text-foreground hover:bg-muted/80 mb-2"
                                        >
                                          <File className="h-8 w-8 mr-2 text-primary" />
                                          <div className="text-left">
                                            <div className="font-medium">File Attachment</div>
                                            <div className="text-xs text-muted-foreground">Click to view</div>
                                          </div>
                                        </button>
                                      </DialogTrigger>
                                      <DialogContent className="max-w-4xl">
                                        <DialogHeader>
                                          <DialogTitle>File Attachment</DialogTitle>
                                          <DialogDescription>
                                            Shared in conversation on {format(new Date(msg.createdAt), 'PPP')}
                                          </DialogDescription>
                                        </DialogHeader>
                                        <div className="flex flex-col items-center justify-center p-4">
                                          {/* Add preview parameter to request inline content */}
                                          <FilePreviewComponent fileUrl={`${msg.fileUrl}?preview=true`} />
                                        </div>
                                        <DialogFooter className="flex gap-2">
                                          <a 
                                            href={msg.fileUrl} 
                                            download
                                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2"
                                          >
                                            Download
                                          </a>
                                          <a 
                                            href={`${msg.fileUrl}?preview=true`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                                          >
                                            Open in New Tab
                                          </a>
                                        </DialogFooter>
                                      </DialogContent>
                                    </Dialog>
                                  )}
                                </div>
                              )}
                              
                              {/* Transaction Message */}
                              {msg.messageType === 'ACTION' && (
                                <div className="transaction-message">
                                  <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4 w-full">
                                    <div className="text-lg font-bold mb-2">Confirm Purchase</div>
                                    
                                    {msg.product && (
                                      <div className="flex items-start mb-3">
                                        {/* Product Image */}
                                        <div className="h-16 w-16 rounded-md overflow-hidden bg-muted mr-3 flex-shrink-0">
                                          <img
                                            src={
                                              msg.product.imageUrl
                                                ? msg.product.imageUrl.startsWith('/api/images/')
                                                  ? msg.product.imageUrl
                                                  : `/api/images/${msg.product.imageUrl}`
                                                : "/placeholder.jpg"
                                            }
                                            alt={msg.product.name}
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).src = "/placeholder.jpg";
                                            }}
                                            className="w-full h-full object-cover"
                                          />
                                        </div>
                                        
                                        {/* Product Details */}
                                        <div className="flex-grow">
                                          <div className="font-medium text-base">{msg.product.name}</div>
                                          {msg.product.price && (
                                            <div className="text-sm font-medium text-green-700">
                                              ${Number(msg.product.price).toFixed(2)}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Always show the confirm button, but only enabled for the buyer */}
                                    {!msg.isClicked && (
                                      <Button 
                                        className="w-full"
                                        onClick={() => handleConfirmPurchase(msg.id)}
                                        disabled={msg.receiverId !== user?.id}
                                      >
                                        {msg.receiverId === user?.id ? 
                                          "Confirm Purchase" : 
                                          "Waiting for Buyer's Confirmation"
                                        }
                                      </Button>
                                    )}
                                    
                                    {/* Show status when already clicked */}
                                    {msg.isClicked && (
                                      <div className="bg-green-100 text-green-700 font-medium p-2 rounded-md text-center mt-2">
                                        ✓ Purchase confirmed
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Regular Text Message */}
                              {msg.messageType !== 'FILE' && msg.messageType !== 'ACTION' && (
                                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                              )}
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
                  <div className="flex items-center space-x-2">
                    {/* Hidden file input */}
                    <input 
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileSelect}
                      accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    />
                    
                    {/* File upload button */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-full"
                          disabled={isUploading || !selectedConversation}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" side="top">
                        <div className="space-y-1">
                          <Button 
                            variant="ghost" 
                            className="w-full justify-start"
                            onClick={triggerFileUpload}
                            disabled={isUploading || !selectedConversation}
                          >
                            <div className="flex items-center">
                              <Upload className="mr-2 h-4 w-4" />
                              <span>Upload file</span>
                            </div>
                          </Button>
                          {user?.isSeller && (
                            <Button 
                              variant="ghost" 
                              className="w-full justify-start"
                              onClick={openCreateTransaction}
                              disabled={isUploading || !selectedConversation}
                            >
                              <div className="flex items-center">
                                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M21 4H3C1.89543 4 1 4.89543 1 6V18C1 19.1046 1.89543 20 3 20H21C22.1046 20 23 19.1046 23 18V6C23 4.89543 22.1046 4 21 4Z" 
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M1 10H23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M4 15H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M12 15H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>Create Transaction</span>
                              </div>
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    
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
                      disabled={!messageText.trim() || loadingChat || isUploading} 
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
      
      {/* Transaction Dialog */}
      <TransactionDialog />
    </div>
  );
}