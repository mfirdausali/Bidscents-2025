# BidScents Authentication System Documentation

## Overview

BidScents uses a hybrid authentication architecture with Supabase as the primary identity provider and a local user profile system for application-specific data. This design provides secure authentication while maintaining full control over user profiles and business logic.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend        │    │   Supabase      │
│   (React)       │    │   (Express)      │    │   Database      │
├─────────────────┤    ├──────────────────┤    ├─────────────────┤
│ • Auth Forms    │◄──►│ • Session API    │◄──►│ • auth.users    │
│ • JWT Storage   │    │ • JWT Validation │    │ • public.users  │
│ • Recovery UI   │    │ • Recovery Logic │    │ • RLS Policies  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Core Components

### 1. Supabase Authentication (`auth.users`)
- **Purpose**: Primary identity provider for secure authentication
- **Storage**: User credentials, email verification, authentication metadata
- **Features**: Email/password auth, social login, email verification, password reset
- **Access**: Managed entirely by Supabase Auth service

### 2. Local User Profiles (`public.users`)
- **Purpose**: Application-specific user data and business logic
- **Storage**: Username, profile info, wallet balance, seller status, preferences
- **Features**: Custom fields, business logic, relationships with other entities
- **Access**: Full control via application backend

### 3. Provider Mapping
- **provider_id**: Links `public.users` to `auth.users` via Supabase user UUID
- **provider**: Authentication method used ('supabase', 'facebook', etc.)

## Authentication Flow

### 1. User Registration

#### Frontend Process
```typescript
// User submits registration form
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'securepassword',
  options: {
    data: {
      firstName: 'John',
      lastName: 'Doe'
    }
  }
});
```

#### What Happens:
1. **Supabase Creates Identity**: New record in `auth.users` with UUID
2. **Email Verification**: Supabase sends verification email
3. **Pending State**: User exists in `auth.users` but not in `public.users`
4. **Email Click**: User clicks verification link → triggers auth state change

### 2. Email Verification & Profile Creation

#### Frontend Auth State Listener
```typescript
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    // Exchange Supabase JWT for application JWT
    const response = await apiRequest("POST", "/api/v1/auth/session", {
      supabaseToken: session.access_token
    });
  }
});
```

#### Backend Session Creation (`/api/v1/auth/session`)
```typescript
// 1. Verify Supabase JWT
const { data: { user } } = await supabase.auth.getUser(supabaseToken);

// 2. Find or create local user profile
let localUser = await storage.getUserByEmail(user.email);

if (!localUser) {
  // 3. Create missing profile with robust error handling
  localUser = await storage.createUser({
    email: user.email,
    username: generateUniqueUsername(user.email),
    firstName: user.user_metadata?.firstName,
    lastName: user.user_metadata?.lastName,
    providerId: user.id,
    provider: 'supabase',
    isVerified: !!user.email_confirmed_at
  });
}

// 4. Generate application JWT
const appToken = generateAppJWT(localUser.id, localUser.email, user.id);
```

### 3. User Sign In

#### Frontend Process
```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
});
// Triggers same auth state change → session creation flow
```

#### Backend Validation
- Supabase validates credentials
- Session creation endpoint creates/links local profile
- Application JWT issued for API access

## Error Handling & Recovery

### Profile Creation Failures

#### Common Scenarios
1. **Network Interruption**: Email verified but session creation fails
2. **Database Errors**: Supabase auth succeeds but local profile creation fails
3. **Concurrent Registration**: Username conflicts during profile creation

#### Recovery Mechanism (`/api/v1/auth/recover-profile`)
```typescript
// Automatic recovery triggered on profile creation failure
if (errorData.code === 'PROFILE_CREATION_FAILED') {
  const recoveryResponse = await apiRequest("POST", "/api/v1/auth/recover-profile", {
    supabaseToken: session.access_token
  });
  
  if (recoveryResponse.ok) {
    // Profile recovered successfully
    showSuccessMessage("Account recovered");
  } else {
    // Manual intervention required
    showErrorMessage("Please contact support");
  }
}
```

### Orphaned User Detection
- **Definition**: Users in `auth.users` without corresponding `public.users` record
- **Detection**: Regular integrity checks via admin endpoints
- **Resolution**: Automatic profile creation with legacy provider ID mapping

## JWT Token Management

### Supabase JWT
- **Purpose**: Verify user identity with Supabase
- **Lifetime**: Short-lived (1 hour), auto-refreshed
- **Storage**: Handled by Supabase client
- **Scope**: Identity verification only

### Application JWT
- **Purpose**: API access and authorization
- **Lifetime**: Configurable (default: 24 hours)
- **Storage**: Browser localStorage as 'app_token'
- **Scope**: Full application access

