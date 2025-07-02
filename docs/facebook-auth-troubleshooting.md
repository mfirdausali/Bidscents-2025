# Facebook Authentication Troubleshooting Guide

## Issue: "No authentication data found in the URL"

This error occurs when the OAuth callback page doesn't receive the expected authentication tokens from Facebook/Supabase.

## Quick Fixes

### 1. Check Supabase Dashboard Configuration

1. Go to your Supabase Dashboard → Authentication → Providers
2. Ensure Facebook is enabled
3. Verify your Facebook App ID and App Secret are correct
4. Check the redirect URL is set to: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`

### 2. Verify Facebook App Settings

1. Go to Facebook Developers → Your App → Facebook Login → Settings
2. Add these Valid OAuth Redirect URIs:
   ```
   https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback
   http://localhost:3000/auth-callback
   https://your-production-domain.com/auth-callback
   ```
3. Save changes

### 3. Clear Browser Data

1. Clear cookies and local storage for your domain
2. Try in an incognito/private browser window
3. Disable browser extensions that might interfere

### 4. Use the Debug Tool

In development, navigate to: `http://localhost:3000/debug/facebook-auth`

This tool will:
- Check your Supabase configuration
- Test the Facebook login flow
- Display detailed auth status
- Show any errors in the process

## Common Causes and Solutions

### Cause 1: Redirect URL Mismatch

**Symptoms:**
- Facebook redirects to Supabase, but tokens are lost
- URL shows error parameters

**Solution:**
- Ensure redirect URLs match EXACTLY (including trailing slashes)
- Use HTTPS in production
- Check for URL encoding issues

### Cause 2: Browser Security Features

**Symptoms:**
- Works in some browsers but not others
- Hash fragment is missing from URL

**Solution:**
- Disable strict tracking protection temporarily
- Allow third-party cookies for Supabase domain
- Check if browser extensions are blocking

### Cause 3: Supabase Session Already Exists

**Symptoms:**
- No tokens in URL but user seems authenticated
- Inconsistent behavior

**Solution:**
- The updated auth-callback.tsx now checks for existing sessions
- It will use the session if available instead of requiring URL tokens

### Cause 4: Facebook Permission Issues

**Symptoms:**
- Authentication succeeds but email is missing
- User data is incomplete

**Solution:**
- Ensure email permission is requested
- Use `auth_type: 'rerequest'` to force permission dialog
- Check if user's Facebook account has verified email

## Enhanced Error Messages

The auth callback now provides specific error messages:

- **"You cancelled the Facebook login"** - User clicked cancel
- **"Email permission is required"** - User denied email access
- **"Authentication requires HTTPS"** - Using HTTP in production
- **"Configuration issue"** - General setup problem

## Testing Checklist

1. **Environment Variables**
   ```bash
   VITE_SUPABASE_URL=https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...
   ```

2. **Facebook App Status**
   - App is in "Live" mode (not development)
   - Email permission is configured
   - Test users are added (for development)

3. **Browser Console**
   - Check for detailed error logs
   - Look for redirect issues
   - Verify token presence

4. **Network Tab**
   - Monitor OAuth redirects
   - Check for failed requests
   - Verify callback URL structure

## Alternative Solutions

### 1. Manual Session Recovery

If tokens are lost but session exists in Supabase:
```javascript
// The auth-callback now automatically attempts this
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  // Process existing session
}
```

### 2. Force Re-authentication

Clear all auth data and try again:
```javascript
await supabase.auth.signOut();
localStorage.clear();
// Then retry Facebook login
```

### 3. Use Popup Mode

Configure Facebook login to use popup instead of redirect:
```javascript
queryParams: {
  display: 'popup'
}
```

## Still Having Issues?

1. Enable Supabase auth debug mode (already enabled in development)
2. Check Supabase Auth logs in dashboard
3. Test with a fresh Facebook test account
4. Verify your domain is properly configured in both Facebook and Supabase

## Contact Support

If the issue persists:
1. Collect debug information from `/debug/facebook-auth`
2. Check browser console for errors
3. Note the exact redirect URL being used
4. Contact support with this information