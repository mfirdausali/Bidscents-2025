# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with the BidScents marketplace codebase.

## Project Overview

BidScents is a luxury secondhand perfume marketplace with real-time auctions, encrypted messaging, and secure payment processing. Built with modern web technologies for performance, security, and scalability.

### Technology Stack
- **Frontend**: React 18.3.1 + TypeScript 5.6.3 + Vite 5.4.14 + TanStack Query 5.60.5 + Tailwind CSS 3.4.14
- **Backend**: Express.js + TypeScript + Node.js
- **Database**: PostgreSQL via Supabase + Drizzle ORM
- **Real-time**: WebSocket (ws library) for auctions and messaging
- **Authentication**: Dual JWT system (Supabase Auth + Application JWT)
- **Payments**: Billplz (Malaysian payment gateway) - NO Stripe integration
- **File Storage**: Supabase Storage (migrated from object storage)
- **UI Components**: Shadcn/ui with Radix UI primitives

## Essential Commands

```bash
# Development
npm run dev              # Start dev server on localhost:3000 (WebSocket on same server at /ws)
npm run check            # TypeScript type checking

# Database
npm run db:push          # Push Drizzle schema changes to database

# Production
npm run build            # Build client and server
npm run start            # Start production server on localhost:5000

# Initial Setup
npx tsx scripts/create-boost-packages.js    # Create boost packages in database (REQUIRED)

# Testing Commands
npm test                 # Run tests (if configured)
npm run lint            # Run linting (check package.json for exact command)
npm run typecheck       # Run type checking (check package.json for exact command)
```

## Detailed Architecture

### Directory Structure
```
├── client/                      # React frontend application
│   ├── src/
│   │   ├── components/         # UI components and features
│   │   │   ├── analytics/     # Analytics tracking
│   │   │   ├── boost/         # Boost package components
│   │   │   ├── debug/         # Debug utilities (AuthDebug)
│   │   │   ├── seo/           # SEO meta tags
│   │   │   └── ui/            # 57 Shadcn/ui components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Utilities and configurations
│   │   ├── pages/             # 23 page components
│   │   └── utils/             # Additional utilities
│   ├── public/                # Static assets
│   └── index.html            # Entry HTML
├── server/                    # Express.js backend
│   ├── routes.ts             # ALL API endpoints
│   ├── index.ts              # Server entry point
│   ├── app-auth.ts           # JWT authentication
│   ├── auth-security.ts      # Enhanced auth security
│   ├── supabase.ts           # Supabase client
│   ├── storage.ts            # Storage interface
│   ├── billplz.ts            # Payment gateway
│   ├── boost-*.ts            # Boost system modules
│   ├── websockets/           # WebSocket implementation
│   └── utils/                # Server utilities
├── shared/                    # Shared code
│   └── schema.ts             # Database schema (Drizzle ORM)
├── scripts/                   # Utility scripts
└── migrations/               # Database migrations
```

### Frontend Architecture

#### Routing (Wouter)
- **Public Routes**: `/`, `/auth`, `/products`, `/auction/:id`, `/sellers/:id`
- **Protected Routes**: `/profile`, `/messages`, `/seller/dashboard`, `/admin/dashboard`, `/boost-checkout`
- **Static Pages**: `/terms-of-service`, `/privacy-policy`, `/buying-guide`

#### State Management
- **Primary**: TanStack Query with custom query client
- **Auth Context**: Supabase auth integration
- **Local State**: useState for component state
- **WebSocket Events**: Custom event system for real-time updates

#### UI Component System (Shadcn/ui)
- 57 reusable components built on Radix UI
- Styled with Tailwind CSS + CVA (class-variance-authority)
- Key patterns:
  - Polymorphic components with `asChild` prop
  - Consistent variant system
  - Accessibility-first design
  - TypeScript-first approach

#### Custom Hooks
- `use-supabase-auth`: Authentication management
- `use-messaging`: Real-time messaging with WebSocket
- `use-unread-messages`: Unread count tracking
- `use-analytics`: User behavior tracking
- `use-mobile`: Mobile detection
- `use-toast`: Notification system

### Backend Architecture

#### API Endpoints Structure
All endpoints in `server/routes.ts`:

