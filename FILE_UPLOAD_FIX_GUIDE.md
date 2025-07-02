# File Upload Fix Guide - Supabase Storage Migration

This guide documents the complete fix for migrating from Replit Object Storage to Supabase Storage for the Bidscents-2025 marketplace.

## Overview

The file upload system has been migrated to use Supabase Storage with three main buckets:
- `listing-images` - Product images (public)
- `profile-images` - User avatars and cover photos (public)
- `message-files` - Message attachments (private)

## Changes Made

### 1. Storage Configuration

Created Supabase storage buckets with proper permissions:
```bash
npm run setup-storage
```

### 2. Backend Updates

#### Image URL Helper (`server/image-url-helper.ts`)
- Created helper functions to transform image IDs to public URLs
- Handles both legacy URLs and new Supabase file IDs
- Provides consistent URL transformation across the application

#### Authentication Routes (`server/app-auth.ts`)
- Updated `/api/v1/auth/me` endpoint to return transformed image URLs
- Updated `/api/v1/auth/session` endpoint to include profile images with URLs

#### Product Routes (`server/routes.ts`)
- Updated all product endpoints to transform image URLs:
  - `GET /api/products` - All products
  - `GET /api/products/:id` - Single product
  - `GET /api/products/featured` - Featured products
  - `GET /api/seller/products` - Seller's products
  - `GET /api/sellers/:id` - Seller profile

### 3. File Upload Endpoints

All upload endpoints now use Supabase Storage:

#### Profile Image Upload
- **Endpoint**: `POST /api/user/avatar`
- **Bucket**: `profile-images`
- **Size Limit**: 2MB validation, 5MB multer
- **Dimensions**: 800x800 max

#### Cover Photo Upload
- **Endpoint**: `POST /api/user/cover`
- **Bucket**: `profile-images`
- **Size Limit**: 5MB
- **Dimensions**: 2048x1024 max

#### Product Image Upload
- **Endpoint**: `POST /api/products/:id/images`
- **Bucket**: `listing-images`
- **Size Limit**: 5MB
- **Multiple Files**: Supported

#### Message File Upload
- **Endpoint**: `POST /api/messages/upload-file`
- **Bucket**: `message-files`
- **Size Limit**: 10MB
- **Types**: Images, PDFs, Word docs

### 4. Image Serving

The existing `/api/images/:imageId` endpoint continues to work, serving images from Supabase Storage.

## Setup Instructions

### 1. Environment Variables

Ensure these are set in your `.env` file:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 2. Create Storage Buckets

Run the setup script:
```bash
npm run setup-storage
```

### 3. Configure Bucket Policies

In Supabase Dashboard > Storage > Policies:

#### For `listing-images` and `profile-images`:
- **SELECT**: `true` (public read)
- **INSERT**: `auth.role() = 'authenticated'`
- **UPDATE**: `auth.uid() = owner`
- **DELETE**: `auth.uid() = owner`

#### For `message-files`:
- **All operations**: `auth.role() = 'authenticated'`

### 4. Test the System

Run the test script:
```bash
node test-file-upload-system.js
```

## Migration Guide

If you have existing files in the old storage system:

### 1. Analyze Existing Data
```bash
node scripts/migrate-to-supabase-storage.js
```

This will create a `migration-report.json` with details about files needing migration.

### 2. Manual Migration Steps

For each file that needs migration:
1. Download from old storage
2. Upload to appropriate Supabase bucket
3. Update database record with new file ID

## Frontend Compatibility

The frontend continues to work without changes:
- Product images use `/api/images/{imageId}` format
- Profile images are returned as full URLs from auth endpoints
- The system handles both legacy URLs and new Supabase IDs

## Troubleshooting

### Images Not Displaying

1. Check if buckets exist:
   ```bash
   npm run setup-storage
   ```

2. Verify bucket policies in Supabase Dashboard

3. Check browser console for 404 errors

4. Test image retrieval:
   ```bash
   curl http://localhost:5000/api/images/{imageId}
   ```

### Upload Failures

1. Check file size limits
2. Verify authentication token
3. Check bucket permissions
4. Review server logs for errors

### URL Format Issues

- Legacy format: Full URLs (http://...)
- New format: File IDs (product_uuid, profile_uuid)
- Both formats are supported

## Security Features

- File type validation (magic bytes)
- Size limits per file type
- Image dimension validation
- Metadata stripping
- Rate limiting on uploads
- Audit logging
- Optional virus scanning

## Performance Optimization

- Images served with 24-hour cache headers
- Automatic format optimization
- Progressive JPEG encoding
- Metadata removal
- Optional watermarking for products

## Next Steps

1. Monitor upload success rates
2. Set up backup strategy for Supabase Storage
3. Consider CDN integration for better performance
4. Implement image optimization pipeline
5. Add image compression options