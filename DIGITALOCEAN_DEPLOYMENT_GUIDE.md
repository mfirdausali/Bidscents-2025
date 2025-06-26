# BidScents Marketplace - DigitalOcean Production Deployment Guide

This comprehensive guide will help you deploy your BidScents marketplace to DigitalOcean App Platform with proper production configurations.

## 📋 Prerequisites

1. **DigitalOcean Account** with billing set up
2. **GitHub Repository** with your code
3. **Domain Name** (optional but recommended)
4. **Production Billplz Account** with valid credentials
5. **Strong Security Keys** for production

## 🔧 Pre-Deployment Setup

### 1. Prepare Your Repository

```bash
# Ensure all changes are committed
git add .
git commit -m "feat: prepare for production deployment"
git push origin main

# Tag the release (optional but recommended)
git tag -a v1.0.0 -m "Production release v1.0.0"
git push origin v1.0.0
```

### 2. Generate Strong Security Keys

Generate strong, unique keys for production:

```bash
# Generate JWT secret (32+ characters)
openssl rand -base64 32

# Generate encryption key (32+ characters)  
openssl rand -base64 32
```

### 3. Configure Production Billplz

1. **Sign up for Billplz Production Account**:
   - Go to https://www.billplz.com
   - Complete business verification
   - Get production API credentials

2. **Create Production Collection**:
   - Log into Billplz dashboard
   - Create a new collection for "BidScents Marketplace"
   - Note the Collection ID

3. **Get API Keys**:
   - Copy Secret Key
   - Copy X-Signature Key
   - Copy Collection ID

## 🚀 Deployment Options

### Option A: DigitalOcean App Platform (Recommended)

#### Step 1: Create App via GitHub Integration

1. **Login to DigitalOcean**:
   - Go to https://cloud.digitalocean.com
   - Navigate to "Apps" → "Create App"

2. **Connect GitHub Repository**:
   - Choose "GitHub" as source
   - Authorize DigitalOcean to access your repos
   - Select your BidScents repository
   - Choose `main` branch
   - Set auto-deploy on push: **Enabled**

3. **Configure Build Settings**:
   ```yaml
   Build Command: npm run build
   Run Command: npm start
   Environment: Node.js 18
   Instance Size: Basic ($5/month to start)
   Region: Singapore (SGP1) or closest to your users
   ```

#### Step 2: Set Environment Variables

In the DigitalOcean dashboard, add these environment variables:

**Database & Authentication:**
```bash
NODE_ENV=production
SUPABASE_URL=https://rjazuitnzsximznfcbfw.supabase.co/
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_URL=https://rjazuitnzsximznfcbfw.supabase.co/
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Security (Mark as SECRET):**
```bash
JWT_SECRET=your-generated-jwt-secret-here
MESSAGE_ENCRYPTION_KEY=your-generated-encryption-key-here
```

**Billplz Production:**
```bash
BILLPLZ_BASE_URL=https://www.billplz.com/api
BILLPLZ_SECRET_KEY=your-production-billplz-secret  # Mark as SECRET
BILLPLZ_XSIGN_KEY=your-production-billplz-xsign   # Mark as SECRET
BILLPLZ_COLLECTION_ID=your-production-collection-id
```

**Application Settings:**
```bash
PORT=5000
DEMO_MODE=false
APP_URL=https://your-app-name.ondigitalocean.app
CLIENT_URL=https://your-app-name.ondigitalocean.app
JWT_EXPIRES_IN=24h
```

#### Step 3: Configure Domain (Optional)

1. **Add Custom Domain**:
   - In DigitalOcean App settings
   - Go to "Domains" tab
   - Add your domain (e.g., `bidscents.com`)
   - Update DNS records as instructed

2. **Update Environment Variables**:
   ```bash
   APP_URL=https://yourdomain.com
   CLIENT_URL=https://yourdomain.com
   ```

#### Step 4: Deploy and Monitor

1. **Trigger Deployment**:
   - Click "Deploy" or push to your main branch
   - Monitor build logs for any errors
   - Deployment typically takes 5-10 minutes

2. **Verify Health**:
   ```bash
   curl https://your-app-url.com/api/health
   ```

### Option B: DigitalOcean Droplet with Docker

#### Step 1: Create Droplet

1. **Create Ubuntu Droplet**:
   - Size: 2 GB RAM minimum ($12/month)
   - Region: Singapore or closest to users
   - Enable monitoring and backups

2. **Install Docker**:
   ```bash
   sudo apt update
   sudo apt install docker.io docker-compose
   sudo systemctl start docker
   sudo systemctl enable docker
   sudo usermod -aG docker $USER
   ```

#### Step 2: Deploy with Docker

1. **Clone Repository**:
   ```bash
   git clone https://github.com/your-username/bidscents-marketplace.git
   cd bidscents-marketplace
   ```

2. **Configure Environment**:
   ```bash
   cp .env.production .env
   # Edit .env with your production values
   nano .env
   ```

3. **Build and Deploy**:
   ```bash
   docker-compose up -d
   ```

4. **Set up Nginx Reverse Proxy** (recommended):
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       
       location / {
           proxy_pass http://localhost:5000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

## 🔒 Production Security Checklist

### Essential Security Steps:

1. **✅ Strong Secrets**:
   - JWT_SECRET: 32+ random characters
   - MESSAGE_ENCRYPTION_KEY: 32+ random characters
   - Never use development keys in production

2. **✅ Environment Variables**:
   - Mark sensitive keys as "SECRET" in DigitalOcean
   - Never commit .env files to repository
   - Use different keys for each environment

3. **✅ HTTPS Configuration**:
   - Enable SSL/TLS (automatic with App Platform)
   - Update CSP headers for production domain
   - Verify HSTS is enabled

4. **✅ Database Security**:
   - Supabase handles this automatically
   - Enable Row Level Security (RLS) policies
   - Regular backups (Supabase handles this)

5. **✅ Rate Limiting**:
   - Already configured in code
   - Monitor for abuse
   - Consider additional DDoS protection

## 🏃‍♂️ Post-Deployment Steps

### 1. Initialize Production Data

```bash
# Create boost packages in production database
# Run this once after deployment
node scripts/create-boost-packages.js
```

### 2. Test Critical Functionality

**Test Billplz Integration**:
```bash
curl https://yourdomain.com/api/boost/packages
```

**Test Featured Products**:
```bash
curl https://yourdomain.com/api/products/featured
```

**Test Health Endpoint**:
```bash
curl https://yourdomain.com/api/health
```

### 3. Configure Monitoring

1. **DigitalOcean Monitoring**:
   - Enable alerts for CPU/Memory usage
   - Set up uptime monitoring
   - Configure log forwarding

2. **Application Monitoring**:
   ```bash
   # Check application logs
   doctl apps logs your-app-id --follow
   ```

### 4. Update Billplz Webhook URLs

In your Billplz production dashboard:
- **Callback URL**: `https://yourdomain.com/api/payments/billplz/webhook`
- **Redirect URL**: `https://yourdomain.com/boost/payment-result`

