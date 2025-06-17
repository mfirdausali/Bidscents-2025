# BidScents - Luxury Perfume Marketplace

## Overview

BidScents is a sophisticated secondhand luxury perfume marketplace built as a full-stack web application. The platform enables users to buy and sell pre-owned designer and niche fragrances through both direct sales and auction mechanisms. The application features user authentication, real-time messaging, payment processing, and administrative controls.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack React Query for server state, React hooks for local state
- **UI Framework**: Radix UI components with Tailwind CSS for styling
- **Build Tool**: Vite with custom configuration for development and production

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Authentication**: Supabase Auth as primary identity provider
- **WebSockets**: WebSocket Server for real-time messaging
- **File Upload**: Multer for handling multipart form data

### Data Storage Solutions
- **Primary Database**: PostgreSQL (via Supabase)
- **Object Storage**: Replit Object Storage for images and files
- **Session Storage**: PostgreSQL-based session store for secure session management

## Key Components

### Authentication System
- **Primary Provider**: Supabase Auth with JWT tokens
- **Security Features**: Provider ID validation, secure session creation, automatic account linking
- **Session Management**: Express session store with PostgreSQL backend
- **Authorization**: Role-based access control (Admin, Seller, Regular User)

### Database Schema
- **Users**: Enhanced with provider ID fields for security
- **Products**: Full product catalog with images, categories, and seller information
- **Transactions**: Order management with status tracking
- **Messages**: Encrypted real-time messaging system
- **Auctions**: Bidding system with time-based auction mechanics
- **Payments**: Billplz integration for Malaysian payment processing

### Real-time Features
- **WebSocket Server**: Handles real-time messaging between users
- **Message Encryption**: AES encryption for secure message storage
- **Live Updates**: Real-time bid updates and message notifications

### Payment Processing
- **Gateway**: Billplz for Malaysian market payments
- **Security**: X-Signature verification for webhook validation
- **Environment**: Sandbox and production modes supported

## Data Flow

### Authentication Flow
1. User authenticates via Supabase (email/password, social login)
2. Supabase JWT validated on server
3. Local user profile created/linked with provider ID
4. Application JWT issued for API access
5. Session stored securely in PostgreSQL

### Product Listing Flow
1. Seller uploads product details and images
2. Images stored in Replit Object Storage
3. Product metadata saved to PostgreSQL
4. Optional boost packages for enhanced visibility

### Transaction Flow
1. Buyer initiates purchase or places bid
2. Payment processed through Billplz
3. Webhook confirmation validates payment
4. Order status updated and notifications sent
5. Real-time messaging enables buyer-seller communication

### Message Flow
1. Messages encrypted client-side before transmission
2. WebSocket delivers real-time messages
3. Encrypted content stored in database
4. File attachments stored in separate object storage bucket

## External Dependencies

### Core Services
- **Supabase**: Authentication, database hosting, real-time subscriptions
- **Replit Object Storage**: File and image storage with CDN capabilities
- **Billplz**: Payment processing for Malaysian ringgit transactions

### Development Tools
- **Drizzle Kit**: Database migrations and schema management
- **Vite**: Frontend build tool with hot module replacement
- **ESBuild**: Backend bundling for production deployment

### Runtime Dependencies
- **@supabase/supabase-js**: Official Supabase client library
- **@replit/object-storage**: Replit's object storage client
- **drizzle-orm**: Type-safe database operations
- **express**: Web server framework
- **ws**: WebSocket server implementation

## Deployment Strategy

### Environment Configuration
- **Development**: Local development with Vite dev server
- **Production**: Replit Autoscale deployment with environment variables
- **Database**: Supabase PostgreSQL with connection pooling
- **Assets**: Static files served from Replit's CDN

### Build Process
1. Frontend built with Vite to static assets
2. Backend bundled with ESBuild for Node.js runtime
3. Database schema pushed via Drizzle migrations
4. Environment secrets configured for production deployment

### Security Considerations
- JWT secret enforcement in production
- CSRF protection for state-changing operations
- Row-level security policies in Supabase
- Encrypted message storage with secure key management

## Changelog
- June 17, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.