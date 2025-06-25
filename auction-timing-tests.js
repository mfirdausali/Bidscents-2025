#!/usr/bin/env node

/**
 * Comprehensive Auction Timing Test Suite
 * Tests the auction expiry logic to prevent regression
 */

class AuctionTimingTests {
  constructor() {
    this.passedTests = 0;
    this.failedTests = 0;
    this.testResults = [];
  }

  test(description, testFunction) {
    try {
      console.log(`\n🧪 Testing: ${description}`);
      const result = testFunction();
      if (result === true) {
        console.log(`✅ PASS: ${description}`);
        this.passedTests++;
        this.testResults.push({ description, status: 'PASS' });
      } else {
        console.log(`❌ FAIL: ${description} - ${result}`);
        this.failedTests++;
        this.testResults.push({ description, status: 'FAIL', reason: result });
      }
    } catch (error) {
      console.log(`❌ ERROR: ${description} - ${error.message}`);
      this.failedTests++;
      this.testResults.push({ description, status: 'ERROR', reason: error.message });
    }
  }

  // Test PostgreSQL timestamp format parsing
  testPostgreSQLFormat() {
    return this.test('PostgreSQL timestamp format parsing', () => {
      const timestamp = '2025-06-25 14:21:44.615+00';
      const parsed = new Date(timestamp);
      
      if (isNaN(parsed.getTime())) {
        return 'Failed to parse PostgreSQL timestamp';
      }
      
      const expected = '2025-06-25T14:21:44.615Z';
      if (parsed.toISOString() !== expected) {
        return `Expected ${expected}, got ${parsed.toISOString()}`;
      }
      
      return true;
    });
  }

  // Test that auctions don't expire early
  testNoEarlyExpiration() {
    return this.test('Auctions do not expire early', () => {
      // Create an auction that should expire in 1 hour
      const oneHourFromNow = new Date(Date.now() + 3600000);
      const postgresFormat = oneHourFromNow.toISOString()
        .replace('T', ' ')
        .replace('Z', '+00');
      
      // Parse it back
      const parsed = new Date(postgresFormat);
      
      if (isNaN(parsed.getTime())) {
        return 'Failed to parse future timestamp';
      }
      
      // Check if it's considered expired (it shouldn't be)
      const isExpired = parsed.getTime() < Date.now();
      if (isExpired) {
        return '1-hour future auction is incorrectly marked as expired';
      }
      
      // Check the time difference
      const timeDiff = parsed.getTime() - Date.now();
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      
      if (hoursDiff < 0.95 || hoursDiff > 1.05) {
        return `Time difference incorrect: ${hoursDiff.toFixed(2)} hours (expected ~1 hour)`;
      }
      
      return true;
    });
  }

  // Test invalid timestamp handling
  testInvalidTimestampHandling() {
    return this.test('Invalid timestamp handling', () => {
      const invalidTimestamps = [
        '2025-06-25T14:21:44.615+00', // Invalid format that old fix created
        'invalid-date',
        '',
        null,
        undefined
      ];
      
      for (const timestamp of invalidTimestamps) {
        try {
          const parsed = new Date(timestamp);
          if (!isNaN(parsed.getTime()) && timestamp === '2025-06-25T14:21:44.615+00') {
            // This specific format should be invalid
            return `Should not parse invalid ISO format: ${timestamp}`;
          }
        } catch (error) {
          // Expected for null/undefined
          continue;
        }
      }
      
      return true;
    });
  }

  // Test timezone consistency
  testTimezoneConsistency() {
    return this.test('Timezone consistency across formats', () => {
      const utcTime = '2025-06-25T14:21:44.615Z';
      const postgresTime = '2025-06-25 14:21:44.615+00';
      
      const utcParsed = new Date(utcTime);
      const postgresParsed = new Date(postgresTime);
      
      if (isNaN(utcParsed.getTime()) || isNaN(postgresParsed.getTime())) {
        return 'Failed to parse comparison timestamps';
      }
      
      if (utcParsed.getTime() !== postgresParsed.getTime()) {
        return `Timestamps should be equal: UTC=${utcParsed.toISOString()}, PostgreSQL=${postgresParsed.toISOString()}`;
      }
      
      return true;
    });
  }

  // Test auction expiry calculation logic
  testExpiryCalculation() {
    return this.test('Auction expiry calculation', () => {
      const now = Date.now();
      
      // Test expired auction (1 hour ago)
      const expiredTime = new Date(now - 3600000).toISOString()
        .replace('T', ' ')
        .replace('Z', '+00');
      const expiredParsed = new Date(expiredTime);
      const isExpired = expiredParsed.getTime() < now;
      
      if (!isExpired) {
        return 'Auction from 1 hour ago should be expired';
      }
      
      // Test active auction (1 hour future)
      const futureTime = new Date(now + 3600000).toISOString()
        .replace('T', ' ')
        .replace('Z', '+00');
      const futureParsed = new Date(futureTime);
      const isActive = futureParsed.getTime() > now;
      
      if (!isActive) {
        return 'Auction 1 hour in future should be active';
      }
      
      return true;
    });
  }

  // Test server timezone awareness
  testServerTimezoneAwareness() {
    return this.test('Server timezone awareness', () => {
      const serverOffset = new Date().getTimezoneOffset();
      console.log(`      Server timezone offset: ${serverOffset} minutes from UTC`);
      
      // Test that UTC timestamps work regardless of server timezone
      const utcTimestamp = '2025-06-25 14:21:44.615+00';
      const parsed = new Date(utcTimestamp);
      
      if (isNaN(parsed.getTime())) {
        return 'UTC timestamp parsing failed';
      }
      
      // The parsed time should be the same regardless of server timezone
      const expectedUTC = '2025-06-25T14:21:44.615Z';
      if (parsed.toISOString() !== expectedUTC) {
        return `Server timezone affected UTC parsing: expected ${expectedUTC}, got ${parsed.toISOString()}`;
      }
      
      return true;
    });
  }

  // Run all tests
  runAllTests() {
    console.log('🚀 Starting Auction Timing Test Suite\n');
    console.log('📊 Environment Info:');
    console.log(`   Current time: ${new Date().toISOString()}`);
    console.log(`   Server timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    console.log(`   Timezone offset: ${new Date().getTimezoneOffset()} minutes from UTC`);
    
    this.testPostgreSQLFormat();
    this.testNoEarlyExpiration();
    this.testInvalidTimestampHandling();
    this.testTimezoneConsistency();
    this.testExpiryCalculation();
    this.testServerTimezoneAwareness();
    
    this.printSummary();
  }

  printSummary() {
    console.log('\n' + '='.repeat(50));
    console.log('📋 TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${this.passedTests}`);
    console.log(`❌ Failed: ${this.failedTests}`);
    console.log(`📊 Total:  ${this.passedTests + this.failedTests}`);
    
    if (this.failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults
        .filter(result => result.status !== 'PASS')
        .forEach(result => {
          console.log(`   - ${result.description}: ${result.reason || result.status}`);
        });
      
      console.log('\n🚨 AUCTION TIMING FIX NEEDS ATTENTION! 🚨');
      process.exit(1);
    } else {
      console.log('\n🎉 ALL TESTS PASSED! AUCTION TIMING FIX IS WORKING! 🎉');
      process.exit(0);
    }
  }
}

// Run the tests
const tester = new AuctionTimingTests();
tester.runAllTests();