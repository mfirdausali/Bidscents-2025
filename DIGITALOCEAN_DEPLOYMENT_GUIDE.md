# DigitalOcean Deployment Guide for BidScents

## Prerequisites

Before deploying to DigitalOcean, ensure you have:

1. **DigitalOcean Account** with billing enabled
2. **GitHub Repository** connected to DigitalOcean
3. **Supabase Project** with database and storage configured
4. **Billplz Account** with API credentials
5. **Domain Name** (optional but recommended)

## Pre-Deployment Checklist

### 1. Security Fixes (CRITICAL - Must Complete First)

```bash
# Generate secure JWT secrets
openssl rand -base64 64  # For JWT_SECRET
openssl rand -base64 64  # For REFRESH_SECRET

# Update .env with secure values
JWT_SECRET="your-generated-64-char-secret"
REFRESH_SECRET="your-generated-64-char-secret"
JWT_EXPIRES_IN="24h"
```

### 2. Database Preparation

```bash
# 1. Add missing indexes (run locally first)
npm run db:generate-indexes

# 2. Run database migrations
npm run db:push

# 3. Create boost packages
npx tsx scripts/create-boost-packages.js

# 4. Verify database schema
npm run db:check
```

### 3. Build Verification

```bash
# Test production build locally
npm run build

# Test production server
NODE_ENV=production npm start

# Verify health endpoint
curl http://localhost:5000/health
curl http://localhost:5000/ready
```

### 4. Environment Variables

Create a complete `.env.production` file:

```bash
# Core Settings
NODE_ENV=production
PORT=5000

# Database (from Supabase)
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres?sslmode=require

# Supabase
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_KEY=[service-role-key]  # Keep this secret!
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_KEY=[anon-key]  # This is public

# Authentication (use generated secrets)
JWT_SECRET=[64-character-secret]
JWT_EXPIRES_IN=24h
REFRESH_SECRET=[64-character-secret]

# Billplz
BILLPLZ_BASE_URL=https://www.billplz.com/api/v3
BILLPLZ_SECRET_KEY=[your-secret-key]
BILLPLZ_XSIGN_KEY=[your-xsignature-key]
BILLPLZ_COLLECTION_ID=[your-collection-id]

# URLs (update after deployment)
APP_URL=https://bidscents.com
CLIENT_URL=https://bidscents.com
```

## Step-by-Step Deployment

### Step 1: Prepare Repository

```bash
# 1. Commit all changes
git add .
git commit -m "feat: prepare for production deployment"

# 2. Push to main branch
git push origin main

# 3. Create production branch (optional)
git checkout -b production
git push origin production
```

### Step 2: Create DigitalOcean App

#### Option A: Using DigitalOcean Dashboard

1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Choose GitHub as source
4. Select your repository and branch
5. Choose "Singapore (SGP)" region for Malaysian users
6. Review and create

#### Option B: Using doctl CLI

```bash
# Install doctl
brew install doctl  # macOS
# or
snap install doctl  # Ubuntu

# Authenticate
doctl auth init

# Create app
doctl apps create --spec .do/app.yaml
```

### Step 3: Configure Environment Variables

In DigitalOcean App Platform:

1. Go to your app's Settings
2. Click on "App-Level Environment Variables"
3. Add each variable from `.env.production`
4. Mark sensitive values as "Encrypted"
5. Save changes

### Step 4: Configure Build Settings

Update build command in App Platform:

```bash
npm ci --production=false && npm run build && npx tsx scripts/create-boost-packages.js
```

Update run command:

```bash
npm start
```

### Step 5: Set Up Health Checks

In App Platform settings:

- **HTTP Path**: `/health`
- **Initial Delay**: 30 seconds
- **Period**: 10 seconds
- **Timeout**: 5 seconds
- **Success Threshold**: 1
- **Failure Threshold**: 3

### Step 6: Configure Domain

1. Go to Settings → Domains
2. Add your domain
3. Update DNS records:
   ```
   Type: A
   Name: @
   Value: [DigitalOcean provides this]
   ```
4. Enable "Force HTTPS"

### Step 7: Deploy

```bash
# Trigger deployment
git push origin main

# Or manually via dashboard
# Click "Deploy" button
```

### Step 8: Post-Deployment Verification

