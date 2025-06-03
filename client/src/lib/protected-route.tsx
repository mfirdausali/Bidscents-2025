import { useAuth } from "@/hooks/use-supabase-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  if (path.includes("seller") && !user.isSeller) {
    return (
      <Route path={path}>
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <h1 className="font-playfair text-2xl mb-4">Seller Account Required</h1>
          <p className="text-gray-600 mb-6">You need a seller account to access this page.</p>
          <Redirect to="/" />
        </div>
      </Route>
    );
  }
  
  if (path.includes("admin") && !user.isAdmin) {
    return (
      <Route path={path}>
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <h1 className="font-playfair text-2xl mb-4">Admin Access Required</h1>
          <p className="text-gray-600 mb-6">You need administrator privileges to access this page.</p>
          <Redirect to="/" />
        </div>
      </Route>
    );
  }

  return <Route path={path} component={Component} />;
}
