#!/usr/bin/env node

/**
 * Script to refresh authentication for admin users
 * This helps when isAdmin field is not being properly loaded
 */

console.log(`
========================================
Authentication Refresh Script
========================================

This script will help you refresh your authentication to ensure
the isAdmin field is properly loaded.

Instructions:
1. Open your browser's Developer Console (F12)
2. Navigate to the Application/Storage tab
3. Find and clear the following:
   - Local Storage: app_token
   - Any Supabase auth tokens
4. Or run this in the console:

localStorage.removeItem('app_token');
localStorage.removeItem('supabase.auth.token');
// Clear all Supabase keys
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('sb-') || key.includes('supabase')) {
    localStorage.removeItem(key);
  }
});
// Clear React Query cache
if (window.queryClient) {
  window.queryClient.clear();
}
location.reload();

5. After clearing, log in again with your admin account
6. The isAdmin field should now be properly loaded

Alternative method using cURL:
==============================
If you have your Supabase token, you can test the session endpoint:

curl -X POST http://localhost:5000/api/v1/auth/session \\
  -H "Content-Type: application/json" \\
  -d '{"supabaseToken": "YOUR_SUPABASE_TOKEN"}'

This should return a response with isAdmin: true for admin users.
`);