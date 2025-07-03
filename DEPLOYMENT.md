# BidScents Deployment Guide

## Prerequisites

- Node.js 20.x or higher
- PostgreSQL database (via Supabase)
- PM2 (optional, for production process management)

## Environment Setup

1. **Create `.env` file** with all required variables:
```bash
# Database
DATABASE_URL=postgresql://...

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJhbGc...
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_KEY=eyJhbGc...

# Authentication
JWT_SECRET=your-strong-secret-key-here

# Billplz
BILLPLZ_BASE_URL=https://www.billplz.com/api/v3
BILLPLZ_SECRET_KEY=xxx
BILLPLZ_XSIGN_KEY=xxx
BILLPLZ_COLLECTION_ID=xxx

# Application
APP_URL=http://localhost:5000
CLIENT_URL=http://localhost:3000
NODE_ENV=production
```

## Quick Start

### Option 1: Using npm scripts
```bash
# Build the application
npm run build

# Start the production server
npm run start
```

### Option 2: Using the deployment script
```bash
# Make the script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

### Option 3: Using PM2 (Recommended for Production)
```bash
# Install PM2 globally
npm install -g pm2

# Build the application
npm run build

# Start with PM2
npm run start:pm2

# View logs
pm2 logs bidscents

# Stop the application
npm run stop:pm2

# Restart the application
npm run restart:pm2
```

## Initial Setup

After deployment, run these scripts:

```bash
# 1. Create boost packages (REQUIRED)
npx tsx scripts/create-boost-packages.js

# 2. Verify database setup
node scripts/check-admin-user.js admin@example.com
```

## Admin Access Issues

If admin routes are not accessible after deployment:

1. **Clear authentication cache** in the browser:
```javascript
localStorage.removeItem('app_token');
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('sb-') || key.includes('supabase')) {
    localStorage.removeItem(key);
  }
});
location.reload();
```

2. **Verify admin status** in database:
```bash
node scripts/check-admin-user.js your-admin-email@example.com
```

3. **Update admin status** if needed (run in Supabase SQL editor):
```sql
UPDATE users SET is_admin = true WHERE email = 'admin@example.com';
```

## Production Checklist

- [ ] All environment variables set correctly
- [ ] Database migrations applied (`npm run db:push`)
- [ ] Boost packages created
- [ ] Admin user configured
- [ ] SSL/TLS configured (for production domains)
- [ ] Billplz webhook URL configured
- [ ] Redis configured (optional, for better performance)

## Monitoring

### Health Check
```bash
curl http://localhost:5000/api/health
```

### Logs
- PM2 logs: `pm2 logs bidscents`
- Manual logs: Check `logs/` directory
- Server logs: `logs/out.log`
- Error logs: `logs/error.log`

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>
```

### Missing Supabase Credentials
Ensure `.env` file exists and contains all required Supabase variables.

### Admin Routes Returning 403
1. Check if user has `isAdmin: true` in database
2. Clear browser cache and re-login
3. Use the Admin Status Debug component (dev mode)

### WebSocket Connection Issues
- Ensure `/ws` path is properly proxied in production
- Check firewall rules for WebSocket connections
- Verify JWT_SECRET is the same across all instances

## Security Notes

- Never commit `.env` file to version control
- Use strong JWT_SECRET in production
- Enable HTTPS in production environments
- Regularly update dependencies
- Monitor failed login attempts via security dashboard