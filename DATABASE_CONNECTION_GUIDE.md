# Database Connection Guide

## Overview
This guide explains the database connection architecture and how to prevent connection issues.

## Current Architecture

### 1. Primary Database: Supabase
- **Used for**: All application data operations
- **Connection**: Via Supabase client library
- **Configuration**: `SUPABASE_URL` and `SUPABASE_KEY` in `.env`

### 2. Legacy PostgreSQL (Deprecated)
- **Used for**: Session storage only (connect-pg-simple)
- **Connection**: Direct PostgreSQL via `pg` Pool
- **Configuration**: `DATABASE_URL` in `.env` (often missing or misconfigured)

## Known Issues and Solutions

### Issue: "role 'username' does not exist"
**Cause**: The PostgreSQL Pool is trying to connect with system username when DATABASE_URL is not set.

**Solutions**:
1. **Recommended**: Use Supabase-based implementations (e.g., `boost-supabase.ts`)
2. **Alternative**: Set proper DATABASE_URL if PostgreSQL is needed:
   ```
   DATABASE_URL=postgresql://user:password@host:port/database
   ```
3. **Development**: Use `DEMO_MODE=true` to skip database connections

### Issue: WebSocket Connection Failed
**Cause**: Vite HMR WebSocket conflicts with application WebSocket.

**Solution**: Configure Vite HMR to use a different port (see `vite.config.ts`)

## Best Practices

1. **Always use Supabase for new features**
   ```typescript
   import { supabase } from './supabase';
   // Use supabase.from('table_name')...
   ```

2. **Avoid db.transaction**
   - Don't use `db.transaction` from `./db`
   - Use Supabase's built-in transaction support or implement optimistic locking

3. **Environment Variables**
   Required for production:
   ```
   SUPABASE_URL=your-supabase-url
   SUPABASE_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

4. **Testing Database Connections**
   ```bash
   # Check Supabase connection
   node -e "require('./server/supabase').testSupabaseConnection()"
   ```

## Migration Path

To fully migrate away from PostgreSQL:
1. Replace session storage with Supabase-based sessions
2. Remove `db.ts` and all PostgreSQL dependencies
3. Update all imports from `./storage` to use Supabase directly

## Troubleshooting

### Server won't start
1. Check if DATABASE_URL is set (or use DEMO_MODE=true)
2. Verify Supabase credentials are correct
3. Check server logs for specific error messages

### Boost operations fail
1. Ensure using `boost-supabase.ts` instead of `boost-transactions.ts`
2. Check that all products exist and belong to the user
3. Verify payment webhook configuration

### WebSocket issues
1. Application WebSocket should connect to `/ws`
2. Vite HMR WebSocket uses port 3001
3. Check browser console for connection details