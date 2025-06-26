#!/usr/bin/env node

/**
 * Utility to create test featured products for testing the expiration system
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createTestFeaturedProducts() {
  console.log('🧪 Creating test featured products for testing...')
  
  try {
    // Get some regular products to make featured
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, status')
      .eq('status', 'active')
      .limit(5)

    if (error) {
      console.error('Error fetching products:', error)
      return
    }

    if (!products || products.length === 0) {
      console.log('No active products found to make featured')
      return
    }

    console.log(`📋 Found ${products.length} products to make featured`)

    // Create featured products with different expiration times for testing
    const now = new Date()
    const updates = [
      {
        id: products[0].id,
        name: products[0].name,
        featured_until: new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString(), // 1 hour from now
        duration: '1 hour'
      },
      {
        id: products[1].id,
        name: products[1].name,
        featured_until: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        duration: '24 hours'
      },
      {
        id: products[2].id,
        name: products[2].name,
        featured_until: new Date(now.getTime() + 5 * 60 * 1000).toISOString(), // 5 minutes from now (for quick testing)
        duration: '5 minutes'
      }
    ]

    // Update products to featured status
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('products')
        .update({
          is_featured: true,
          status: 'featured',
          featured_until: update.featured_until,
          featured_at: now.toISOString(),
          featured_duration_hours: update.duration === '5 minutes' ? 0.083 : (update.duration === '1 hour' ? 1 : 24)
        })
        .eq('id', update.id)

      if (updateError) {
        console.error(`❌ Error updating product ${update.id}:`, updateError)
      } else {
        console.log(`✅ Made product ${update.id} (${update.name}) featured for ${update.duration}`)
        console.log(`   Expires at: ${update.featured_until}`)
      }
    }

    // Verify the updates
    console.log('\n🔍 Verifying featured products...')
    const { data: featuredProducts, error: verifyError } = await supabase
      .from('products')
      .select('id, name, is_featured, status, featured_until')
      .eq('status', 'featured')

    if (verifyError) {
      console.error('Error verifying featured products:', verifyError)
    } else {
      console.log(`📊 Total featured products: ${featuredProducts?.length || 0}`)
      featuredProducts?.forEach(product => {
        const expiresIn = new Date(product.featured_until).getTime() - now.getTime()
        const minutesLeft = Math.round(expiresIn / 60000)
        console.log(`   - ${product.name} (ID: ${product.id}) expires in ${minutesLeft} minutes`)
      })
    }

    console.log('\n🎯 Test plan:')
    console.log('1. Wait 5 minutes and the first product should expire')
    console.log('2. Check logs for expiration process')
    console.log('3. Verify featured products count decreases')
    console.log('4. The 1-hour and 24-hour products should remain featured')

  } catch (error) {
    console.error('Error creating test featured products:', error)
  }
}

createTestFeaturedProducts()