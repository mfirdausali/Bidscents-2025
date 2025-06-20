
#!/usr/bin/env node

/**
 * This script checks for required environment variables
 * Run with: node scripts/check-env.js
 */

console.log('Checking environment variables...');

const requiredVars = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'DATABASE_URL'
];

const missing = [];

for (const varName of requiredVars) {
  if (!process.env[varName]) {
    missing.push(varName);
  } else {
    // Don't log the actual values for security reasons
    console.log(`✓ ${varName} is set`);
  }
}

if (missing.length > 0) {
  console.error('\n⚠️  Missing required environment variables:');
  missing.forEach(varName => {
    console.error(`  - ${varName}`);
  });
  console.error('\nPlease add these to your Secrets (Environment Variables) in your Replit workspace');
  console.error('Also make sure to redeploy after adding these secrets');
  process.exit(1);
} else {
  console.log('\n✅ All required environment variables are set!');
}
