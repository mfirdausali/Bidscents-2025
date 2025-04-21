import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessagingDialog } from '@/components/ui/messaging-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { MessageSquare } from 'lucide-react';

interface ContactSellerButtonProps {
  sellerId: number;
  sellerName: string;
  sellerImage?: string | null;
  productId: number;
  productName: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function ContactSellerButton({
  sellerId,
  sellerName,
  sellerImage,
  productId,
  productName,
  variant = 'secondary',
  size = 'default',
  className = '',
}: ContactSellerButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = () => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'You need to log in to contact sellers.',
        variant: 'default',
      });
      setLocation('/auth');
      return;
    }

    // Don't allow messaging yourself
    if (user.id === sellerId) {
      toast({
        title: 'Cannot Message Yourself',
        description: 'This is your own product listing.',
        variant: 'default',
      });
      return;
    }

    setDialogOpen(true);
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={className}
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        Contact Seller
      </Button>

      {dialogOpen && (
        <MessagingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          receiverId={sellerId}
          receiverName={sellerName}
          receiverImage={sellerImage}
          productId={productId}
          productName={productName}
        />
      )}
    </>
  );
}