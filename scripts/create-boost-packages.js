/**
 * Create boost packages table in Supabase with correct durations
 * Standard Boost: 15 hours
 * Premium Boost: 36 hours
 */

import { supabase } from '../server/supabase.ts';

async function createBoostPackagesTable() {
  console.log('🚀 Creating boost_packages table in Supabase...');
  
  try {
    // Create the boost_packages table
    const { data: createData, error: createError } = await supabase
      .from('boost_packages')
      .select('*')
      .limit(1);

    // If the table doesn't exist, we need to create it via SQL
    if (createError && createError.message.includes('does not exist')) {
      console.log('📦 Table does not exist, creating boost_packages table...');
      
      // Use a SQL query to create the table
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS boost_packages (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          package_type TEXT NOT NULL,
          item_count INTEGER NOT NULL,
          price INTEGER NOT NULL,
          duration_hours INTEGER NOT NULL,
          effective_price DECIMAL(10, 2),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `;

      const { error: sqlError } = await supabase.rpc('exec_sql', { sql: createTableSQL });
      
      if (sqlError) {
        console.error('❌ Error creating table:', sqlError);
        return false;
      }
      
      console.log('✅ Table created successfully!');
    } else if (createError) {
      console.error('❌ Error checking table:', createError);
      return false;
    } else {
      console.log('✅ Table already exists');
    }

    // Insert boost packages with correct durations
    console.log('📦 Inserting boost packages with correct durations...');
    
    const boostPackages = [
      {
        name: 'Standard Boost (1 Item)',
        package_type: 'standard',
        item_count: 1,
        price: 500, // RM 5.00 in sen
        duration_hours: 15, // 15 hours for Standard
        effective_price: 5.00
      },
      {
        name: 'Standard Boost (3 Items)',
        package_type: 'standard',
        item_count: 3,
        price: 1200, // RM 12.00 in sen
        duration_hours: 15, // 15 hours for Standard
        effective_price: 4.00
      },
      {
        name: 'Premium Boost (1 Item)',
        package_type: 'premium',
        item_count: 1,
        price: 1000, // RM 10.00 in sen
        duration_hours: 36, // 36 hours for Premium
        effective_price: 10.00
      },
      {
        name: 'Premium Boost (3 Items)',
        package_type: 'premium',
        item_count: 3,
        price: 2400, // RM 24.00 in sen
        duration_hours: 36, // 36 hours for Premium
        effective_price: 8.00
      }
    ];

    // First, clear existing packages
    const { error: deleteError } = await supabase
      .from('boost_packages')
      .delete()
      .gte('id', 0);

    if (deleteError) {
      console.log('Note: Could not clear existing packages:', deleteError.message);
    }

    // Insert new packages
    const { data: insertData, error: insertError } = await supabase
      .from('boost_packages')
      .insert(boostPackages)
      .select();

    if (insertError) {
      console.error('❌ Error inserting boost packages:', insertError);
      return false;
    }

    console.log('✅ Boost packages created successfully!');
    console.log('📊 Package Details:');
    insertData.forEach(pkg => {
      console.log(`  - ${pkg.name}: ${pkg.duration_hours} hours, RM ${pkg.price/100}`);
    });

    return true;

  } catch (error) {
    console.error('❌ Exception creating boost packages:', error);
    return false;
  }
}

// Run the script
createBoostPackagesTable()
  .then(success => {
    if (success) {
      console.log('\n🎉 SUCCESS! Your boost packages are now configured with:');
      console.log('📦 Standard Boost: 15 hours duration');
      console.log('📦 Premium Boost: 36 hours duration');
      console.log('\nYour boost system should now use the correct durations instead of defaulting to 7 days!');
    } else {
      console.log('\n❌ FAILED to create boost packages');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });