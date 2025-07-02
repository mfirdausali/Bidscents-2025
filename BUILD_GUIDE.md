# BidScents Build Guide

## Important: Environment Variables for Client-Side Build

The client-side application requires certain environment variables to be available during the build process. These variables must be prefixed with `VITE_` to be exposed to the client.

### Required Environment Variables

Add these to your `.env` file:

```bash
# Supabase Configuration (Required for client)
VITE_SUPABASE_URL="your-supabase-url"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"

# Server-side variables (not exposed to client)
SUPABASE_URL="your-supabase-url"
SUPABASE_KEY="your-supabase-service-key"
DATABASE_URL="your-database-url"
JWT_SECRET="your-jwt-secret"
# ... other server variables
```

## Build Commands

### Development
```bash
npm run dev
```

### Production Build
The build process now automatically loads environment variables from `.env`:

```bash
npm run build
```

This command:
1. Uses `dotenv-cli` to load variables from `.env`
2. Builds the client with Vite (includes VITE_ prefixed variables)
3. Builds the server with esbuild

### Alternative Build Methods

If you need to manually specify environment variables:

```bash
VITE_SUPABASE_URL="..." VITE_SUPABASE_ANON_KEY="..." npm run build
```

## Production Deployment

### Using the Production Script

```bash
./start-production.sh
```

This script:
1. Checks for `.env` file existence
2. Verifies required VITE_ variables are present
3. Installs dependencies
4. Builds the application with environment variables
5. Starts PM2 with the correct configuration

### Manual PM2 Start

If you need to start PM2 manually:

```bash
pm2 start ecosystem.config.cjs
```

The PM2 configuration automatically loads environment variables from `.env`.

## Troubleshooting

### Blank Page Issues

If you see a blank page with console errors about missing Supabase credentials:

1. **Check `.env` file**: Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
2. **Rebuild**: Run `npm run build` to rebuild with environment variables
3. **Restart**: `pm2 restart bidscents`

### Verifying Environment Variables in Build

To verify variables are included in the build:

```bash
# Check if the built JS file contains the Supabase URL
grep -o "supabase.co" dist/public/assets/index-*.js
```

If the grep returns results, the environment variables were included.

### PM2 Environment Issues

If PM2 isn't loading environment variables:

```bash
# Restart with environment update
pm2 restart bidscents --update-env

# Or delete and start fresh
pm2 delete bidscents
pm2 start ecosystem.config.cjs
```

## Best Practices

1. **Never commit `.env`**: Keep it in `.gitignore`
2. **Use `.env.example`**: Create a template with dummy values
3. **Validate before build**: The production script checks for required variables
4. **Use consistent naming**: Always prefix client variables with `VITE_`
5. **Document all variables**: Keep this guide updated with new requirements

## Environment Variable Reference

### Client-Side (VITE_ prefix required)
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous/public key

### Server-Side Only
- `SUPABASE_URL`: Same as VITE_SUPABASE_URL
- `SUPABASE_KEY`: Supabase service role key (secret)
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret for JWT signing
- `BILLPLZ_SECRET_KEY`: Payment gateway secret
- `BILLPLZ_XSIGN_KEY`: Payment gateway signature key
- `BILLPLZ_COLLECTION_ID`: Payment collection ID
- `APP_URL`: Server URL (default: http://localhost:5000)
- `CLIENT_URL`: Client URL (default: http://localhost:3000)