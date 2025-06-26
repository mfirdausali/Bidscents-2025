import React, { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Header } from '@/components/ui/header';
import { Footer } from '@/components/ui/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { XCircle, AlertTriangle, RefreshCw, MessageCircle, ArrowLeft, CreditCard, Wifi, Clock } from 'lucide-react';

interface ErrorDetails {
  type: string;
  message: string;
  code?: string;
  orderId?: string;
}

const ERROR_TYPES = {
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_CANCELLED: 'payment_cancelled',
  PAYMENT_TIMEOUT: 'payment_timeout',
  NETWORK_ERROR: 'network_error',
  INSUFFICIENT_FUNDS: 'insufficient_funds',
  INVALID_CARD: 'invalid_card',
  PRODUCTS_UNAVAILABLE: 'products_unavailable',
  SESSION_EXPIRED: 'session_expired',
  UNKNOWN: 'unknown'
};

const getErrorDetails = (reason: string | null, code: string | null): ErrorDetails => {
  const lowerReason = reason?.toLowerCase() || '';
  const lowerCode = code?.toLowerCase() || '';

  // Payment-related errors
  if (lowerReason.includes('payment') && lowerReason.includes('failed') || lowerCode === 'payment_failed') {
    return {
      type: ERROR_TYPES.PAYMENT_FAILED,
      message: 'Your payment could not be processed. This might be due to insufficient funds, an expired card, or a temporary issue with your payment method.'
    };
  }

  if (lowerReason.includes('cancelled') || lowerCode === 'cancelled') {
    return {
      type: ERROR_TYPES.PAYMENT_CANCELLED,
      message: 'The payment process was cancelled. Your order was not completed and no charges were made.'
    };
  }

  if (lowerReason.includes('timeout') || lowerCode === 'timeout') {
    return {
      type: ERROR_TYPES.PAYMENT_TIMEOUT,
      message: 'The payment process timed out. Please check your internet connection and try again.'
    };
  }

  if (lowerReason.includes('network') || lowerReason.includes('connection') || lowerCode === 'network_error') {
    return {
      type: ERROR_TYPES.NETWORK_ERROR,
      message: 'There was a network connection issue during the payment process. Please check your internet connection and try again.'
    };
  }

  if (lowerReason.includes('insufficient') || lowerCode === 'insufficient_funds') {
    return {
      type: ERROR_TYPES.INSUFFICIENT_FUNDS,
      message: 'The payment was declined due to insufficient funds. Please check your account balance or try a different payment method.'
    };
  }

  if (lowerReason.includes('card') && lowerReason.includes('invalid') || lowerCode === 'invalid_card') {
    return {
      type: ERROR_TYPES.INVALID_CARD,
      message: 'The payment method provided is invalid or has expired. Please check your card details or try a different payment method.'
    };
  }

  if (lowerReason.includes('products') || lowerReason.includes('unavailable') || lowerCode === 'products_unavailable') {
    return {
      type: ERROR_TYPES.PRODUCTS_UNAVAILABLE,
      message: 'Some of the selected products are no longer available for boosting. Please return to the checkout page and select different products.'
    };
  }

  if (lowerReason.includes('session') || lowerReason.includes('expired') || lowerCode === 'session_expired') {
    return {
      type: ERROR_TYPES.SESSION_EXPIRED,
      message: 'Your session has expired during the checkout process. Please start over and complete your order within the allocated time.'
    };
  }

  // Generic/unknown error
  return {
    type: ERROR_TYPES.UNKNOWN,
    message: reason || 'An unexpected error occurred while processing your boost order. Please try again or contact support if the issue persists.'
  };
};

const getErrorIcon = (errorType: string) => {
  switch (errorType) {
    case ERROR_TYPES.PAYMENT_FAILED:
    case ERROR_TYPES.INSUFFICIENT_FUNDS:
    case ERROR_TYPES.INVALID_CARD:
      return <CreditCard className="h-16 w-16 text-red-500" />;
    case ERROR_TYPES.NETWORK_ERROR:
      return <Wifi className="h-16 w-16 text-red-500" />;
    case ERROR_TYPES.PAYMENT_TIMEOUT:
    case ERROR_TYPES.SESSION_EXPIRED:
      return <Clock className="h-16 w-16 text-red-500" />;
    case ERROR_TYPES.PAYMENT_CANCELLED:
      return <XCircle className="h-16 w-16 text-yellow-500" />;
    default:
      return <AlertTriangle className="h-16 w-16 text-red-500" />;
  }
};

