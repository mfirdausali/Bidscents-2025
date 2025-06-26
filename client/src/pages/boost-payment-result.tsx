import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PaymentParams {
  'billplz[id]': string;
  'billplz[paid]': string;
  'billplz[paid_at]': string;
  'billplz[x_signature]': string;
}

export default function BoostPaymentResult() {
  const [location, navigate] = useLocation();
  const [paymentStatus, setPaymentStatus] = useState<'loading' | 'success' | 'failed' | 'pending'>('loading');
  const [billId, setBillId] = useState<string>('');
  const [paidAt, setPaidAt] = useState<string>('');
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const billplzId = urlParams.get('billplz[id]');
    const billplzPaid = urlParams.get('billplz[paid]');
    const billplzPaidAt = urlParams.get('billplz[paid_at]');
    const billplzSignature = urlParams.get('billplz[x_signature]');

    console.log('Payment result parameters:', {
      billplzId,
      billplzPaid,
      billplzPaidAt,
      billplzSignature
    });

    if (!billplzId) {
      console.error('Missing bill ID in payment result');
      setPaymentStatus('failed');
      setVerifying(false);
      return;
    }

    setBillId(billplzId);
    if (billplzPaidAt) {
      setPaidAt(billplzPaidAt);
    }

    // Determine payment status from Billplz parameters
    if (billplzPaid === 'true') {
      setPaymentStatus('success');
      toast({
        title: "Payment Successful! 🎉",
        description: "Your boost package has been activated and your products are now featured.",
      });
    } else if (billplzPaid === 'false') {
      setPaymentStatus('failed');
      toast({
        title: "Payment Failed",
        description: "Your payment was not completed. Please try again.",
        variant: "destructive"
      });
    } else {
      setPaymentStatus('pending');
      toast({
        title: "Payment Pending",
        description: "Your payment is being processed. Please wait for confirmation.",
      });
    }

    setVerifying(false);

    // Optional: Verify payment status with backend
    if (billplzId) {
      fetch(`/api/payments/verify-status?bill_id=${billplzId}`, {
        credentials: 'include'
      })
      .then(response => response.json())
      .then(data => {
        console.log('Payment verification response:', data);
        // Update status based on server verification if needed
      })
      .catch(error => {
        console.warn('Failed to verify payment status:', error);
        // Don't change the status - use Billplz parameters as source of truth
      });
    }
  }, []);

  const getStatusIcon = () => {
    switch (paymentStatus) {
      case 'success':
        return <CheckCircle className="h-16 w-16 text-green-500" />;
      case 'failed':
        return <XCircle className="h-16 w-16 text-red-500" />;
      case 'pending':
        return <Clock className="h-16 w-16 text-orange-500" />;
      default:
        return <AlertCircle className="h-16 w-16 text-gray-500" />;
    }
  };

  const getStatusTitle = () => {
    switch (paymentStatus) {
      case 'success':
        return 'Payment Successful!';
      case 'failed':
        return 'Payment Failed';
      case 'pending':
        return 'Payment Pending';
      default:
        return 'Processing Payment...';
    }
  };

  const getStatusDescription = () => {
    switch (paymentStatus) {
      case 'success':
        return 'Your boost package has been activated successfully. Your products are now featured and will receive increased visibility.';
      case 'failed':
        return 'Your payment could not be processed. Please try again or contact support if the problem persists.';
      case 'pending':
        return 'Your payment is being processed. You will receive a confirmation shortly.';
      default:
        return 'Please wait while we verify your payment status...';
    }
  };

  const getStatusColor = () => {
    switch (paymentStatus) {
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'failed':
        return 'border-red-200 bg-red-50';
      case 'pending':
        return 'border-orange-200 bg-orange-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  if (verifying && paymentStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-500"></div>
            </div>
            <CardTitle>Processing Payment</CardTitle>
            <CardDescription>
              Please wait while we verify your payment status...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className={`w-full max-w-md ${getStatusColor()}`}>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {getStatusIcon()}
          </div>
          <CardTitle className="text-2xl">{getStatusTitle()}</CardTitle>
          <CardDescription className="text-base">
            {getStatusDescription()}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {billId && (
            <div className="bg-white p-3 rounded-lg border">
              <div className="text-sm text-gray-600">Transaction ID</div>
              <div className="font-mono text-sm break-all">{billId}</div>
            </div>
          )}
          
          {paidAt && paymentStatus === 'success' && (
            <div className="bg-white p-3 rounded-lg border">
              <div className="text-sm text-gray-600">Payment Time</div>
              <div className="text-sm">{new Date(paidAt).toLocaleString()}</div>
            </div>
          )}

          <div className="flex flex-col space-y-2">
            {paymentStatus === 'success' && (
              <Button 
                onClick={() => navigate('/seller/dashboard')}
                className="w-full"
              >
                View Boosted Products
              </Button>
            )}
            
            {paymentStatus === 'failed' && (
              <Button 
                onClick={() => navigate('/boost-checkout')}
                className="w-full"
              >
                Try Again
              </Button>
            )}
            
            {paymentStatus === 'pending' && (
              <Button 
                onClick={() => navigate('/seller/dashboard')}
                variant="outline"
                className="w-full"
              >
                Check Status Later
              </Button>
            )}
            
            <Button 
              onClick={() => navigate('/')}
              variant="outline"
              className="w-full"
            >
              Return to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}