```bash
# 1. Check application health
curl https://your-app.ondigitalocean.app/health

# 2. Test WebSocket connection
wscat -c wss://your-app.ondigitalocean.app/ws

# 3. Verify boost packages
curl https://your-app.ondigitalocean.app/api/boost/packages

# 4. Test payment webhook (use ngrok for local testing)
curl -X POST https://your-app.ondigitalocean.app/api/payments/billplz/webhook \
  -H "Content-Type: application/json" \
  -d '{"id":"test","paid":"true","paid_at":"2024-01-01 00:00:00"}'
```

## Monitoring Setup

### 1. Enable DigitalOcean Monitoring

```bash
# In App Platform settings
# Enable "Insights" for:
- CPU Usage
- Memory Usage
- HTTP Request Rate
- HTTP Error Rate
```

### 2. Set Up Alerts

Configure alerts for:
- CPU > 80% for 5 minutes
- Memory > 85% for 5 minutes
- HTTP 5xx errors > 10 per minute
- Restart count > 5 in 5 minutes

### 3. External Monitoring

Set up UptimeRobot or similar:
- Monitor: `https://your-domain.com/health`
- Check interval: 5 minutes
- Alert contacts: Email, Slack

## Troubleshooting

### Common Issues

#### 1. Build Failures

```bash
# Check build logs
doctl apps logs [app-id] --type=build

# Common fixes:
- Ensure all dependencies are in package.json
- Check Node.js version compatibility
- Verify build command syntax
```

#### 2. Health Check Failures

```bash
# Check runtime logs
doctl apps logs [app-id] --type=run

# Common fixes:
- Verify PORT environment variable
- Check database connection string
- Ensure Supabase keys are correct
```

#### 3. WebSocket Connection Issues

```bash
# Test WebSocket endpoint
wscat -c wss://your-domain.com/ws

# Common fixes:
- Ensure WebSocket runs on same port
- Check CORS configuration
- Verify JWT authentication
```

#### 4. Payment Webhook Failures

```bash
# Test webhook endpoint
curl -X POST https://your-domain.com/api/payments/billplz/webhook

# Common fixes:
- Verify Billplz keys
- Check webhook URL in Billplz dashboard
- Ensure CSRF exemption for webhooks
```

## Performance Optimization

### 1. Scaling Configuration

```yaml
# Update .do/app.yaml for scaling
instance_count: 2  # Horizontal scaling
instance_size_slug: professional-s  # Vertical scaling
```

### 2. Resource Monitoring

```bash
# Monitor resource usage
doctl apps get-metrics [app-id] --resource=cpu
doctl apps get-metrics [app-id] --resource=memory
```

### 3. Cost Optimization

- Start with `professional-xs` ($12/month)
- Scale up based on metrics
- Use autoscaling for traffic spikes
- Consider static assets CDN

## Maintenance

### Daily Tasks
- Check health endpoint
- Monitor error logs
- Review performance metrics

### Weekly Tasks
- Review security alerts
- Check disk usage
- Analyze slow queries

### Monthly Tasks
- Update dependencies
- Review costs
- Performance analysis
- Security audit

## Rollback Procedure

If deployment fails:

```bash
# 1. View deployment history
doctl apps list-deployments [app-id]

# 2. Rollback to previous deployment
doctl apps create-deployment [app-id] --previous

# 3. Investigate issues
doctl apps logs [app-id] --type=build,run
```

## Security Hardening

### 1. Environment Variables
- Never commit secrets to repository
- Use DigitalOcean's encrypted variables
- Rotate keys regularly

### 2. Network Security
- Enable DigitalOcean firewall
- Restrict database access
- Use HTTPS only

### 3. Application Security
- Keep dependencies updated
- Enable security headers
- Implement rate limiting

## Support Resources

- **DigitalOcean Support**: support.digitalocean.com
- **Community**: digitalocean.com/community
- **Status Page**: status.digitalocean.com
- **Documentation**: docs.digitalocean.com/products/app-platform

## Final Checklist

Before going live:

- [ ] All security vulnerabilities fixed
- [ ] Database indexes created
- [ ] Environment variables configured
- [ ] Health checks passing
- [ ] Domain configured with SSL
- [ ] Monitoring enabled
- [ ] Alerts configured
- [ ] Backup strategy in place
- [ ] Rollback procedure tested
- [ ] Documentation updated

## Estimated Costs

- **App Platform**: $12-50/month (based on size)
- **Database**: Included with Supabase
- **Domain**: $10-15/year
- **Monitoring**: Free tier sufficient
- **Total**: ~$25-65/month

Remember: Start small and scale based on actual usage!