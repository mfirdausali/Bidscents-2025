import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Message } from '@/hooks/use-messaging';

// Handler for confirming payment received
export const useConfirmPaymentReceived = (
  user: any,
  setActiveChat: React.Dispatch<React.SetStateAction<Message[]>>,
  setActiveTransaction: React.Dispatch<React.SetStateAction<{
    createdAt: string;
    productId: number;
    transactionId: number;
  } | null>>,
  refreshMessages: () => void
) => {
  const { toast } = useToast();
  
  return useCallback(async (messageId: number) => {
    if (!user) return;
    
    try {
      // Call API to update payment confirmation
      const response = await fetch('/api/messages/action/confirm-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messageId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to confirm payment');
      }
      
      // Update the message in the UI to show it's been clicked
      setActiveChat(prevMessages => 
        prevMessages.map(msg => 
          msg.id === messageId 
            ? { ...msg, isClicked: true } 
            : msg
        )
      );
      
      toast({
        title: 'Payment confirmed',
        description: 'You have confirmed receiving payment for this item.',
      });
      
      // Clear the active transaction since payment is confirmed
      setActiveTransaction(null);
      
      // Refresh messages to ensure we have the latest data
      refreshMessages();
      
    } catch (error) {
      console.error('Error confirming payment:', error);
      toast({
        title: 'Error',
        description: 'Failed to confirm payment. Please try again.',
        variant: 'destructive',
      });
    }
  }, [user, toast, setActiveChat, setActiveTransaction, refreshMessages]);
};