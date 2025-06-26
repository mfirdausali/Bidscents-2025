import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkFeaturedProducts() {
  console.log('Checking featured products...\n');
  
  try {
    // Get all featured products
    const { data: featuredProducts, error } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'featured')
      .order('featured_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching featured products:', error);
      return;
    }
    
    console.log(`Found ${featuredProducts.length} featured products:\n`);
    
    featuredProducts.forEach((product, index) => {
      console.log(`${index + 1}. ID: ${product.id}, Name: ${product.name}`);
      console.log(`   Status: ${product.status}, Featured At: ${product.featured_at}`);
      console.log(`   Price: RM ${product.price}`);
      console.log('');
    });
    
    // Check if there's an odd number
    if (featuredProducts.length % 2 !== 0) {
      console.log('⚠️  WARNING: Odd number of featured products detected!');
      console.log('This would have caused the last product to appear twice in the carousel.');
      console.log('The fix has been implemented to handle this case properly.\n');
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkFeaturedProducts();