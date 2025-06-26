#!/usr/bin/env node

/**
 * Database-level Transaction Flow Test
 * Tests transaction reliability at the database level without requiring server
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_CONFIG = {
  sellerId: 32,
  buyerId: 34,
  productId: 138,
  testRuns: 3
};

class DatabaseTransactionTest {
  constructor(testId) {
    this.testId = testId;
    this.conversationId = null;
    this.transactionId = null;
    this.messageIds = [];
    this.startTime = Date.now();
  }

  log(step, message, data = null) {
    const elapsed = Date.now() - this.startTime;
    console.log(`[Test ${this.testId}] [${elapsed}ms] ${step}: ${message}`);
    if (data) console.log(`[Test ${this.testId}] Data:`, data);
  }

  async testDatabaseTransactionFlow() {
    this.log('START', 'Testing database transaction flow');
    
    try {
      // Note: No conversations table - messages are grouped by sender/receiver
      this.log('STEP 1', 'Using direct messaging (no conversations table)');

      // 1. Create INITIATE message
      const { data: initiateMsg, error: initError } = await supabase
        .from('messages')
        .insert({
          sender_id: TEST_CONFIG.sellerId,
          receiver_id: TEST_CONFIG.buyerId,
          content: `Test transaction initiation`,
          message_type: 'ACTION',
          action_type: 'INITIATE',
          product_id: TEST_CONFIG.productId,
          is_clicked: false
        })
        .select()
        .single();

      if (initError) throw initError;
      this.messageIds.push(initiateMsg.id);
      this.log('STEP 2', `INITIATE message created: ${initiateMsg.id}`);

      // 2. Create transaction (simulate buyer confirmation)
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          product_id: TEST_CONFIG.productId,
          seller_id: TEST_CONFIG.sellerId,
          buyer_id: TEST_CONFIG.buyerId,
          amount: '50.00',
          status: 'WAITING_PAYMENT'
        })
        .select()
        .single();

      if (txError) throw txError;
      this.transactionId = transaction.id;
      this.log('STEP 3', `Transaction created: ${transaction.id} with status ${transaction.status}`);

      // 4. Update to WAITING_DELIVERY (simulate payment confirmation)
      const { error: paymentError } = await supabase
        .from('transactions')
        .update({ 
          status: 'WAITING_DELIVERY',
          updated_at: new Date().toISOString()
        })
        .eq('id', this.transactionId);

      if (paymentError) throw paymentError;
      this.log('STEP 4', 'Transaction status updated to WAITING_DELIVERY');

      // 5. Create payment confirmation message
      const { data: paymentMsg, error: payMsgError } = await supabase
        .from('messages')
        .insert({
          sender_id: TEST_CONFIG.sellerId,
          receiver_id: TEST_CONFIG.buyerId,
          content: `Payment confirmed for transaction ${this.transactionId}`,
          message_type: 'ACTION',
          action_type: 'CONFIRM_PAYMENT',
          product_id: TEST_CONFIG.productId,
          is_clicked: true
        })
        .select()
        .single();

      if (payMsgError) throw payMsgError;
      this.messageIds.push(paymentMsg.id);
      this.log('STEP 5', `CONFIRM_PAYMENT message created: ${paymentMsg.id}`);

      // 6. Update to WAITING_REVIEW (simulate delivery confirmation)
      const { error: deliveryError } = await supabase
        .from('transactions')
        .update({ 
          status: 'WAITING_REVIEW',
          updated_at: new Date().toISOString()
        })
        .eq('id', this.transactionId);

      if (deliveryError) throw deliveryError;
      this.log('STEP 6', 'Transaction status updated to WAITING_REVIEW');

      // 7. Create delivery confirmation message
      const { data: deliveryMsg, error: delMsgError } = await supabase
        .from('messages')
        .insert({
          sender_id: TEST_CONFIG.buyerId,
          receiver_id: TEST_CONFIG.sellerId,
          content: `Delivery confirmed for transaction ${this.transactionId}`,
          message_type: 'ACTION',
          action_type: 'CONFIRM_DELIVERY',
          product_id: TEST_CONFIG.productId,
          is_clicked: true
        })
        .select()
        .single();

      if (delMsgError) throw delMsgError;
      this.messageIds.push(deliveryMsg.id);
      this.log('STEP 7', `CONFIRM_DELIVERY message created: ${deliveryMsg.id}`);

      // 8. Complete transaction with review
      const { error: reviewError } = await supabase
        .from('transactions')
        .update({ 
          status: 'COMPLETED',
          updated_at: new Date().toISOString()
        })
        .eq('id', this.transactionId);

      if (reviewError) throw reviewError;

      // 9. Create review message
      const { data: reviewMsg, error: revMsgError } = await supabase
        .from('messages')
        .insert({
          sender_id: TEST_CONFIG.buyerId,
          receiver_id: TEST_CONFIG.sellerId,
          content: `Excellent transaction! 5 stars.`,
          message_type: 'ACTION',
          action_type: 'REVIEW',
          product_id: TEST_CONFIG.productId,
          is_clicked: true
        })
        .select()
        .single();

      if (revMsgError) throw revMsgError;
      this.messageIds.push(reviewMsg.id);
      this.log('STEP 8', `REVIEW message created: ${reviewMsg.id}`);
      this.log('SUCCESS', 'Transaction completed successfully!');

      // 10. Verify final state
      const { data: finalTransaction } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', this.transactionId)
        .single();

      this.log('VERIFY', `Final transaction status: ${finalTransaction.status}`);

      return {
        success: true,
        transactionId: this.transactionId,
        messageCount: this.messageIds.length,
        finalStatus: finalTransaction.status,
        totalTime: Date.now() - this.startTime
      };

    } catch (error) {
      this.log('ERROR', `Test failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        totalTime: Date.now() - this.startTime
      };
    } finally {
      await this.cleanup();
    }
  }

  async cleanup() {
    this.log('CLEANUP', 'Cleaning up test data');
    
    try {
      // Delete messages
      if (this.messageIds.length > 0) {
        await supabase
          .from('messages')
          .delete()
          .in('id', this.messageIds);
      }

      // Delete transaction
      if (this.transactionId) {
        await supabase
          .from('transactions')
          .delete()
          .eq('id', this.transactionId);
      }

      this.log('CLEANUP', 'Cleanup completed');
    } catch (error) {
      this.log('CLEANUP', `Cleanup warning: ${error.message}`);
    }
  }
}

async function runDatabaseTests() {
  console.log('=== DATABASE TRANSACTION RELIABILITY TEST ===\n');
  
  const results = [];
  let successCount = 0;

  for (let i = 1; i <= TEST_CONFIG.testRuns; i++) {
    console.log(`\n🧪 Running Test ${i}/${TEST_CONFIG.testRuns}\n`);
    
    const test = new DatabaseTransactionTest(i);
    const result = await test.testDatabaseTransactionFlow();
    
    results.push(result);
    if (result.success) successCount++;
    
    console.log(`\n✅ Test ${i} completed: ${result.success ? 'SUCCESS' : 'FAILED'}\n`);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Generate summary
  console.log('=== TEST SUMMARY ===');
  console.log(`Total Tests: ${TEST_CONFIG.testRuns}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${TEST_CONFIG.testRuns - successCount}`);
  console.log(`Success Rate: ${(successCount / TEST_CONFIG.testRuns * 100).toFixed(1)}%`);
  
  const avgTime = results.reduce((sum, r) => sum + r.totalTime, 0) / results.length;
  console.log(`Average Time: ${avgTime.toFixed(0)}ms`);

  // Show failures
  const failures = results.filter(r => !r.success);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach((failure, index) => {
      console.log(`  ${index + 1}. ${failure.error}`);
    });
  }

  return {
    totalTests: TEST_CONFIG.testRuns,
    successful: successCount,
    failed: TEST_CONFIG.testRuns - successCount,
    successRate: (successCount / TEST_CONFIG.testRuns * 100),
    averageTime: avgTime,
    results
  };
}

// Run the tests
runDatabaseTests()
  .then((summary) => {
    console.log(`\n🎯 Database reliability: ${summary.successRate.toFixed(1)}%`);
    
    if (summary.successRate >= 95) {
      console.log('✅ Excellent database reliability!');
    } else if (summary.successRate >= 80) {
      console.log('⚠️ Good database reliability with minor issues');
    } else {
      console.log('❌ Database reliability needs improvement');
    }
    
    process.exit(summary.successRate === 100 ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });