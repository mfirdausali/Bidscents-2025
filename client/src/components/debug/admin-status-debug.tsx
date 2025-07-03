import { useAuth } from "@/hooks/use-supabase-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function AdminStatusDebug() {
  const { user, isLoading, refetchUser } = useAuth();
  const { toast } = useToast();

  const handleRefreshAuth = async () => {
    try {
      // Clear local storage
      localStorage.removeItem('app_token');
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });
      
      // Clear query cache
      queryClient.clear();
      
      toast({
        title: "Cache Cleared",
        description: "Please log in again to refresh your authentication.",
      });
      
      // Reload page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear authentication cache.",
        variant: "destructive",
      });
    }
  };

  const handleForceRefetch = async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/v1/auth/me"] });
      toast({
        title: "Refetching User Data",
        description: "User data is being refreshed...",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refetch user data.",
        variant: "destructive",
      });
    }
  };

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <Card className="fixed bottom-4 right-4 w-96 z-50 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4" />
          Admin Status Debug
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Loading:</span>
            <span className={isLoading ? "text-yellow-600" : "text-green-600"}>
              {isLoading ? "Yes" : "No"}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">User ID:</span>
            <span className="font-mono">{user?.id || "N/A"}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email:</span>
            <span className="font-mono text-xs">{user?.email || "N/A"}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Is Admin:</span>
            <span className="flex items-center gap-1">
              {user?.isAdmin ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-green-600 font-semibold">Yes</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-red-600 font-semibold">No</span>
                </>
              )}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Is Seller:</span>
            <span className={user?.isSeller ? "text-green-600" : "text-gray-600"}>
              {user?.isSeller ? "Yes" : "No"}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">App Token:</span>
            <span className="font-mono text-xs">
              {localStorage.getItem('app_token') ? 
                `...${localStorage.getItem('app_token')?.slice(-8)}` : 
                "N/A"}
            </span>
          </div>
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleForceRefetch}
            className="flex-1"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refetch
          </Button>
          <Button 
            size="sm" 
            variant="destructive" 
            onClick={handleRefreshAuth}
            className="flex-1"
          >
            Clear & Reload
          </Button>
        </div>
        
        <div className="text-xs text-muted-foreground pt-2 border-t">
          <p>If isAdmin shows "No" but you have admin access:</p>
          <ol className="list-decimal list-inside space-y-1 mt-1">
            <li>Click "Clear & Reload"</li>
            <li>Log in again</li>
            <li>Check if isAdmin is now "Yes"</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}