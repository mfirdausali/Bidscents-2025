#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkAllBoostPurchases() {
  try {
    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error:', error.message);
      return;
    }
    
    console.log('Total payments found:', payments?.length || 0);
    
    // Filter boost-related payments
    const boostPayments = (payments || []).filter(payment => {
      if (!payment.webhook_payload) return false;
      try {
        const payload = JSON.parse(payment.webhook_payload);
        return payload.paymentType === 'boost' || payload.boostOption;
      } catch (e) {
        return false;
      }
    });
    
    console.log('Total boost payments found:', boostPayments.length);
    
    if (boostPayments.length > 0) {
      console.log('\nRecent boost payments:');
      boostPayments.slice(0, 5).forEach((payment, index) => {
        const date = new Date(payment.created_at).toLocaleString();
        console.log(`Payment ${index + 1}:`);
        console.log('  - ID:', payment.id);
        console.log('  - Amount:', payment.amount);
        console.log('  - Status:', payment.status);
        console.log('  - Created:', date);
        console.log('  - User ID:', payment.user_id);
        console.log('  - Product ID:', payment.product_id);
        if (payment.webhook_payload) {
          try {
            const payload = JSON.parse(payment.webhook_payload);
            console.log('  - Payload:', JSON.stringify(payload, null, 4));
          } catch (e) {
            console.log('  - Payload: (invalid JSON)');
          }
        }
        console.log('');
      });
    } else {
      console.log('\nNo boost payments found.');
      console.log('Showing sample payments for reference:');
      payments.slice(0, 2).forEach((payment, index) => {
        const date = new Date(payment.created_at).toLocaleString();
        console.log(`Payment ${index + 1}:`);
        console.log('  - ID:', payment.id);
        console.log('  - Amount:', payment.amount);
        console.log('  - Status:', payment.status);
        console.log('  - Created:', date);
        console.log('  - User ID:', payment.user_id);
        console.log('  - Product ID:', payment.product_id);
        if (payment.webhook_payload) {
          console.log('  - Payload:', payment.webhook_payload.substring(0, 200) + '...');
        }
        console.log('');
      });
    }
  } catch (error) {
    console.error('Exception:', error.message);
  }
}

checkAllBoostPurchases();