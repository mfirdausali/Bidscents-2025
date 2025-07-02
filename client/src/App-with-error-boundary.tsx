import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useAnalytics } from "./hooks/use-analytics";
import { AnalyticsProvider } from "./components/analytics/analytics-provider";
import { ErrorBoundary } from "./components/error-boundary";
import { 
  NotFoundPage, 
  ServerErrorPage, 
  GenericErrorPage 
} from "./pages/error-pages";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import ProductsPage from "@/pages/products-page";
import ProductDetailPage from "@/pages/product-detail-page";
import AuctionDetailPage from "@/pages/auction-detail-page";
import SellerDashboard from "@/pages/seller-dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import ProfilePage from "@/pages/profile-page";
import SellerProfilePage from "@/pages/seller-profile-page";
import MessagesPage from "@/pages/messages-page";
import VerifyEmailPage from "@/pages/verify-email";
import ResetPasswordPage from "@/pages/reset-password";
import AuthCallback from "@/pages/auth-callback";
import { AuthVerifyPage } from "@/pages/auth-verify";
import { ProtectedRoute } from "./lib/protected-route";
import { AuthProvider } from "./hooks/use-supabase-auth";
import TermsOfServicePage from "./pages/terms-of-service";
import PrivacyPolicyPage from "./pages/privacy-policy";
import BuyingGuidePage from "@/pages/buying-guide";
import BoostCheckoutPage from "@/pages/boost-checkout";
import BoostSuccessPage from "@/pages/boost-success";
import BoostFailurePage from "@/pages/boost-failure";

function Router() {
  // Analytics tracking for all route changes
  useAnalytics();
  
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/login" component={AuthPage} />
      <Route path="/register" component={AuthPage} />
      <Route path="/verify-email" component={AuthVerifyPage} />
      <Route path="/auth-verify" component={AuthVerifyPage} />
      <Route path="/auth/verify" component={AuthVerifyPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/auth-callback" component={AuthCallback} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/products/:id" component={ProductDetailPage} />
      <Route path="/auction/:id" component={AuctionDetailPage} />
      <Route path="/auctions/:id" component={AuctionDetailPage} />
      <ProtectedRoute path="/seller/dashboard" component={SellerDashboard} requireSeller />
      <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} requireAdmin />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <Route path="/seller/:id" component={SellerProfilePage} />
      <Route path="/terms" component={TermsOfServicePage} />
      <Route path="/privacy" component={PrivacyPolicyPage} />
      <Route path="/buying-guide" component={BuyingGuidePage} />
      <ProtectedRoute path="/boost-checkout/:productId" component={BoostCheckoutPage} />
      <Route path="/boost-success" component={BoostSuccessPage} />
      <Route path="/boost-failure" component={BoostFailurePage} />
      
      {/* Error pages */}
      <Route path="/error/404" component={NotFoundPage} />
      <Route path="/error/500" component={ServerErrorPage} />
      <Route path="/error" component={GenericErrorPage} />
      
      {/* Catch-all 404 */}
      <Route component={NotFoundPage} />
    </Switch>
  );
}

// Root error boundary for catastrophic errors
function RootErrorBoundary() {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Application Error
            </h1>
            <p className="text-gray-600 mb-4">
              Something went wrong. Please refresh the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Refresh Page
            </button>
          </div>
        </div>
      }
    >
      <App />
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AnalyticsProvider>
          <AuthProvider>
            <ErrorBoundary>
              <Router />
              <Toaster />
            </ErrorBoundary>
          </AuthProvider>
        </AnalyticsProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

// Export the wrapped app
export default RootErrorBoundary;