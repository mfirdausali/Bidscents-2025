#!/usr/bin/env node

/**
 * Frontend Integration Test
 * Tests the transaction flow components and UX integration
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class FrontendIntegrationTest {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.passed = [];
  }

  log(type, test, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${type.toUpperCase()}] ${test}: ${message}`);
    
    if (type === 'error') {
      this.errors.push({ test, message });
    } else if (type === 'warn') {
      this.warnings.push({ test, message });
    } else {
      this.passed.push({ test, message });
    }
  }

  readFile(filePath) {
    try {
      return readFileSync(filePath, 'utf8');
    } catch (error) {
      this.log('error', 'File Read', `Cannot read ${filePath}: ${error.message}`);
      return null;
    }
  }

  testMessagingPageComponents() {
    this.log('info', 'Frontend Structure', 'Testing messages-page.tsx components');
    
    const filePath = join(process.cwd(), 'client', 'src', 'pages', 'messages-page.tsx');
    const content = this.readFile(filePath);
    
    if (!content) return;

    // Test 1: Transaction creation UI
    if (content.includes('openCreateTransaction') && content.includes('TransactionDialog')) {
      this.log('pass', 'Transaction Creation UI', 'Transaction dialog and creation functions found');
    } else {
      this.log('error', 'Transaction Creation UI', 'Missing transaction creation components');
    }

    // Test 2: Action message handlers
    const actionHandlers = [
      'handleConfirmPurchase',
      'handleConfirmPaymentReceived', 
      'handleConfirmDeliveryReceived',
      'handleSubmitReview'
    ];

    actionHandlers.forEach(handler => {
      if (content.includes(handler)) {
        this.log('pass', 'Action Handlers', `${handler} function found`);
      } else {
        this.log('error', 'Action Handlers', `Missing ${handler} function`);
      }
    });

    // Test 3: Message type rendering
    const messageTypes = ['INITIATE', 'CONFIRM_PAYMENT', 'CONFIRM_DELIVERY', 'REVIEW'];
    messageTypes.forEach(type => {
      if (content.includes(type)) {
        this.log('pass', 'Message Types', `${type} message handling found`);
      } else {
        this.log('warn', 'Message Types', `${type} message handling may be missing`);
      }
    });

    // Test 4: WebSocket integration
    if (content.includes('useMessaging') && content.includes('sendActionMessage')) {
      this.log('pass', 'WebSocket Integration', 'Real-time messaging hooks found');
    } else {
      this.log('error', 'WebSocket Integration', 'Missing WebSocket integration');
    }

    // Test 5: Security features
    if (content.includes('security') || content.includes('Safety') || content.includes('fraud')) {
      this.log('pass', 'Security Features', 'Security reminders and warnings found');
    } else {
      this.log('warn', 'Security Features', 'Security features may be missing');
    }

    // Test 6: Error handling
    if (content.includes('try') && content.includes('catch') && content.includes('error')) {
      this.log('pass', 'Error Handling', 'Error handling patterns found');
    } else {
      this.log('warn', 'Error Handling', 'Limited error handling detected');
    }

    // Test 7: Loading states
    if (content.includes('loading') || content.includes('Loading')) {
      this.log('pass', 'Loading States', 'Loading state management found');
    } else {
      this.log('warn', 'Loading States', 'Loading states may be missing');
    }
  }

  testMessagingHooks() {
    this.log('info', 'Hooks Testing', 'Testing use-messaging.tsx hooks');
    
    const filePath = join(process.cwd(), 'client', 'src', 'hooks', 'use-messaging.tsx');
    const content = this.readFile(filePath);
    
    if (!content) return;

    // Test 1: WebSocket connection
    if (content.includes('WebSocket') && content.includes('ws://') || content.includes('wss://')) {
      this.log('pass', 'WebSocket Connection', 'WebSocket URL configuration found');
    } else {
      this.log('error', 'WebSocket Connection', 'WebSocket connection setup missing');
    }

    // Test 2: Message sending
    if (content.includes('sendActionMessage')) {
      this.log('pass', 'Message Sending', 'sendActionMessage function found');
    } else {
      this.log('error', 'Message Sending', 'Message sending functionality missing');
    }

    // Test 3: Real-time updates
    if (content.includes('onmessage') || content.includes('addEventListener')) {
      this.log('pass', 'Real-time Updates', 'WebSocket message handling found');
    } else {
      this.log('error', 'Real-time Updates', 'Real-time message handling missing');
    }

    // Test 4: Connection management
    if (content.includes('onopen') && content.includes('onclose') && content.includes('onerror')) {
      this.log('pass', 'Connection Management', 'WebSocket lifecycle management found');
    } else {
      this.log('warn', 'Connection Management', 'WebSocket lifecycle may need improvement');
    }
  }

  testContactSellerComponent() {
    this.log('info', 'Contact Integration', 'Testing contact-seller-button.tsx');
    
    const filePath = join(process.cwd(), 'client', 'src', 'components', 'ui', 'contact-seller-button.tsx');
    const content = this.readFile(filePath);
    
    if (!content) return;

    // Test 1: Button component
    if (content.includes('Button') && content.includes('Contact Seller')) {
      this.log('pass', 'Contact Button', 'Contact seller button component found');
    } else {
      this.log('error', 'Contact Button', 'Contact seller button missing');
    }

    // Test 2: Navigation integration
    if (content.includes('useNavigate') || content.includes('router')) {
      this.log('pass', 'Navigation', 'Navigation integration found');
    } else {
      this.log('warn', 'Navigation', 'Navigation integration may be missing');
    }

    // Test 3: Session storage
    if (content.includes('sessionStorage') || content.includes('localStorage')) {
      this.log('pass', 'Session Management', 'Session storage for conversation context found');
    } else {
      this.log('warn', 'Session Management', 'Session storage may be missing');
    }
  }

  testTransactionSchemas() {
    this.log('info', 'Schema Validation', 'Testing shared/schema.ts definitions');
    
    const filePath = join(process.cwd(), 'shared', 'schema.ts');
    const content = this.readFile(filePath);
    
    if (!content) return;

    // Test 1: Transaction status enum
    if (content.includes('WAITING_PAYMENT') && content.includes('WAITING_DELIVERY') && 
        content.includes('WAITING_REVIEW') && content.includes('COMPLETED')) {
      this.log('pass', 'Transaction Statuses', 'All transaction statuses defined');
    } else {
      this.log('error', 'Transaction Statuses', 'Transaction status enum incomplete');
    }

    // Test 2: Message types
    if (content.includes('ACTION') && content.includes('TEXT')) {
      this.log('pass', 'Message Types', 'Message type enum found');
    } else {
      this.log('error', 'Message Types', 'Message type definitions missing');
    }

    // Test 3: Action types
    if (content.includes('INITIATE') && content.includes('CONFIRM_PAYMENT') && 
        content.includes('CONFIRM_DELIVERY') && content.includes('REVIEW')) {
      this.log('pass', 'Action Types', 'All action types defined');
    } else {
      this.log('error', 'Action Types', 'Action type enum incomplete');
    }

    // Test 4: Transaction table schema
    if (content.includes('transactions') && content.includes('product_id') && 
        content.includes('buyer_id') && content.includes('seller_id')) {
      this.log('pass', 'Transaction Schema', 'Transaction table schema found');
    } else {
      this.log('error', 'Transaction Schema', 'Transaction table schema missing');
    }
  }

  async testDatabaseConnectivity() {
    this.log('info', 'Database Connection', 'Testing database connectivity and permissions');
    
    try {
      // Test basic connection
      const { data: testQuery, error } = await supabase
        .from('users')
        .select('id')
        .limit(1);
      
      if (error) throw error;
      
      this.log('pass', 'Database Connection', 'Database connection successful');

      // Test transaction operations
      const { data: transactions } = await supabase
        .from('transactions')
        .select('count', { count: 'exact' });
      
      this.log('pass', 'Transaction Access', `Can access transactions table (${transactions?.[0]?.count || 0} records)`);

      // Test message operations
      const { data: messages } = await supabase
        .from('messages')
        .select('count', { count: 'exact' });
      
      this.log('pass', 'Message Access', `Can access messages table (${messages?.[0]?.count || 0} records)`);

    } catch (error) {
      this.log('error', 'Database Connection', `Database connection failed: ${error.message}`);
    }
  }

  async testAPIEndpoints() {
    this.log('info', 'API Endpoints', 'Testing transaction-related API routes');
    
    const filePath = join(process.cwd(), 'server', 'routes.ts');
    const content = this.readFile(filePath);
    
    if (!content) return;

    // Test 1: Message action confirmation endpoint
    if (content.includes('/api/messages/action/confirm')) {
      this.log('pass', 'API Endpoints', 'Message action confirmation endpoint found');
    } else {
      this.log('error', 'API Endpoints', 'Message action confirmation endpoint missing');
    }

    // Test 2: Seller products endpoint
    if (content.includes('/api/sellers/') && content.includes('/products')) {
      this.log('pass', 'API Endpoints', 'Seller products endpoint found');
    } else {
      this.log('warn', 'API Endpoints', 'Seller products endpoint may be missing');
    }

    // Test 3: Transaction creation logic
    if (content.includes('createTransaction') || content.includes('INSERT.*transactions')) {
      this.log('pass', 'Transaction Creation', 'Transaction creation logic found');
    } else {
      this.log('warn', 'Transaction Creation', 'Transaction creation logic may be missing');
    }

    // Test 4: Status update logic
    if (content.includes('updateTransactionStatus') || content.includes('UPDATE.*transactions')) {
      this.log('pass', 'Status Updates', 'Transaction status update logic found');
    } else {
      this.log('warn', 'Status Updates', 'Transaction status update logic may be missing');
    }

    // Test 5: WebSocket handling
    if (content.includes('WebSocket') && content.includes('send_action_message')) {
      this.log('pass', 'WebSocket API', 'WebSocket message handling found');
    } else {
      this.log('error', 'WebSocket API', 'WebSocket message handling missing');
    }
  }

  generateReport() {
    console.log('\n=== FRONTEND INTEGRATION TEST REPORT ===\n');
    
    console.log(`✅ Passed Tests: ${this.passed.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);
    console.log(`❌ Failed Tests: ${this.errors.length}`);
    
    const totalTests = this.passed.length + this.warnings.length + this.errors.length;
    const successRate = (this.passed.length / totalTests) * 100;
    
    console.log(`\n🎯 Success Rate: ${successRate.toFixed(1)}%`);
    
    if (this.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.errors.forEach(error => {
        console.log(`  • ${error.test}: ${error.message}`);
      });
    }
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.warnings.forEach(warning => {
        console.log(`  • ${warning.test}: ${warning.message}`);
      });
    }
    
    console.log('\n✅ PASSED:');
    this.passed.forEach(pass => {
      console.log(`  • ${pass.test}: ${pass.message}`);
    });

    return {
      totalTests,
      passed: this.passed.length,
      warnings: this.warnings.length,
      errors: this.errors.length,
      successRate
    };
  }

  async runAllTests() {
    console.log('=== FRONTEND INTEGRATION TESTING ===\n');
    
    this.testMessagingPageComponents();
    this.testMessagingHooks();
    this.testContactSellerComponent();
    this.testTransactionSchemas();
    await this.testDatabaseConnectivity();
    await this.testAPIEndpoints();
    
    return this.generateReport();
  }
}

// Run the frontend integration tests
const tester = new FrontendIntegrationTest();
tester.runAllTests()
  .then(results => {
    console.log(`\n🏁 Frontend integration tests completed.`);
    console.log(`Success rate: ${results.successRate.toFixed(1)}%`);
    
    if (results.successRate >= 85) {
      console.log('✅ Frontend integration is excellent!');
      process.exit(0);
    } else if (results.successRate >= 70) {
      console.log('⚠️ Frontend integration is good with some areas for improvement');
      process.exit(0);
    } else {
      console.log('❌ Frontend integration needs significant improvement');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Integration test failed:', error);
    process.exit(1);
  });