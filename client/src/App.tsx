import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useAnalytics } from "./hooks/use-analytics";
import { AnalyticsProvider } from "./components/analytics/analytics-provider";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";

// Enable WebSocket interceptor in development to fix URL issues
if (import.meta.env.DEV) {
  import('./lib/websocket-interceptor').then(({ setupWebSocketInterceptor }) => {
    setupWebSocketInterceptor();
  });
}
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
import { AuthDebug } from "@/components/debug/auth-debug";
import TermsOfServicePage from "./pages/terms-of-service";
import PrivacyPolicyPage from "./pages/privacy-policy";
import BuyingGuidePage from "@/pages/buying-guide"; // Import the new component
import BoostCheckoutPage from "@/pages/boost-checkout"; // Import boost checkout page
import BoostSuccessPage from "@/pages/boost-success"; // Import boost success page
import BoostFailurePage from "@/pages/boost-failure"; // Import boost failure page
import BoostPaymentResult from "@/pages/boost-payment-result"; // Import boost payment result page
import { SecurityDashboard } from "@/pages/admin/security-dashboard"; // Import security dashboard
// WebSocket interceptor is loaded above

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
      <Route path="/sellers/:id" component={SellerProfilePage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <ProtectedRoute path="/seller/dashboard" component={SellerDashboard} />
      <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} />
      <ProtectedRoute path="/admin/security" component={SecurityDashboard} />
      <Route path="/terms-of-service" component={TermsOfServicePage} />
      <Route path="/privacy-policy" component={PrivacyPolicyPage} />
      <Route path="/buying-guide" component={BuyingGuidePage} /> {/* Added Buying Guide route */}
      <ProtectedRoute path="/boost-checkout" component={BoostCheckoutPage} /> {/* Added Boost Checkout route */}
      <ProtectedRoute path="/boost/success" component={BoostSuccessPage} /> {/* Added Boost Success route */}
      <ProtectedRoute path="/boost/success/:orderId" component={BoostSuccessPage} /> {/* Added Boost Success route with orderId */}
      <ProtectedRoute path="/boost/failure" component={BoostFailurePage} /> {/* Added Boost Failure route */}
      <ProtectedRoute path="/boost/failure/:reason" component={BoostFailurePage} /> {/* Added Boost Failure route with reason */}
      <ProtectedRoute path="/boost/payment-result" component={BoostPaymentResult} /> {/* Added Boost Payment Result route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AnalyticsProvider>
        <AuthProvider>
          <Router />
          <Toaster />
          <AuthDebug />
        </AuthProvider>
      </AnalyticsProvider>
    </QueryClientProvider>
  );
}

export default App;