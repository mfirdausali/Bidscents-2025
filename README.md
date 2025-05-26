# BidScents - Luxury Perfume Marketplace

A sophisticated secondhand luxury perfume marketplace built with React, TypeScript, and Supabase.

## 🚀 Running on Localhost

### Prerequisites

1. **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
2. **Git** - [Download here](https://git-scm.com/)
3. **Supabase Account** - [Sign up here](https://supabase.com/)
4. **Billplz Account** (for payments) - [Sign up here](https://www.billplz.com/)

### Step 1: Clone & Install

```bash
# Clone the repository
git clone <your-repo-url>
cd perfume-marketplace

# Install dependencies
npm install
```

### Step 2: Environment Setup

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="your-postgresql-connection-string"
SUPABASE_URL="your-supabase-project-url"
SUPABASE_KEY="your-supabase-anon-key"
VITE_SUPABASE_URL="your-supabase-project-url"

# Payment Gateway (Billplz)
BILLPLZ_BASE_URL="https://www.billplz-sandbox.com/api"
BILLPLZ_SECRET_KEY="your-billplz-secret-key"
BILLPLZ_XSIGN_KEY="your-billplz-xsign-key"
BILLPLZ_COLLECTION_ID="your-billplz-collection-id"

# Application
APP_URL="http://localhost:5000"
NODE_ENV="development"

# Object Storage
REPLIT_OBJECT_STORAGE_BUCKET_ID="your-storage-bucket-id"
```

### Step 3: Database Setup

#### Option A: Using Supabase (Recommended)

1. Create a new project on [Supabase](https://supabase.com/)
2. Get your project URL and anon key from Settings > API
3. Add them to your `.env` file
4. Run database migrations:

```bash
npm run db:push
```

#### Option B: Local PostgreSQL

1. Install PostgreSQL locally
2. Create a new database
3. Update `DATABASE_URL` in `.env`
4. Run migrations:

```bash
npm run db:push
```

### Step 4: Initialize Boost Packages

The application includes a boost system for sellers to feature their products. Run this script to set up the boost packages:

```bash
npx tsx scripts/create-boost-packages.js
```

This creates:
- Standard Boost: 15 hours duration
- Premium Boost: 36 hours duration

### Step 5: Payment Setup (Billplz)

1. Sign up for [Billplz](https://www.billplz.com/)
2. Get your API credentials from the dashboard
3. Create a collection for your marketplace
4. Add credentials to `.env` file

### Step 6: Start Development Server

```bash
npm run dev
```

The application will start on `http://localhost:5000`

## 🏗️ Project Structure

```
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Route components
│   │   └── lib/          # Utilities and hooks
├── server/               # Express.js backend
│   ├── routes.ts         # API endpoints
│   ├── auth.ts           # Authentication logic
│   └── supabase.ts       # Database client
├── shared/               # Shared types and schemas
│   └── schema.ts         # Database schema definitions
└── scripts/              # Database and setup scripts
```

## 🔧 Key Features

- **User Authentication** - Supabase Auth with email verification
- **Product Management** - CRUD operations for perfume listings
- **Auction System** - Real-time bidding with WebSocket
- **Boost System** - Product promotion packages
- **Payment Processing** - Billplz integration
- **Real-time Messaging** - Encrypted chat between users
- **Image Storage** - Object storage for product images

## 🛠️ Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Push schema changes to database
- `npm run check` - Type checking

## 🐛 Troubleshooting

### Database Connection Issues
- Verify your `DATABASE_URL` is correct
- Check if PostgreSQL is running
- Ensure Supabase project is active

### Authentication Problems
- Verify Supabase URL and keys
- Check email verification settings
- Ensure redirect URLs are configured

### Payment Issues
- Verify Billplz credentials
- Check collection ID exists
- Ensure webhook URLs are configured

### Port Already in Use
```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <process-id>
```

## 📱 Frontend Routes

- `/` - Homepage with featured products
- `/products` - Product listings
- `/auth/login` - User login
- `/auth/register` - User registration
- `/seller-dashboard` - Seller management panel
- `/boost-checkout` - Boost package purchase
- `/auctions` - Live auction listings
- `/messages` - User messaging

## 🔒 Security Features

- Email verification for new users
- Encrypted messaging system
- Secure payment processing
- Input validation and sanitization
- CSRF protection
- Rate limiting on API endpoints

## 🚀 Deployment

The application is designed to work with:
- Replit Deployments
- Vercel
- Railway
- Any Node.js hosting platform

Make sure to set all environment variables in your hosting platform.