### Token Exchange Process
```typescript
// 1. User authenticates with Supabase
// 2. Supabase JWT obtained
// 3. Backend verifies Supabase JWT
// 4. Backend issues application JWT
// 5. Application JWT used for all API calls
```

## Security Measures

### 1. Provider ID Validation
- Every `public.users` record must have valid `provider_id`
- Links verified against Supabase auth records
- Prevents account hijacking and orphaned profiles

### 2. JWT Validation
```typescript
// Middleware validates every API request
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  try {
    const decoded = verifyAppJWT(token);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

### 3. Row Level Security (RLS)
- Supabase RLS policies protect `public.users` table
- Users can only access their own records
- Admin endpoints require explicit admin role verification

## Database Schema

### auth.users (Supabase Managed)
```sql
-- Managed by Supabase Auth
{
  id: UUID (Primary Key),
  email: VARCHAR,
  encrypted_password: VARCHAR,
  email_confirmed_at: TIMESTAMP,
  user_metadata: JSONB,
  -- ... other Supabase fields
}
```

### public.users (Application Managed)
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR NOT NULL UNIQUE,
  username VARCHAR NOT NULL UNIQUE,
  first_name VARCHAR,
  last_name VARCHAR,
  wallet_balance DECIMAL DEFAULT 0,
  is_seller BOOLEAN DEFAULT true,
  is_admin BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  provider_id VARCHAR,        -- Links to auth.users.id
  provider VARCHAR,           -- 'supabase', 'facebook', etc.
  -- ... other business fields
);

-- Critical indexes for performance
CREATE INDEX idx_users_provider_id ON users(provider_id);
CREATE INDEX idx_users_email ON users(email);
```

## API Endpoints

### Authentication Endpoints
- `POST /api/v1/auth/session` - Create session and local profile
- `POST /api/v1/auth/recover-profile` - Recover orphaned user profiles
- `GET /api/v1/auth/me` - Get current user profile
- `POST /api/v1/auth/logout` - Client-side logout

### Admin Endpoints (Require Admin Role)
- `GET /api/v1/auth/check-orphaned` - Count orphaned users
- `POST /api/v1/auth/repair-orphaned` - Fix orphaned user profiles

## Frontend Components

### Auth Hook (`useAuth`)
```typescript
// Centralized authentication state management
const { user, signUpMutation, signInMutation, isLoading } = useAuth();

// Automatic token management
useEffect(() => {
  const token = localStorage.getItem('app_token');
  if (token) {
    setAuthToken(token);
  }
}, []);
```

### Recovery UI
- Automatic error detection and recovery attempts
- User-friendly error messages with clear next steps
- Fallback to manual recovery flow when automatic recovery fails

## Troubleshooting

### Common Issues

#### "Invalid or expired token"
- **Cause**: Application JWT expired or invalid
- **Solution**: Automatic token refresh or re-authentication

#### "Profile creation failed"
- **Cause**: Database error during profile creation
- **Solution**: Automatic recovery attempt, manual profile creation

#### "User not found"
- **Cause**: Orphaned user (auth.users exists, public.users missing)
- **Solution**: Recovery endpoint creates missing profile

### Debugging Tools

#### Server Logs
```bash
# Authentication flow logging
🔄 Backend: Starting session creation
✅ Backend: Supabase user verified
🔄 Backend: Creating new local user
✅ Backend: Session created successfully
```

#### Frontend Console
```javascript
// Auth state changes
console.log('Supabase auth state changed:', event);
console.log('Token exchange successful');
console.log('Profile recovery attempted');
```

## Configuration

### Environment Variables
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT Configuration
JWT_SECRET=your-jwt-secret
JWT_EXPIRY=24h

# Application URLs
APP_URL=https://your-app.com
```

### Frontend Configuration
```typescript
// Supabase client setup
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

## Security Best Practices

### 1. Token Management
- Never store sensitive tokens in localStorage in production
- Use httpOnly cookies for sensitive data
- Implement token rotation and revocation

### 2. Profile Validation
- Always validate provider_id against Supabase auth
- Implement rate limiting on authentication endpoints
- Monitor for suspicious authentication patterns

### 3. Error Handling
- Never expose internal errors to frontend
- Log all authentication failures for monitoring
- Implement progressive fallbacks for failed operations

## Monitoring & Analytics

### Key Metrics
- Authentication success/failure rates
- Profile creation success rates
- Token exchange failures
- Recovery attempt frequency

### Health Checks
- Regular orphaned user detection
- Database integrity verification
- JWT validation endpoint testing

This authentication system provides a robust, secure, and user-friendly experience while maintaining the flexibility needed for business requirements. The recovery mechanisms ensure that users can always access their accounts even if technical issues occur during registration or authentication.