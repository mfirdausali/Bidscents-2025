#!/usr/bin/env node

/**
 * End-to-End Transaction Flow Simulation
 * Tests the complete transaction lifecycle from seller initiation to completion
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test configuration
const TEST_CONFIG = {
  sellerId: 32, // Admin user as seller
  buyerId: 34,  // Test buyer
  productId: 138, // Test product "The Moon"
  testRuns: 5,  // Number of simulation runs
  delayBetweenSteps: 1000, // 1 second delay between steps
};

class TransactionSimulator {
  constructor(testId, sellerId, buyerId, productId) {
    this.testId = testId;
    this.sellerId = sellerId;
    this.buyerId = buyerId;
    this.productId = productId;
    this.conversationId = null;
    this.transactionId = null;
    this.messageIds = [];
    this.startTime = Date.now();
    this.stepTimes = {};
  }

  log(step, message, data = null) {
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    console.log(`[Test ${this.testId}] [${elapsed}ms] ${step}: ${message}`);
    if (data) {
      console.log(`[Test ${this.testId}] Data:`, JSON.stringify(data, null, 2));
    }
    this.stepTimes[step] = elapsed;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async step1_CreateConversation() {
    this.log('STEP 1', 'Creating conversation between buyer and seller');
    
    try {
      // Check if conversation already exists
      const { data: existingConversation, error: searchError } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(user1_id.eq.${this.sellerId},user2_id.eq.${this.buyerId}),and(user1_id.eq.${this.buyerId},user2_id.eq.${this.sellerId})`)
        .single();

      if (existingConversation) {
        this.conversationId = existingConversation.id;
        this.log('STEP 1', `Using existing conversation ID: ${this.conversationId}`);
      } else {
        // Create new conversation
        const { data: conversation, error } = await supabase
          .from('conversations')
          .insert({
            user1_id: this.sellerId,
            user2_id: this.buyerId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) throw error;

        this.conversationId = conversation.id;
        this.log('STEP 1', `Created new conversation ID: ${this.conversationId}`);
      }

      return { success: true, conversationId: this.conversationId };
    } catch (error) {
      this.log('STEP 1', `ERROR: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  async step2_SellerInitiatesTransaction() {
    this.log('STEP 2', 'Seller initiates transaction (INITIATE action)');
    
    try {
      // Create INITIATE action message
      const { data: message, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: this.conversationId,
          sender_id: this.sellerId,
          content: `Transaction initiated for product ${this.productId}`,
          message_type: 'ACTION',
          action_type: 'INITIATE',
          product_id: this.productId,
          is_clicked: false,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      this.messageIds.push(message.id);
      this.log('STEP 2', `Created INITIATE message ID: ${message.id}`);

      return { success: true, messageId: message.id };
    } catch (error) {
      this.log('STEP 2', `ERROR: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  async step3_BuyerConfirmsPurchase() {
    this.log('STEP 3', 'Buyer confirms purchase');
    
    try {
      const initiateMessageId = this.messageIds[this.messageIds.length - 1];
      
      // Simulate API call to confirm purchase
      const response = await fetch(`http://localhost:3001/api/messages/action/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer mock-buyer-token` // Mock auth
        },
        body: JSON.stringify({
          messageId: initiateMessageId,
          productId: this.productId,
          actionType: 'INITIATE'
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Purchase confirmation failed');
      }

      // Check if transaction was created
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('product_id', this.productId)
        .eq('buyer_id', this.buyerId)
        .eq('seller_id', this.sellerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (transaction) {
        this.transactionId = transaction.id;
        this.log('STEP 3', `Transaction created with ID: ${this.transactionId}, Status: ${transaction.status}`);
      }

      // Update message click state
      await supabase
        .from('messages')
        .update({ is_clicked: true })
        .eq('id', initiateMessageId);

      return { success: true, transactionId: this.transactionId };
    } catch (error) {
      this.log('STEP 3', `ERROR: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  async step4_SellerConfirmsPayment() {
    this.log('STEP 4', 'Seller confirms payment received');
    
    try {
      // Create CONFIRM_PAYMENT action message
      const { data: message, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: this.conversationId,
          sender_id: this.sellerId,
          content: `Payment confirmation for transaction ${this.transactionId}`,
          message_type: 'ACTION',
          action_type: 'CONFIRM_PAYMENT',
          product_id: this.productId,
          is_clicked: false,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      const paymentMessageId = message.id;
      this.messageIds.push(paymentMessageId);

      // Simulate API call to confirm payment
      const response = await fetch(`http://localhost:3001/api/messages/action/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer mock-seller-token`
        },
        body: JSON.stringify({
          messageId: paymentMessageId,
          productId: this.productId,
          actionType: 'CONFIRM_PAYMENT'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Payment confirmation failed');
      }

      // Verify transaction status update
      const { data: updatedTransaction } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', this.transactionId)
        .single();

      this.log('STEP 4', `Payment confirmed. Transaction status: ${updatedTransaction?.status || 'unknown'}`);

      return { success: true, status: updatedTransaction?.status };
    } catch (error) {
      this.log('STEP 4', `ERROR: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  async step5_BuyerConfirmsDelivery() {
    this.log('STEP 5', 'Buyer confirms delivery received');
    
    try {
      // Create CONFIRM_DELIVERY action message
      const { data: message, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: this.conversationId,
          sender_id: this.buyerId,
          content: `Delivery confirmation for transaction ${this.transactionId}`,
          message_type: 'ACTION',
          action_type: 'CONFIRM_DELIVERY',
          product_id: this.productId,
          is_clicked: false,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      const deliveryMessageId = message.id;
      this.messageIds.push(deliveryMessageId);

      // Simulate API call to confirm delivery
      const response = await fetch(`http://localhost:3001/api/messages/action/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer mock-buyer-token`
        },
        body: JSON.stringify({
          messageId: deliveryMessageId,
          productId: this.productId,
          actionType: 'CONFIRM_DELIVERY'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delivery confirmation failed');
      }

      // Verify transaction status update
      const { data: updatedTransaction } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', this.transactionId)
        .single();

      this.log('STEP 5', `Delivery confirmed. Transaction status: ${updatedTransaction?.status || 'unknown'}`);

      return { success: true, status: updatedTransaction?.status };
    } catch (error) {
      this.log('STEP 5', `ERROR: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  async step6_BuyerSubmitsReview() {
    this.log('STEP 6', 'Buyer submits review');
    
    try {
      const rating = 4.5; // Test rating
      const comment = `Test review for transaction ${this.transactionId} - ${new Date().toISOString()}`;

      // Create REVIEW action message
      const { data: message, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: this.conversationId,
          sender_id: this.buyerId,
          content: comment,
          message_type: 'ACTION',
          action_type: 'REVIEW',
          product_id: this.productId,
          is_clicked: false,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      const reviewMessageId = message.id;
      this.messageIds.push(reviewMessageId);

      // Simulate API call to submit review
      const response = await fetch(`http://localhost:3001/api/messages/action/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer mock-buyer-token`
        },
        body: JSON.stringify({
          messageId: reviewMessageId,
          productId: this.productId,
          actionType: 'REVIEW',
          rating: rating,
          comment: comment
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Review submission failed');
      }

      // Verify final transaction status
      const { data: finalTransaction } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', this.transactionId)
        .single();

      this.log('STEP 6', `Review submitted. Final transaction status: ${finalTransaction?.status || 'unknown'}`);

      return { success: true, status: finalTransaction?.status, rating, comment };
    } catch (error) {
      this.log('STEP 6', `ERROR: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  async cleanup() {
    this.log('CLEANUP', 'Cleaning up test data');
    
    try {
      // Delete test messages
      if (this.messageIds.length > 0) {
        await supabase
          .from('messages')
          .delete()
          .in('id', this.messageIds);
        this.log('CLEANUP', `Deleted ${this.messageIds.length} test messages`);
      }

      // Delete test transaction
      if (this.transactionId) {
        await supabase
          .from('transactions')
          .delete()
          .eq('id', this.transactionId);
        this.log('CLEANUP', `Deleted transaction ${this.transactionId}`);
      }

      // Note: We don't delete the conversation as it might be used for other tests
      
    } catch (error) {
      this.log('CLEANUP', `Warning: Cleanup error: ${error.message}`);
    }
  }

  async runFullSimulation() {
    this.log('START', 'Beginning end-to-end transaction simulation');
    const results = {
      testId: this.testId,
      success: false,
      steps: {},
      totalTime: 0,
      errors: []
    };

    try {
      // Step 1: Create conversation
      results.steps.step1 = await this.step1_CreateConversation();
      if (!results.steps.step1.success) {
        results.errors.push('Step 1 failed: ' + results.steps.step1.error);
        return results;
      }
      await this.delay(TEST_CONFIG.delayBetweenSteps);

      // Step 2: Seller initiates transaction
      results.steps.step2 = await this.step2_SellerInitiatesTransaction();
      if (!results.steps.step2.success) {
        results.errors.push('Step 2 failed: ' + results.steps.step2.error);
        return results;
      }
      await this.delay(TEST_CONFIG.delayBetweenSteps);

      // Step 3: Buyer confirms purchase
      results.steps.step3 = await this.step3_BuyerConfirmsPurchase();
      if (!results.steps.step3.success) {
        results.errors.push('Step 3 failed: ' + results.steps.step3.error);
        return results;
      }
      await this.delay(TEST_CONFIG.delayBetweenSteps);

      // Step 4: Seller confirms payment
      results.steps.step4 = await this.step4_SellerConfirmsPayment();
      if (!results.steps.step4.success) {
        results.errors.push('Step 4 failed: ' + results.steps.step4.error);
        return results;
      }
      await this.delay(TEST_CONFIG.delayBetweenSteps);

      // Step 5: Buyer confirms delivery
      results.steps.step5 = await this.step5_BuyerConfirmsDelivery();
      if (!results.steps.step5.success) {
        results.errors.push('Step 5 failed: ' + results.steps.step5.error);
        return results;
      }
      await this.delay(TEST_CONFIG.delayBetweenSteps);

      // Step 6: Buyer submits review
      results.steps.step6 = await this.step6_BuyerSubmitsReview();
      if (!results.steps.step6.success) {
        results.errors.push('Step 6 failed: ' + results.steps.step6.error);
        return results;
      }

      results.success = true;
      results.totalTime = Date.now() - this.startTime;
      this.log('SUCCESS', `Transaction simulation completed successfully in ${results.totalTime}ms`);

    } catch (error) {
      results.errors.push('Unexpected error: ' + error.message);
      this.log('ERROR', `Simulation failed: ${error.message}`);
    } finally {
      await this.cleanup();
    }

    return results;
  }
}

// Main simulation runner
async function runTransactionSimulations() {
  console.log('=== TRANSACTION END-TO-END SIMULATION ===\n');
  console.log('Configuration:', TEST_CONFIG);
  console.log('\n');

  const allResults = [];
  
  for (let i = 1; i <= TEST_CONFIG.testRuns; i++) {
    console.log(`\n🧪 STARTING TEST RUN ${i}/${TEST_CONFIG.testRuns}\n`);
    
    const simulator = new TransactionSimulator(
      i,
      TEST_CONFIG.sellerId,
      TEST_CONFIG.buyerId,
      TEST_CONFIG.productId
    );
    
    const result = await simulator.runFullSimulation();
    allResults.push(result);
    
    console.log(`\n✅ TEST RUN ${i} COMPLETED\n`);
    
    // Delay between test runs
    if (i < TEST_CONFIG.testRuns) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Generate summary report
  console.log('\n=== SIMULATION SUMMARY REPORT ===\n');
  
  const successfulRuns = allResults.filter(r => r.success).length;
  const failedRuns = allResults.filter(r => !r.success).length;
  const averageTime = allResults.reduce((sum, r) => sum + r.totalTime, 0) / allResults.length;
  
  console.log(`Total Runs: ${TEST_CONFIG.testRuns}`);
  console.log(`Successful: ${successfulRuns} (${(successfulRuns/TEST_CONFIG.testRuns*100).toFixed(1)}%)`);
  console.log(`Failed: ${failedRuns} (${(failedRuns/TEST_CONFIG.testRuns*100).toFixed(1)}%)`);
  console.log(`Average Time: ${averageTime.toFixed(0)}ms`);
  
  if (failedRuns > 0) {
    console.log('\nErrors encountered:');
    allResults.forEach((result, index) => {
      if (!result.success) {
        console.log(`Test ${index + 1}: ${result.errors.join(', ')}`);
      }
    });
  }
  
  console.log('\n=== END SIMULATION ===');
  
  return {
    totalRuns: TEST_CONFIG.testRuns,
    successfulRuns,
    failedRuns,
    successRate: (successfulRuns / TEST_CONFIG.testRuns * 100),
    averageTime,
    results: allResults
  };
}

// Run the simulation
runTransactionSimulations()
  .then((summary) => {
    console.log('\nSimulation completed. Success rate:', summary.successRate.toFixed(1) + '%');
    process.exit(summary.successRate === 100 ? 0 : 1);
  })
  .catch((error) => {
    console.error('Simulation failed:', error);
    process.exit(1);
  });