# Timezone Handling Documentation

## Overview

The Bidscents MFA application uses a consistent approach to handle timezones across the entire stack to ensure proper date/time display for users in different timezones.

## Key Principles

1. **Database Storage**: All dates and times are stored in UTC (Coordinated Universal Time) in the database as ISO 8601 strings.

2. **Server Processing**: The server performs all date comparisons and calculations in UTC without any timezone adjustments.

3. **Client Display**: The client application displays dates and times in the user's local timezone using JavaScript's built-in locale functions.

## Implementation Details

### Server-Side (Node.js/Express)

- All `new Date()` calls create dates in UTC
- Database queries use ISO strings: `new Date().toISOString()`
- No manual timezone adjustments (removed hardcoded BST adjustments)
- Example:
  ```javascript
  const now = new Date(); // UTC time
  const isExpired = auctionEndDate.getTime() < now.getTime();
  ```

### Client-Side (React)

- Use the date utility functions from `/client/src/lib/date-utils.ts`:
  - `formatDate()` - Display date only
  - `formatTime()` - Display time only
  - `formatDateTime()` - Display date and time
  - `formatDateTimeNice()` - Display in a user-friendly format
  - `getRelativeTime()` - Display relative times (e.g., "2 hours ago")

- Example usage:
  ```javascript
  import { formatDateTime } from '@/lib/date-utils';
  
  // Display a timestamp
  <span>{formatDateTime(bid.placedAt)}</span>
  ```

### Database (PostgreSQL/Supabase)

- All timestamp columns use `timestamp with time zone`
- Dates are stored as ISO 8601 strings
- Example: `2024-01-15T14:30:00.000Z`

## Migration from BST Hardcoding

Previously, the server code included a manual adjustment for British Summer Time (BST):
```javascript
// OLD CODE - DO NOT USE
now.setHours(now.getHours() + 1); // Add 1 hour to match BST
```

This has been removed because:
1. It breaks for users in other timezones
2. It doesn't account for daylight saving time changes
3. It creates inconsistencies between server and client

## Testing Timezone Handling

To test timezone handling:

1. Change your system timezone to different locations
2. Create auctions with specific end times
3. Verify that:
   - Auctions expire at the correct time regardless of timezone
   - Dates display correctly in the user's local timezone
   - Boost package expiry times are accurate

## Common Pitfalls to Avoid

1. **Don't manually adjust timezones on the server**
2. **Don't use `Date.parse()` without proper validation**
3. **Don't assume all users are in the same timezone**
4. **Always store dates in UTC in the database**
5. **Always display dates in the user's local timezone**

## Future Improvements

Consider implementing:
1. User timezone preferences in account settings
2. Timezone display in auction countdown timers
3. Server-side timezone detection based on IP geolocation
4. More sophisticated date formatting with libraries like `date-fns-tz`