import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { 
  AlertCircle, 
  Lock, 
  SearchX, 
  ServerCrash, 
  WifiOff,
  Clock,
  Home,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';

interface ErrorPageProps {
  title: string;
  message: string;
  icon: React.ReactNode;
  showRetry?: boolean;
  showBack?: boolean;
  showHome?: boolean;
  retryAction?: () => void;
}

function ErrorPageLayout({
  title,
  message,
  icon,
  showRetry = true,
  showBack = true,
  showHome = true,
  retryAction
}: ErrorPageProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleRetry = () => {
    if (retryAction) {
      retryAction();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 flex items-center justify-center">
            {icon}
          </div>
          <h1 className="mt-6 text-3xl font-extrabold text-gray-900">
            {title}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {message}
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {showRetry && (
            <Button
              onClick={handleRetry}
              className="w-full flex items-center justify-center"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          )}
          
          {showBack && location.key !== 'default' && (
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className="w-full flex items-center justify-center"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          )}
          
          {showHome && (
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="w-full flex items-center justify-center"
            >
              <Home className="mr-2 h-4 w-4" />
              Go to Homepage
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// 404 Not Found Page
export function NotFoundPage() {
  return (
    <ErrorPageLayout
      title="Page Not Found"
      message="The page you're looking for doesn't exist or has been moved."
      icon={<SearchX className="h-16 w-16 text-gray-400" />}
      showRetry={false}
    />
  );
}

// 403 Forbidden Page
export function ForbiddenPage() {
  return (
    <ErrorPageLayout
      title="Access Denied"
      message="You don't have permission to access this resource. Please contact support if you believe this is an error."
      icon={<Lock className="h-16 w-16 text-red-500" />}
      showRetry={false}
    />
  );
}

// 500 Server Error Page
export function ServerErrorPage() {
  return (
    <ErrorPageLayout
      title="Server Error"
      message="We're experiencing technical difficulties. Our team has been notified and is working on a fix."
      icon={<ServerCrash className="h-16 w-16 text-red-500" />}
    />
  );
}

// Network Error Page
export function NetworkErrorPage() {
  return (
    <ErrorPageLayout
      title="Connection Error"
      message="Unable to connect to our servers. Please check your internet connection and try again."
      icon={<WifiOff className="h-16 w-16 text-gray-400" />}
    />
  );
}

// Rate Limit Page
export function RateLimitPage() {
  const [timeLeft, setTimeLeft] = React.useState(60);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <ErrorPageLayout
      title="Too Many Requests"
      message={`Please wait ${timeLeft} seconds before trying again.`}
      icon={<Clock className="h-16 w-16 text-orange-500" />}
      showRetry={timeLeft === 0}
      showBack={false}
    />
  );
}

// Generic Error Page
export function GenericErrorPage({ 
  error 
}: { 
  error?: { 
    code?: string; 
    message?: string; 
    statusCode?: number 
  } 
}) {
  const statusCode = error?.statusCode || 500;
  const message = error?.message || 'An unexpected error occurred.';
  
  // Map status codes to specific pages
  if (statusCode === 404) return <NotFoundPage />;
  if (statusCode === 403) return <ForbiddenPage />;
  if (statusCode === 429) return <RateLimitPage />;
  if (statusCode >= 500) return <ServerErrorPage />;
  
  return (
    <ErrorPageLayout
      title="Error"
      message={message}
      icon={<AlertCircle className="h-16 w-16 text-red-500" />}
    />
  );
}

// Maintenance Page
export function MaintenancePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <ServerCrash className="mx-auto h-16 w-16 text-blue-500" />
          <h1 className="mt-6 text-3xl font-extrabold text-gray-900">
            Scheduled Maintenance
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            We're currently performing scheduled maintenance to improve your experience.
          </p>
          <p className="mt-4 text-lg font-semibold text-blue-600">
            We'll be back soon!
          </p>
        </div>
        
        <div className="mt-8">
          <p className="text-xs text-gray-500">
            Expected completion: 2-3 hours
          </p>
        </div>
      </div>
    </div>
  );
}