**Authentication** (Rate Limited):
- `POST /api/v1/auth/session` - Exchange Supabase JWT for app JWT
- `POST /api/v1/auth/lookup-email` - Username to email lookup
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/recover-profile` - Recover orphaned profiles
- `GET /api/verify-email` - Email verification
- `GET /api/csrf-token` - CSRF token generation

**Products**:
- Full CRUD operations
- Image upload with Multer
- Featured products endpoint
- Search and filtering

**Auctions**:
- Create/update auctions
- Real-time bidding via WebSocket
- Bid history tracking
- Automatic status updates

**Boost System**:
- `GET /api/boost/packages` - Available packages
- `POST /api/boost/create-order` - Create boost order
- `POST /api/boost/webhook` - Billplz webhook
- Transaction management with rollback

**Messaging**:
- Encrypted message storage
- Real-time delivery
- File attachments
- Read receipts

#### Security Layers

1. **Authentication**:
   - Dual JWT system (Supabase + Application)
   - JWT expiration: 24 hours (inconsistent - needs fix)
   - Provider ID verification
   - Email verification required

2. **Rate Limiting**:
   - authLimiter: 5 req/15 min
   - passwordResetLimiter: 3 req/hour
   - apiLimiter: 100 req/15 min
   - Boost operations: 5 req/min

3. **Security Headers** (Helmet):
   - Comprehensive CSP
   - HSTS with preload
   - X-Frame-Options: DENY
   - All security headers configured

4. **CSRF Protection**:
   - Token-based protection
   - 1-hour expiry
   - Applied to state-changing operations

5. **CORS**:
   - Whitelist-based origins
   - Credentials support
   - Development flexibility

### Database Schema

#### Key Tables (14 total):

**Core Tables**:
- `users`: User profiles with wallet, roles, verification
- `products`: Perfume listings with boost support
- `productImages`: Multiple images per product
- `categories`: Product categorization

**Transaction Tables**:
- `orders`: Purchase orders
- `orderItems`: Order line items
- `transactions`: Transaction workflow tracking
- `payments`: Billplz payment records

**Auction Tables**:
- `auctions`: Auction configurations
- `bids`: Bid history
- `bidAuditTrail`: Comprehensive bid logging

**Communication**:
- `messages`: Encrypted user messages
- `reviews`: Product/seller reviews

**Boost System**:
- `boostPackages`: Package definitions

#### Relationships:
- Users → Products (one-to-many as seller)
- Products → ProductImages (one-to-many)
- Products → Auctions (one-to-one)
- Auctions → Bids (one-to-many)
- Users ↔ Users (many-to-many via messages)

### Real-time WebSocket System

#### Server Implementation:
- Runs on `/ws` path (same server as HTTP)
- JWT authentication required
- Room-based architecture for auctions
- Rate limiting for bids (5/minute)

#### Events:
- `auth`: Authentication with JWT
- `joinAuction`/`leaveAuction`: Auction room management
- `placeBid`: Submit auction bid
- `send_message`: Encrypted messaging
- `mark_read`: Read receipts

#### Client Integration:
- Auto-reconnection with exponential backoff
- Event-driven updates
- Optimistic UI updates
- Connection stability tracking

### Payment Integration (Billplz Only)

#### Boost Packages:
**Standard Boost** (15 hours):
- 1 item: RM 5.00
- 3 items: RM 12.00

**Premium Boost** (36 hours):
- 1 item: RM 10.00
- 3 items: RM 24.00
- 5 items: RM 40.00
- 10 items: RM 70.00

#### Payment Flow:
1. User selects boost package
2. System creates payment record
3. Generates Billplz bill
4. User completes payment
5. Webhook validates and activates boost
6. Products become featured

#### Security Features:
- X-Signature verification
- Idempotency support
- Transaction rollback on failure
- Comprehensive error handling

### Development Guidelines

#### API Development
1. Add route in `server/routes.ts`
2. Create Zod schema for validation
3. Apply appropriate middleware (auth, CSRF, rate limit)
4. Implement in storage interface
5. Add to API client in frontend
6. Handle errors with proper status codes

#### Frontend Development
1. Create page component in `/pages/`
2. Use TanStack Query for data fetching
3. Implement loading and error states
4. Add route in `App.tsx`
5. Use existing UI components
6. Follow TypeScript patterns

#### Database Changes
1. Modify schema in `/shared/schema.ts`
2. Run `npm run db:push`
3. Update storage interface
4. Test with transactions
5. Consider migration script

#### Adding Real-time Features
1. Add WebSocket event handler in server
2. Implement room logic if needed
3. Add client-side hook
4. Handle reconnection
5. Implement optimistic updates

### Environment Variables

Required in `.env`:
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
NODE_ENV=development

# Optional
LOG_LEVEL=info
REDIS_URL=redis://localhost:6379
```

### Common Tasks

#### Setting Up Boost System
```bash
# Required for boost features to work
npx tsx scripts/create-boost-packages.js
```

#### Testing Payment Webhook
```bash
# Use test script
node test-webhook.cjs
```

#### Debugging WebSocket
1. Check browser console for connection status
2. Verify JWT token is sent
3. Check server logs for auth errors
4. Use debug component in development

#### Handling File Uploads
1. Images use Multer middleware
2. Files stored in Supabase Storage
3. URLs saved in database
4. Automatic cleanup on deletion

### Security Considerations

#### Known Issues to Fix:
1. **JWT Secret**: Inconsistent handling between modules
2. **Token Expiry**: 7 days vs 24 hours inconsistency
3. **CSRF Coverage**: Not applied to all endpoints
4. **In-Memory Storage**: CSRF tokens and rate limits need Redis

#### Best Practices:
1. Always validate input with Zod
2. Use parameterized queries (Drizzle handles this)
3. Encrypt sensitive data (messages)
4. Log security events
5. Apply rate limiting to public endpoints
6. Verify ownership before modifications

### Performance Optimization

1. **Database**:
   - Indexes on foreign keys and filters
   - Composite indexes for complex queries
   - Partial indexes for conditional queries

2. **Frontend**:
   - TanStack Query caching
   - Lazy loading for routes
   - Image optimization
   - Bundle splitting

3. **Backend**:
   - Connection pooling
   - Stateless design
   - Efficient error handling
   - Minimal middleware stack

### Testing Strategy

1. **Unit Tests**: Test individual functions
2. **Integration Tests**: Test API endpoints
3. **E2E Tests**: Test user workflows
4. **Load Tests**: Test WebSocket scaling
5. **Security Tests**: Test auth and permissions

### Deployment Considerations

1. **Environment Setup**:
   - Set all required env variables
   - Run boost package script
   - Verify database migrations
   - Test payment webhooks

2. **Scaling**:
   - Implement Redis for distributed state
   - Consider WebSocket clustering
   - Database read replicas
   - CDN for static assets

3. **Monitoring**:
   - API endpoint monitoring
   - WebSocket connection tracking
   - Payment success rates
   - Error rate tracking

### Important Notes

- WebSocket runs on same server (not separate port)
- Billplz is the ONLY payment gateway (no Stripe)
- File uploads migrated to Supabase Storage
- CSRF tokens required for state changes
- Rate limiting varies by endpoint sensitivity
- Boost system requires initial package setup
- Message encryption is mandatory
- Audit logging for security events