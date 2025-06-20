/**
 * Authentication Integrity Analysis
 * Analyzes user data in Supabase to identify potential authentication issues
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeUserData() {
  console.log('🔍 Analyzing user authentication integrity...');
  
  try {
    // Get all users from public.users table
    const { data: users, error } = await supabase
      .from('users')
      .select('*');
    
    if (error) {
      console.error('❌ Error fetching users:', error);
      return;
    }
    
    console.log(`📊 Total users in database: ${users.length}`);
    
    // Analyze users without provider_id
    const usersWithoutProviderId = users.filter(user => !user.provider_id || user.provider_id === '');
    console.log(`🔍 Users without provider_id: ${usersWithoutProviderId.length}`);
    
    // Analyze users without provider
    const usersWithoutProvider = users.filter(user => !user.provider || user.provider === '');
    console.log(`🔍 Users without provider: ${usersWithoutProvider.length}`);
    
    // Users that need updating
    const usersNeedingUpdate = users.filter(user => 
      !user.provider_id || user.provider_id === '' || 
      !user.provider || user.provider === ''
    );
    
    console.log(`🔧 Users needing provider info update: ${usersNeedingUpdate.length}`);
    
    if (usersNeedingUpdate.length > 0) {
      console.log('\n📋 Users needing updates:');
      usersNeedingUpdate.forEach(user => {
        console.log(`- ${user.email} (ID: ${user.id})`);
      });
      
      // Fix users with missing provider information
      console.log('\n🔧 Updating users with missing provider information...');
      let successCount = 0;
      let errorCount = 0;
      
      for (const user of usersNeedingUpdate) {
        try {
          const { error: updateError } = await supabase
            .from('users')
            .update({
              provider_id: user.provider_id || `legacy_${user.id}`,
              provider: user.provider || 'supabase'
            })
            .eq('id', user.id);
          
          if (updateError) {
            console.error(`❌ Failed to update ${user.email}:`, updateError.message);
            errorCount++;
          } else {
            console.log(`✅ Updated ${user.email}`);
            successCount++;
          }
        } catch (error) {
          console.error(`❌ Exception updating ${user.email}:`, error.message);
          errorCount++;
        }
      }
      
      console.log(`\n📊 Update Results:`);
      console.log(`✅ Successfully updated: ${successCount}`);
      console.log(`❌ Failed updates: ${errorCount}`);
    }
    
    // Check for duplicate emails
    const emailCounts = {};
    users.forEach(user => {
      emailCounts[user.email] = (emailCounts[user.email] || 0) + 1;
    });
    
    const duplicateEmails = Object.entries(emailCounts).filter(([email, count]) => count > 1);
    if (duplicateEmails.length > 0) {
      console.log(`\n⚠️  Found ${duplicateEmails.length} duplicate emails:`);
      duplicateEmails.forEach(([email, count]) => {
        console.log(`- ${email}: ${count} accounts`);
      });
    }
    
    // Check for duplicate usernames
    const usernameCounts = {};
    users.forEach(user => {
      if (user.username) {
        usernameCounts[user.username] = (usernameCounts[user.username] || 0) + 1;
      }
    });
    
    const duplicateUsernames = Object.entries(usernameCounts).filter(([username, count]) => count > 1);
    if (duplicateUsernames.length > 0) {
      console.log(`\n⚠️  Found ${duplicateUsernames.length} duplicate usernames:`);
      duplicateUsernames.forEach(([username, count]) => {
        console.log(`- ${username}: ${count} accounts`);
      });
    }
    
    console.log('\n✅ Authentication integrity analysis complete!');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

// Test session endpoint connectivity
async function testSessionEndpoint() {
  console.log('\n🧪 Testing session endpoint...');
  
  try {
    const response = await fetch('http://localhost:5000/api/v1/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseToken: 'test' })
    });
    
    const result = await response.json();
    console.log(`📊 Session endpoint status: ${response.status}`);
    console.log(`📊 Response structure: ${result.error ? 'Error response' : 'Valid structure'}`);
    
  } catch (error) {
    console.error('❌ Session endpoint test failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting Authentication System Analysis');
  console.log('=========================================\n');
  
  await analyzeUserData();
  await testSessionEndpoint();
  
  console.log('\n🎉 Analysis complete!');
}

main().catch(console.error);