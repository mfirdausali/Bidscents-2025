#!/usr/bin/env node

console.log('=== Node.js Date Parsing Test ===');
console.log('Server timezone offset:', new Date().getTimezoneOffset());
console.log('Current time UTC:', new Date().toISOString());
console.log('Current time local:', new Date().toString());

// Test PostgreSQL timestamp formats
const formats = [
  '2025-06-21 14:21:44.615+00',
  '2025-06-21T14:21:44.615+00',
  '2025-06-21 14:21:44.615',
  '2025-06-21T14:21:44.615Z'
];

console.log('\n=== Testing Different Timestamp Formats ===');
formats.forEach(format => {
  try {
    const date = new Date(format);
    console.log(`Format: '${format}' -> ${date.toISOString()} (${date.toString()})`);
  } catch (e) {
    console.log(`Format: '${format}' -> ERROR: ${e.message}`);
  }
});

// Test the current parsing logic from routes.ts
console.log('\n=== Testing Current Fix Logic ===');
const postgresFormat = '2025-06-21 14:21:44.615+00';
let auctionEndDate;

console.log(`Testing PostgreSQL format: '${postgresFormat}'`);
console.log(`Direct new Date(): ${new Date(postgresFormat).toISOString()}`);

if (postgresFormat.includes('+00')) {
  // PostgreSQL format with timezone: "2025-06-20 16:41:53.967+00"
  // Replace space with T for proper ISO format
  const isoString = postgresFormat.replace(' ', 'T');
  console.log(`Attempting to parse: '${isoString}'`);
  try {
    auctionEndDate = new Date(isoString);
    console.log(`PostgreSQL format fix: '${postgresFormat}' -> '${isoString}' -> ${auctionEndDate.toISOString()}`);
  } catch (e) {
    console.log(`ERROR parsing '${isoString}': ${e.message}`);
    // Fallback to original parsing
    auctionEndDate = new Date(postgresFormat);
    console.log(`Fallback to original: ${auctionEndDate.toISOString()}`);
  }
}

// Test what happens with current time comparison
const now = new Date();
const msUntilEnd = auctionEndDate.getTime() - now.getTime();
const hoursUntilEnd = msUntilEnd / (1000 * 60 * 60);

console.log(`\nComparison with current time:`);
console.log(`Auction end time: ${auctionEndDate.toISOString()}`);
console.log(`Current time: ${now.toISOString()}`);
console.log(`Hours until end: ${hoursUntilEnd.toFixed(2)}`);
console.log(`Is expired: ${msUntilEnd < 0}`);

// CRITICAL: Test the actual server timezone offset issue
console.log(`\n=== CRITICAL TIMEZONE ANALYSIS ===`);
console.log(`Server is in JST (Japan Standard Time) with -540 minute offset from UTC`);
console.log(`This means JST is UTC+9`);
console.log(`PostgreSQL timestamp '2025-06-21 14:21:44.615+00' means 14:21 UTC`);
console.log(`In JST, that would be 23:21 (14:21 + 9 hours)`);
console.log(`The 1-hour early expiration suggests auctions expire at 22:21 JST instead of 23:21 JST`);
console.log(`This means the system is treating the timestamp as 1 hour earlier than it should be`);