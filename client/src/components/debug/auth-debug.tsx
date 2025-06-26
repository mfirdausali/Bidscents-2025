import { useAuth } from '@/hooks/use-supabase-auth';
import { useEffect } from 'react';

export function AuthDebug() {
  const { user, isLoading, error } = useAuth();

  useEffect(() => {
    const token = localStorage.getItem('app_token');
    console.log('🐛 [AuthDebug] Current state:', {
      user: user ? {
        id: user.id,
        email: user.email,
        username: user.username,
        isSeller: user.isSeller
      } : null,
      isLoading,
      error: error?.message,
      hasToken: !!token,
      tokenValue: token
    });
  }, [user, isLoading, error]);

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-4 rounded-lg text-xs font-mono max-w-sm">
      <div className="font-bold mb-2">Auth Debug:</div>
      <div>Loading: {isLoading ? 'YES' : 'NO'}</div>
      <div>User: {user ? `${user.username} (${user.id})` : 'NULL'}</div>
      <div>Token: {localStorage.getItem('app_token') ? 'EXISTS' : 'NONE'}</div>
      {error && <div className="text-red-400">Error: {error.message}</div>}
    </div>
  );
}