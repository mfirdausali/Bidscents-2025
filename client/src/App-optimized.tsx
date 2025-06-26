import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useAnalytics } from "./hooks/use-analytics";
import { AnalyticsProvider } from "./components/analytics/analytics-provider";
import { ProtectedRoute } from "./lib/protected-route";
import { AuthProvider } from "./hooks/use-supabase-auth";
import { AuthDebug } from "@/components/debug/auth-debug";

// Eagerly loaded routes (critical path)
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import ProductsPage from "@/pages/products-page";
import NotFound from "@/pages/not-found";

// Lazy loaded routes (non-critical)
const ProductDetailPage = lazy(() => import("@/pages/product-detail-page"));
const AuctionDetailPage = lazy(() => import("@/pages/auction-detail-page"));
const SellerDashboard = lazy(() => import("@/pages/seller-dashboard"));
const AdminDashboard = lazy(() => import("@/pages/admin-dashboard"));
const ProfilePage = lazy(() => import("@/pages/profile-page"));
const SellerProfilePage = lazy(() => import("@/pages/seller-profile-page"));
const MessagesPage = lazy(() => import("@/pages/messages-page"));
const VerifyEmailPage = lazy(() => import("@/pages/verify-email"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));
const AuthCallback = lazy(() => import("@/pages/auth-callback"));
const AuthVerifyPage = lazy(() => import("@/pages/auth-verify").then(m => ({ default: m.AuthVerifyPage })));
const TermsOfServicePage = lazy(() => import("./pages/terms-of-service"));
const PrivacyPolicyPage = lazy(() => import("./pages/privacy-policy"));
const BuyingGuidePage = lazy(() => import("@/pages/buying-guide"));
const BoostCheckoutPage = lazy(() => import("@/pages/boost-checkout"));
const BoostSuccessPage = lazy(() => import("@/pages/boost-success"));
const BoostFailurePage = lazy(() => import("@/pages/boost-failure"));

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="flex flex-col items-center gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
      <p className="text-gray-600 text-sm">Loading...</p>
    </div>
  </div>
);

// Error boundary component
const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Something went wrong</h2>
      <p className="text-gray-600">{error.message}</p>
      <button 
        onClick={() => window.location.reload()} 
        className="mt-4 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
      >
        Reload page
      </button>
    </div>
  </div>
);

function Router() {
  // Analytics tracking for all route changes
  useAnalytics();
  
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Critical routes - loaded immediately */}
        <Route path="/" component={HomePage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/login" component={AuthPage} />
        <Route path="/register" component={AuthPage} />
        <Route path="/products" component={ProductsPage} />
        
        {/* Lazy loaded routes */}
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/auth-verify" component={AuthVerifyPage} />
        <Route path="/auth/verify" component={AuthVerifyPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/auth-callback" component={AuthCallback} />
        <Route path="/products/:id" component={ProductDetailPage} />
        <Route path="/auction/:id" component={AuctionDetailPage} />
        <Route path="/auctions/:id" component={AuctionDetailPage} />
        <Route path="/sellers/:id" component={SellerProfilePage} />
        <ProtectedRoute path="/profile" component={ProfilePage} />
        <ProtectedRoute path="/messages" component={MessagesPage} />
        <ProtectedRoute path="/seller/dashboard" component={SellerDashboard} />
        <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} />
        <Route path="/terms-of-service" component={TermsOfServicePage} />
        <Route path="/privacy-policy" component={PrivacyPolicyPage} />
        <Route path="/buying-guide" component={BuyingGuidePage} />
        <ProtectedRoute path="/boost-checkout" component={BoostCheckoutPage} />
        <ProtectedRoute path="/boost/success" component={BoostSuccessPage} />
        <ProtectedRoute path="/boost/success/:orderId" component={BoostSuccessPage} />
        <ProtectedRoute path="/boost/failure" component={BoostFailurePage} />
        <ProtectedRoute path="/boost/failure/:reason" component={BoostFailurePage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AnalyticsProvider>
        <AuthProvider>
          <Router />
          <Toaster />
          {process.env.NODE_ENV === 'development' && <AuthDebug />}
        </AuthProvider>
      </AnalyticsProvider>
    </QueryClientProvider>
  );
}

export default App;