#!/usr/bin/env node

/**
 * Test script to check Supabase schema and column names
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkProductsSchema() {
  console.log('🔍 Checking Supabase products table schema...')
  
  try {
    // Get one product to see the actual column names
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .limit(1)

    if (error) {
      console.error('Error fetching product:', error)
      return
    }

    if (data && data.length > 0) {
      console.log('📋 Product table columns:')
      Object.keys(data[0]).forEach(column => {
        console.log(`   - ${column}: ${typeof data[0][column]} = ${data[0][column]}`)
      })
    }

    // Also check specifically for featured products
    console.log('\n🔍 Checking featured product fields...')
    const { data: featured, error: featuredError } = await supabase
      .from('products')
      .select('id, name, is_featured, featured_until, status, created_at, updated_at')
      .eq('status', 'featured')
      .limit(3)

    if (featuredError) {
      console.error('Error fetching featured products:', featuredError)
    } else {
      console.log(`📊 Found ${featured?.length || 0} featured products:`)
      featured?.forEach(product => {
        console.log(`   - ID ${product.id}: ${product.name}`)
        console.log(`     Status: ${product.status}, Featured: ${product.is_featured}`)
        console.log(`     Featured Until: ${product.featured_until}`)
        console.log(`     Created: ${product.created_at}`)
        console.log(`     Updated: ${product.updated_at}`)
        console.log('')
      })
    }

  } catch (error) {
    console.error('Error checking schema:', error)
  }
}

checkProductsSchema()