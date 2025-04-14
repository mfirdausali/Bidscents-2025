import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import ProductsPage from "@/pages/products-page";
import ProductDetailPage from "@/pages/product-detail-page";
import SellerDashboard from "@/pages/seller-dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import ProfilePage from "@/pages/profile-page";
import SellerProfilePage from "@/pages/seller-profile-page";
import { ProtectedRoute } from "./lib/protected-route";
import { AuthProvider } from "./hooks/use-auth";
import TermsOfServicePage from "./pages/terms-of-service"; // Import the new component

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/products/:id" component={ProductDetailPage} />
      <Route path="/sellers/:id" component={SellerProfilePage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/seller/dashboard" component={SellerDashboard} />
      <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/terms-of-service" component={TermsOfServicePage} /> {/* Added route for Terms of Service */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;