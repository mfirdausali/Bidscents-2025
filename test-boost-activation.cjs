require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testBoostActivation() {
  console.log('🧪 Testing Boost Activation Function');
  console.log('====================================');

  try {
    // Find a product to test with
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id, name, is_featured, status, seller_id')
      .eq('status', 'active')
      .limit(1);

    if (productError) {
      console.error('❌ Error fetching products:', productError);
      return;
    }

    if (!products || products.length === 0) {
      console.log('⚠️ No active products found to test with');
      return;
    }

    const testProduct = products[0];
    console.log('🎯 Testing with product:', testProduct);

    // Simulate boost activation for 24 hours
    const durationHours = 24;
    const currentTime = new Date();
    const expirationTime = new Date(currentTime.getTime() + (durationHours * 60 * 60 * 1000));

    console.log(`⏰ Activating boost for ${durationHours} hours`);
    console.log(`📅 From: ${currentTime.toISOString()}`);
    console.log(`📅 Until: ${expirationTime.toISOString()}`);

    // Update product with boost activation
    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update({
        is_featured: true,
        featured_at: currentTime.toISOString(),
        featured_until: expirationTime.toISOString(),
        featured_duration_hours: durationHours,
        status: 'featured',
        updated_at: currentTime.toISOString()
      })
      .eq('id', testProduct.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating product:', updateError);
      return;
    }

    console.log('✅ Product boost activation successful!');
    console.log('Updated product:', JSON.stringify(updatedProduct, null, 2));

    // Verify the product appears in featured products
    const { data: featuredProducts, error: featuredError } = await supabase
      .from('products')
      .select('id, name, is_featured, status, featured_until')
      .eq('is_featured', true)
      .eq('id', testProduct.id);

    if (featuredError) {
      console.error('❌ Error fetching featured products:', featuredError);
      return;
    }

    if (featuredProducts && featuredProducts.length > 0) {
      console.log('🌟 Product successfully appears in featured products!');
      console.log('Featured product details:', featuredProducts[0]);
    } else {
      console.log('❌ Product not found in featured products');
    }

    console.log('🎉 BOOST ACTIVATION TEST COMPLETED SUCCESSFULLY!');

  } catch (error) {
    console.error('❌ Boost activation test failed:', error);
  }
}

testBoostActivation();