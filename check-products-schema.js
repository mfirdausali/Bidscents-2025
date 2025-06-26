#!/usr/bin/env node

/**
 * Check actual products table schema
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load environment variables
const envContent = readFileSync('.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key.trim()] = value.trim().replace(/"/g, '');
  }
});

const supabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function checkProductsSchema() {
  console.log('🔍 Checking actual products table schema...');
  
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }
    
    if (products && products.length > 0) {
      console.log('✅ Products table columns:');
      const columns = Object.keys(products[0]);
      columns.forEach(col => {
        console.log(`   - ${col}`);
      });
    } else {
      console.log('❌ No products found to analyze schema');
    }
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
  }
}

async function checkTargetProduct() {
  console.log('\n🔍 Checking target product (ID: 221)...');
  
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', 221)
      .single();
    
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }
    
    console.log('✅ Product details:');
    Object.entries(product).forEach(([key, value]) => {
      console.log(`   - ${key}: ${value}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkProductsSchema().then(() => checkTargetProduct()).catch(console.error);