# Fix for Auctions Expiring 1 Hour Early

## The Problem
Your auctions are expiring exactly 1 hour early. For example:
- Auction set to end at 15:15 UTC actually ends at 14:16 UTC
- Auction set to end at 14:30 UTC actually ends at 13:30 UTC

## Root Cause
The Node.js server is likely running with a timezone offset. Even though your Supabase database is correctly in UTC, the server's Date comparison is off by 1 hour.

## Immediate Fix (Database Side)
Run the SQL script `fix-auction-early-expiry.sql` in Supabase to extend active auctions by 1 hour.

## Permanent Fix (Server Side)

### Option 1: Set Server Timezone Environment Variable
Add this to your server environment variables:
```bash
TZ=UTC
```

### Option 2: Fix in Code
In `/server/routes.ts`, modify the `checkAndProcessExpiredAuctions` function around line 3390:

```typescript
// Current code that's causing the issue
const endsAtString = auction.endsAt.toString();
const auctionEndDate = endsAtString.includes('T') 
  ? new Date(endsAtString)
  : new Date(endsAtString.replace(' ', 'T'));

// Fix: Ensure UTC interpretation
const endsAtString = auction.endsAt.toString();
let auctionEndDate;
if (endsAtString.includes('+00')) {
  // Already has timezone, parse directly
  auctionEndDate = new Date(endsAtString);
} else if (endsAtString.includes('T')) {
  // ISO format without timezone, append Z for UTC
  auctionEndDate = new Date(endsAtString + 'Z');
} else {
  // PostgreSQL format, replace space and append Z
  auctionEndDate = new Date(endsAtString.replace(' ', 'T') + 'Z');
}
```

### Option 3: Debug Logging
Add this logging to identify the exact issue:

```typescript
console.log(`[TIMEZONE-DEBUG] Process TZ: ${process.env.TZ}`);
console.log(`[TIMEZONE-DEBUG] Server offset: ${new Date().getTimezoneOffset()}`);
console.log(`[TIMEZONE-DEBUG] Auction ends_at raw: ${auction.endsAt}`);
console.log(`[TIMEZONE-DEBUG] Parsed date: ${auctionEndDate.toISOString()}`);
console.log(`[TIMEZONE-DEBUG] Now: ${now.toISOString()}`);
```

## Verification
After applying the fix, monitor the next auction expiry to ensure it expires at the correct time.