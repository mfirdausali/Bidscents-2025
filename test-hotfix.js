#!/usr/bin/env node

console.log('=== Testing Auction Timing Hotfix ===');

// Simulate different PostgreSQL timestamp formats that might be returned
const testTimestamps = [
  '2025-06-25 14:21:44.615+00',  // PostgreSQL with timezone
  '2025-06-25T14:21:44.615Z',    // ISO format
  '2025-06-25 14:21:44.615',     // PostgreSQL without timezone
  '2025-06-25T14:21:44.615+00',  // Invalid format (old "fix" created this)
];

console.log('Current server time:', new Date().toISOString());
console.log('Server timezone offset:', new Date().getTimezoneOffset(), 'minutes from UTC');

testTimestamps.forEach((timestamp, index) => {
  console.log(`\n--- Test ${index + 1}: "${timestamp}" ---`);
  
  // Apply the hotfix logic
  let auctionEndDate = new Date(timestamp);
  
  if (isNaN(auctionEndDate.getTime())) {
    console.log('❌ INVALID: Date parsing failed');
    return;
  }
  
  console.log('✅ VALID: Parsed to:', auctionEndDate.toISOString());
  console.log('Local time:', auctionEndDate.toString());
  
  // Check expiration (using current time as reference)
  const now = new Date();
  const msUntilEnd = auctionEndDate.getTime() - now.getTime();
  const hoursUntilEnd = msUntilEnd / (1000 * 60 * 60);
  const isExpired = msUntilEnd < 0;
  
  console.log('Hours from now:', hoursUntilEnd.toFixed(2));
  console.log('Is expired:', isExpired);
});

// Test specific case that was causing 1-hour early expiration
console.log('\n=== CRITICAL TEST: 1-Hour Future Timestamp ===');
const oneHourFuture = new Date(Date.now() + 3600000); // 1 hour from now
const postgresFormat = oneHourFuture.toISOString().replace('T', ' ').replace('Z', '+00');
console.log('One hour future in PostgreSQL format:', postgresFormat);

const parsedDate = new Date(postgresFormat);
console.log('Parsed back to:', parsedDate.toISOString());
console.log('Difference from original:', Math.abs(oneHourFuture.getTime() - parsedDate.getTime()), 'ms');
const willExpireInOneHour = parsedDate.getTime() > Date.now();
console.log('Should be expired in 1 hour:', willExpireInOneHour ? 'NO (correct - still has time)' : 'YES (bug - already expired)');