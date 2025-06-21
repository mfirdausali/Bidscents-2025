// Test script to verify date parsing fix
// Run this with: node test-date-parsing.js

console.log('===== Date Parsing Test =====');
console.log('Server timezone offset:', new Date().getTimezoneOffset(), 'minutes');
console.log('Process TZ:', process.env.TZ || 'not set');
console.log('');

// Test different date formats that might come from PostgreSQL
const testDates = [
  '2025-06-21 14:21:44.615+00',      // PostgreSQL format with timezone
  '2025-06-21T14:21:44.615+00',      // ISO format with timezone
  '2025-06-21 14:21:44.615',         // PostgreSQL format without timezone
  '2025-06-21T14:21:44.615Z',        // ISO format with Z
  '2025-06-21T14:21:44.615',         // ISO format without timezone
];

console.log('Testing different date formats:');
console.log('');

testDates.forEach(dateStr => {
  console.log(`Input: "${dateStr}"`);
  
  // Original parsing (might be wrong)
  const originalDate = dateStr.includes('T') 
    ? new Date(dateStr)
    : new Date(dateStr.replace(' ', 'T'));
  
  // Fixed parsing
  let fixedDate;
  if (dateStr.includes('+00')) {
    const isoString = dateStr.replace(' ', 'T');
    fixedDate = new Date(isoString);
  } else if (dateStr.includes('T') && dateStr.endsWith('Z')) {
    fixedDate = new Date(dateStr);
  } else if (dateStr.includes('T')) {
    fixedDate = new Date(dateStr + 'Z');
  } else {
    fixedDate = new Date(dateStr.replace(' ', 'T') + 'Z');
  }
  
  console.log(`  Original parsing: ${originalDate.toISOString()} (Local: ${originalDate.toString()})`);
  console.log(`  Fixed parsing:    ${fixedDate.toISOString()} (Local: ${fixedDate.toString()})`);
  console.log(`  Hours difference: ${(fixedDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60)}`);
  console.log('');
});

// Test with current time
console.log('===== Current Time Comparison =====');
const now = new Date();
const testEndTime = '2025-06-21 15:30:00.000+00';

// Original parsing
const endTimeOriginal = new Date(testEndTime.replace(' ', 'T'));
const msUntilEndOriginal = endTimeOriginal.getTime() - now.getTime();
const hoursUntilEndOriginal = msUntilEndOriginal / (1000 * 60 * 60);

// Fixed parsing
const endTimeFixed = new Date(testEndTime.replace(' ', 'T'));
const msUntilEndFixed = endTimeFixed.getTime() - now.getTime();
const hoursUntilEndFixed = msUntilEndFixed / (1000 * 60 * 60);

console.log(`Test end time: ${testEndTime}`);
console.log(`Current time:  ${now.toISOString()}`);
console.log(`Original: ${hoursUntilEndOriginal.toFixed(2)} hours until expiry`);
console.log(`Fixed:    ${hoursUntilEndFixed.toFixed(2)} hours until expiry`);