## 🐛 Troubleshooting

### Common Issues:

1. **Build Failures**:
   ```bash
   # Check if all dependencies are in package.json
   npm run build
   
   # Verify Node.js version compatibility
   node --version
   ```

2. **Environment Variable Issues**:
   ```bash
   # Test locally with production env
   NODE_ENV=production npm start
   
   # Check variable loading
   curl https://yourdomain.com/api/health
   ```

3. **Database Connection Issues**:
   - Verify Supabase URL and keys
   - Check security policies
   - Test database connectivity

4. **Payment Issues**:
   - Verify Billplz production credentials
   - Check webhook URLs are accessible
   - Test with small amounts first

### Monitoring and Logs:

```bash
# View application logs
doctl apps logs your-app-id --type=deploy
doctl apps logs your-app-id --type=run

# Monitor resource usage
doctl monitoring alert list
```

## 📊 Performance Optimization

### 1. Caching Strategy
- Enable CDN for static assets
- Implement Redis for session storage (optional)
- Use Supabase built-in caching

### 2. Scaling Options
- **Vertical Scaling**: Increase instance size
- **Horizontal Scaling**: Add more instances (Pro plan)
- **Database Scaling**: Supabase handles automatically

### 3. Cost Optimization
- Start with Basic plan ($5/month)
- Monitor usage and scale as needed
- Use DigitalOcean's cost alerts

## 🔄 CI/CD Pipeline

Set up automatic deployments:

```yaml
# .github/workflows/deploy.yml
name: Deploy to DigitalOcean
on:
  push:
    branches: [main]
    
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to DigitalOcean
        uses: digitalocean/app_action@main
        with:
          app_name: bidscents-marketplace
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}
```

## 🚨 Emergency Procedures

### Rollback Deployment:
```bash
# Via DigitalOcean dashboard
1. Go to Apps → Your App
2. Click "Deployments" tab
3. Select previous working deployment
4. Click "Redeploy"
```

### Database Backup:
```bash
# Supabase provides automatic backups
# For manual backup, use Supabase dashboard
```

## 📞 Support and Maintenance

### Regular Maintenance:
- **Weekly**: Check logs and performance metrics
- **Monthly**: Review security updates and dependencies
- **Quarterly**: Review costs and optimization opportunities

### Getting Help:
- **DigitalOcean Support**: Available 24/7 with paid plans
- **Community**: DigitalOcean Community forums
- **Documentation**: https://docs.digitalocean.com/products/app-platform/

---

## 🎉 Congratulations!

Your BidScents marketplace is now running in production on DigitalOcean! 

**Next Steps**:
1. Test all functionality thoroughly
2. Set up monitoring and alerts
3. Configure backup strategies
4. Plan for scaling as your user base grows

**Production URL**: `https://your-app-name.ondigitalocean.app`
**Health Check**: `https://your-app-name.ondigitalocean.app/api/health`

Your marketplace is now ready to handle real users and payments! 🚀