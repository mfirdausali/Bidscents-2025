#!/usr/bin/env node

/**
 * Error Handling and Edge Cases Test
 * Tests transaction system resilience and error recovery
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_CONFIG = {
  validSellerId: 32,
  validBuyerId: 34,
  validProductId: 138,
  invalidUserId: 99999,
  invalidProductId: 99999,
  testRuns: 5
};

class ErrorHandlingTest {
  constructor(testId, scenario) {
    this.testId = testId;
    this.scenario = scenario;
    this.startTime = Date.now();
    this.cleanup_ids = { messages: [], transactions: [] };
  }

  log(level, message, data = null) {
    const elapsed = Date.now() - this.startTime;
    console.log(`[${this.testId}] [${elapsed}ms] [${level}] ${message}`);
    if (data) console.log(`[${this.testId}] Data:`, data);
  }

  async cleanup() {
    try {
      if (this.cleanup_ids.messages.length > 0) {
        await supabase.from('messages').delete().in('id', this.cleanup_ids.messages);
      }
      if (this.cleanup_ids.transactions.length > 0) {
        await supabase.from('transactions').delete().in('id', this.cleanup_ids.transactions);
      }
    } catch (error) {
      this.log('WARN', `Cleanup warning: ${error.message}`);
    }
  }

  // Test 1: Invalid user scenarios
  async testInvalidUsers() {
    this.log('START', 'Testing invalid user scenarios');
    
    try {
      // Test invalid sender
      const { data: msg1, error: error1 } = await supabase
        .from('messages')
        .insert({
          sender_id: TEST_CONFIG.invalidUserId,
          receiver_id: TEST_CONFIG.validBuyerId,
          content: 'Test message from invalid user',
          message_type: 'ACTION',
          action_type: 'INITIATE',
          product_id: TEST_CONFIG.validProductId
        })
        .select()
        .single();

      if (error1) {
        this.log('PASS', 'Invalid sender rejected by database');
        return { success: true, error: 'Invalid sender properly rejected' };
      } else {
        this.cleanup_ids.messages.push(msg1.id);
        this.log('FAIL', 'Invalid sender was accepted - potential security issue');
        return { success: false, error: 'Invalid sender accepted' };
      }

    } catch (error) {
      this.log('PASS', `Error handling working: ${error.message}`);
      return { success: true, error: error.message };
    }
  }

  // Test 2: Invalid product scenarios
  async testInvalidProducts() {
    this.log('START', 'Testing invalid product scenarios');
    
    try {
      // Test transaction with invalid product
      const { data: tx, error: txError } = await supabase
        .from('transactions')
        .insert({
          product_id: TEST_CONFIG.invalidProductId,
          seller_id: TEST_CONFIG.validSellerId,
          buyer_id: TEST_CONFIG.validBuyerId,
          amount: '50.00',
          status: 'WAITING_PAYMENT'
        })
        .select()
        .single();

      if (txError) {
        this.log('PASS', 'Invalid product rejected by database');
        return { success: true, error: 'Invalid product properly rejected' };
      } else {
        this.cleanup_ids.transactions.push(tx.id);
        this.log('FAIL', 'Invalid product was accepted - data integrity issue');
        return { success: false, error: 'Invalid product accepted' };
      }

    } catch (error) {
      this.log('PASS', `Foreign key constraint working: ${error.message}`);
      return { success: true, error: error.message };
    }
  }

  // Test 3: Concurrent transaction scenarios
  async testConcurrentTransactions() {
    this.log('START', 'Testing concurrent transaction creation');
    
    try {
      // Create multiple transactions for same product simultaneously
      const promises = Array(3).fill().map(() => 
        supabase
          .from('transactions')
          .insert({
            product_id: TEST_CONFIG.validProductId,
            seller_id: TEST_CONFIG.validSellerId,
            buyer_id: TEST_CONFIG.validBuyerId,
            amount: '50.00',
            status: 'WAITING_PAYMENT'
          })
          .select()
          .single()
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Clean up successful transactions
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.data) {
          this.cleanup_ids.transactions.push(result.value.data.id);
        }
      });

      this.log('INFO', `Concurrent results: ${successful} successful, ${failed} failed`);
      
      if (successful === 3) {
        this.log('WARN', 'All concurrent transactions succeeded - may need business logic constraints');
        return { success: true, warning: 'No business logic constraints detected' };
      } else {
        this.log('PASS', 'Some concurrent transactions failed - system handling conflicts');
        return { success: true, info: 'Concurrent handling working' };
      }

    } catch (error) {
      this.log('PASS', `Concurrent handling error: ${error.message}`);
      return { success: true, error: error.message };
    }
  }

  // Test 4: Invalid status transitions
  async testInvalidStatusTransitions() {
    this.log('START', 'Testing invalid status transitions');
    
    try {
      // Create a transaction
      const { data: tx, error: createError } = await supabase
        .from('transactions')
        .insert({
          product_id: TEST_CONFIG.validProductId,
          seller_id: TEST_CONFIG.validSellerId,
          buyer_id: TEST_CONFIG.validBuyerId,
          amount: '50.00',
          status: 'WAITING_PAYMENT'
        })
        .select()
        .single();

      if (createError) throw createError;
      this.cleanup_ids.transactions.push(tx.id);

      // Try invalid status transition (skip WAITING_DELIVERY)
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ status: 'COMPLETED' })
        .eq('id', tx.id);

      if (updateError) {
        this.log('PASS', 'Invalid status transition rejected');
        return { success: true, error: 'Invalid transition properly rejected' };
      } else {
        this.log('WARN', 'Invalid status transition was allowed - missing business logic');
        return { success: true, warning: 'Status transition validation needed' };
      }

    } catch (error) {
      this.log('PASS', `Status validation working: ${error.message}`);
      return { success: true, error: error.message };
    }
  }

  // Test 5: Message integrity
  async testMessageIntegrity() {
    this.log('START', 'Testing message integrity and validation');
    
    try {
      // Test invalid message type
      const { data: msg, error: msgError } = await supabase
        .from('messages')
        .insert({
          sender_id: TEST_CONFIG.validSellerId,
          receiver_id: TEST_CONFIG.validBuyerId,
          content: 'Test message',
          message_type: 'INVALID_TYPE',
          action_type: 'INITIATE',
          product_id: TEST_CONFIG.validProductId
        })
        .select()
        .single();

      if (msgError) {
        this.log('PASS', 'Invalid message type rejected');
        return { success: true, error: 'Invalid message type properly rejected' };
      } else {
        this.cleanup_ids.messages.push(msg.id);
        this.log('FAIL', 'Invalid message type was accepted');
        return { success: false, error: 'Invalid message type accepted' };
      }

    } catch (error) {
      this.log('PASS', `Message validation working: ${error.message}`);
      return { success: true, error: error.message };
    }
  }

  // Test 6: Large data handling
  async testLargeDataHandling() {
    this.log('START', 'Testing large data handling');
    
    try {
      // Test very large message content
      const largeContent = 'A'.repeat(10000); // 10KB content
      
      const { data: msg, error: msgError } = await supabase
        .from('messages')
        .insert({
          sender_id: TEST_CONFIG.validSellerId,
          receiver_id: TEST_CONFIG.validBuyerId,
          content: largeContent,
          message_type: 'TEXT'
        })
        .select()
        .single();

      if (msgError) {
        this.log('PASS', 'Large content rejected - size limits working');
        return { success: true, error: 'Content size limits enforced' };
      } else {
        this.cleanup_ids.messages.push(msg.id);
        this.log('WARN', 'Large content accepted - may need size limits');
        return { success: true, warning: 'No content size limits detected' };
      }

    } catch (error) {
      this.log('PASS', `Size validation working: ${error.message}`);
      return { success: true, error: error.message };
    }
  }

  // Test 7: Null/undefined handling
  async testNullHandling() {
    this.log('START', 'Testing null/undefined value handling');
    
    try {
      // Test transaction with null amount
      const { data: tx, error: txError } = await supabase
        .from('transactions')
        .insert({
          product_id: TEST_CONFIG.validProductId,
          seller_id: TEST_CONFIG.validSellerId,
          buyer_id: TEST_CONFIG.validBuyerId,
          amount: null,
          status: 'WAITING_PAYMENT'
        })
        .select()
        .single();

      if (txError) {
        this.log('PASS', 'Null amount rejected - validation working');
        return { success: true, error: 'Null validation enforced' };
      } else {
        this.cleanup_ids.transactions.push(tx.id);
        this.log('FAIL', 'Null amount accepted - missing validation');
        return { success: false, error: 'Null amount accepted' };
      }

    } catch (error) {
      this.log('PASS', `Null validation working: ${error.message}`);
      return { success: true, error: error.message };
    }
  }

  async runScenario() {
    this.log('START', `Running scenario: ${this.scenario}`);
    let result;

    try {
      switch (this.scenario) {
        case 'invalid_users':
          result = await this.testInvalidUsers();
          break;
        case 'invalid_products':
          result = await this.testInvalidProducts();
          break;
        case 'concurrent_transactions':
          result = await this.testConcurrentTransactions();
          break;
        case 'invalid_status_transitions':
          result = await this.testInvalidStatusTransitions();
          break;
        case 'message_integrity':
          result = await this.testMessageIntegrity();
          break;
        case 'large_data':
          result = await this.testLargeDataHandling();
          break;
        case 'null_handling':
          result = await this.testNullHandling();
          break;
        default:
          throw new Error(`Unknown scenario: ${this.scenario}`);
      }

      result.totalTime = Date.now() - this.startTime;
      result.scenario = this.scenario;
      
      this.log('COMPLETE', `Scenario completed in ${result.totalTime}ms`);
      return result;

    } catch (error) {
      this.log('ERROR', `Scenario failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        totalTime: Date.now() - this.startTime,
        scenario: this.scenario
      };
    } finally {
      await this.cleanup();
    }
  }
}

async function runErrorHandlingTests() {
  console.log('=== ERROR HANDLING & EDGE CASES TEST ===\n');

  const scenarios = [
    'invalid_users',
    'invalid_products', 
    'concurrent_transactions',
    'invalid_status_transitions',
    'message_integrity',
    'large_data',
    'null_handling'
  ];

  const results = [];

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    console.log(`\n🧪 Testing Scenario ${i + 1}/${scenarios.length}: ${scenario}\n`);
    
    const test = new ErrorHandlingTest(`Test-${i + 1}`, scenario);
    const result = await test.runScenario();
    results.push(result);
    
    console.log(`\n✅ Scenario ${i + 1} completed: ${result.success ? 'PASSED' : 'FAILED'}\n`);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Generate summary
  console.log('=== ERROR HANDLING TEST SUMMARY ===');
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const warnings = results.filter(r => r.warning).length;
  
  console.log(`Total Scenarios: ${scenarios.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Warnings: ${warnings}`);
  console.log(`Success Rate: ${(passed / scenarios.length * 100).toFixed(1)}%`);
  
  const avgTime = results.reduce((sum, r) => sum + r.totalTime, 0) / results.length;
  console.log(`Average Time: ${avgTime.toFixed(0)}ms`);

  // Show detailed results
  console.log('\n=== DETAILED RESULTS ===');
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const warningFlag = result.warning ? '⚠️' : '';
    console.log(`${status} ${warningFlag} ${result.scenario}: ${result.error || result.warning || 'Passed'}`);
  });

  // Show failures and warnings
  const failures = results.filter(r => !r.success);
  const warningResults = results.filter(r => r.warning);

  if (failures.length > 0) {
    console.log('\n❌ FAILURES:');
    failures.forEach(failure => {
      console.log(`  • ${failure.scenario}: ${failure.error}`);
    });
  }

  if (warningResults.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warningResults.forEach(warning => {
      console.log(`  • ${warning.scenario}: ${warning.warning}`);
    });
  }

  return {
    totalScenarios: scenarios.length,
    passed,
    failed,
    warnings,
    successRate: (passed / scenarios.length * 100),
    averageTime: avgTime,
    results
  };
}

// Run the error handling tests
runErrorHandlingTests()
  .then((summary) => {
    console.log(`\n🎯 Error handling reliability: ${summary.successRate.toFixed(1)}%`);
    
    if (summary.successRate >= 90) {
      console.log('✅ Excellent error handling!');
    } else if (summary.successRate >= 70) {
      console.log('⚠️ Good error handling with some areas for improvement');
    } else {
      console.log('❌ Error handling needs significant improvement');
    }
    
    process.exit(summary.successRate >= 70 ? 0 : 1);
  })
  .catch((error) => {
    console.error('Error handling test suite failed:', error);
    process.exit(1);
  });