export default function BoostFailurePage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/boost/failure/:reason?');
  const [errorDetails, setErrorDetails] = useState<ErrorDetails>({ type: ERROR_TYPES.UNKNOWN, message: '' });

  useEffect(() => {
    // Get error details from URL parameters or query string
    let reason = params?.reason || null;
    let code = null;
    let orderId = null;

    // Try to get additional details from query parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (!reason) {
      reason = urlParams.get('reason') || urlParams.get('error');
    }
    code = urlParams.get('code') || urlParams.get('error_code');
    orderId = urlParams.get('orderId') || urlParams.get('order_id');

    const details = getErrorDetails(reason, code);
    if (orderId) {
      details.orderId = orderId;
    }
    
    setErrorDetails(details);
  }, [params]);

  const handleTryAgain = () => {
    // If we have an order ID, try to resume that specific order
    if (errorDetails.orderId) {
      setLocation(`/boost-checkout?resume=${errorDetails.orderId}`);
    } else {
      setLocation('/boost-checkout');
    }
  };

  const handleContactSupport = () => {
    // Create a support message with error details
    const subject = encodeURIComponent('Boost Order Payment Issue');
    const body = encodeURIComponent(
      `I encountered an issue while trying to complete my boost order.\n\n` +
      `Error Type: ${errorDetails.type}\n` +
      `Error Message: ${errorDetails.message}\n` +
      (errorDetails.orderId ? `Order ID: ${errorDetails.orderId}\n` : '') +
      `Time: ${new Date().toISOString()}\n\n` +
      `Please help me resolve this issue.`
    );
    
    window.open(`mailto:support@bidscents.com?subject=${subject}&body=${body}`, '_blank');
  };

  const handleBackToDashboard = () => {
    setLocation('/seller/dashboard');
  };

  const getRecoveryOptions = () => {
    const options = [];

    // Always show try again option
    options.push({
      primary: true,
      icon: <RefreshCw className="h-4 w-4" />,
      label: 'Try Again',
      description: 'Restart the boost checkout process',
      action: handleTryAgain
    });

    // Show specific options based on error type
    switch (errorDetails.type) {
      case ERROR_TYPES.PAYMENT_FAILED:
      case ERROR_TYPES.INSUFFICIENT_FUNDS:
      case ERROR_TYPES.INVALID_CARD:
        options.push({
          primary: false,
          icon: <CreditCard className="h-4 w-4" />,
          label: 'Update Payment Method',
          description: 'Try with a different card or payment method',
          action: handleTryAgain
        });
        break;
      
      case ERROR_TYPES.PRODUCTS_UNAVAILABLE:
        options.push({
          primary: false,
          icon: <RefreshCw className="h-4 w-4" />,
          label: 'Select Different Products',
          description: 'Choose other products to boost',
          action: handleTryAgain
        });
        break;
    }

    // Always show contact support option
    options.push({
      primary: false,
      icon: <MessageCircle className="h-4 w-4" />,
      label: 'Contact Support',
      description: 'Get help from our support team',
      action: handleContactSupport
    });

    return options;
  };

  const recoveryOptions = getRecoveryOptions();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-2xl py-16 mx-auto">
        {/* Error Header */}
        <div className="text-center mb-8">
          <div className="mb-4">
            {getErrorIcon(errorDetails.type)}
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {errorDetails.type === ERROR_TYPES.PAYMENT_CANCELLED 
              ? 'Payment Cancelled' 
              : 'Boost Order Failed'
            }
          </h1>
          <p className="text-lg text-muted-foreground">
            {errorDetails.type === ERROR_TYPES.PAYMENT_CANCELLED
              ? "Don't worry, no charges were made to your account."
              : "We couldn't complete your boost order."
            }
          </p>
        </div>

        {/* Error Details */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              What Happened?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription className="text-base">
                {errorDetails.message}
              </AlertDescription>
            </Alert>
            
            {errorDetails.orderId && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Reference:</strong> Order #{errorDetails.orderId}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recovery Options */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>What Can You Do?</CardTitle>
            <CardDescription>
              Choose from the options below to resolve this issue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recoveryOptions.map((option, index) => (
                <Button
                  key={index}
                  variant={option.primary ? 'default' : 'outline'}
                  className="w-full justify-start h-auto p-4"
                  onClick={option.action}
                >
                  <div className="flex items-start gap-3">
                    {option.icon}
                    <div className="text-left">
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {option.description}
                      </div>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Additional Help */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <h3 className="font-semibold">Need More Help?</h3>
              <p className="text-sm text-muted-foreground">
                If you continue to experience issues, our support team is here to help.
                Contact us at{' '}
                <a 
                  href="mailto:support@bidscents.com" 
                  className="text-primary hover:underline"
                >
                  support@bidscents.com
                </a>
                {' '}or through our help center.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Back to Dashboard */}
        <div className="text-center">
          <Button 
            variant="ghost" 
            onClick={handleBackToDashboard}
            className="flex items-center gap-2 mx-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
}