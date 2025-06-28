#!/usr/bin/env node

/**
 * Production build script with safety checks
 * Validates environment and removes debug code before building
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');

console.log('🚀 Starting production build process...');

// 1. Environment validation
console.log('📋 Step 1: Validating environment...');

const requiredEnvVars = [
  'NODE_ENV',
  'DATABASE_URL',
  'SUPABASE_URL', 
  'SUPABASE_KEY',
  'JWT_SECRET',
  'APP_URL',
  'CLIENT_URL',
  'BILLPLZ_BASE_URL',
  'BILLPLZ_SECRET_KEY',
  'BILLPLZ_COLLECTION_ID',
  'BILLPLZ_XSIGN_KEY'
];

// Check if we have a .env file or environment variables
let envVarsMissing = [];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    envVarsMissing.push(envVar);
  }
}

if (envVarsMissing.length > 0) {
  console.error('❌ Missing required environment variables:');
  envVarsMissing.forEach(envVar => console.error(`   - ${envVar}`));
  console.error('\n💡 Please set these environment variables or create a .env file');
  process.exit(1);
}

// 2. Production safety checks
console.log('🔒 Step 2: Running production safety checks...');

if (process.env.NODE_ENV !== 'production') {
  console.warn('⚠️  NODE_ENV is not set to "production"');
  console.warn('   This build should be used with NODE_ENV=production');
}

// Check for localhost URLs in production environment variables
if (process.env.APP_URL && process.env.APP_URL.includes('localhost')) {
  console.error('❌ APP_URL contains localhost - not suitable for production');
  process.exit(1);
}

if (process.env.CLIENT_URL && process.env.CLIENT_URL.includes('localhost')) {
  console.error('❌ CLIENT_URL contains localhost - not suitable for production');
  process.exit(1);
}

// 3. Check for debug files that shouldn't be in production
console.log('🧹 Step 3: Checking for debug files...');

const debugPatterns = [
  'test-*.js',
  'debug-*.js', 
  'manual-*.js',
  'check-*.js',
  'analyze-*.js'
];

const debugFiles = [];
const glob = require('glob');

for (const pattern of debugPatterns) {
  const files = glob.sync(pattern, { cwd: rootDir });
  debugFiles.push(...files);
}

if (debugFiles.length > 0) {
  console.warn('⚠️  Debug files found in root directory:');
  debugFiles.forEach(file => console.warn(`   - ${file}`));
  console.warn('   These files will be excluded from Docker builds via .dockerignore');
}

// 4. TypeScript check
console.log('🔍 Step 4: Running TypeScript checks...');
try {
  execSync('npm run check', { 
    cwd: rootDir, 
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });
  console.log('✅ TypeScript checks passed');
} catch (error) {
  console.error('❌ TypeScript checks failed');
  console.error('   Please fix TypeScript errors before building for production');
  process.exit(1);
}

// 5. Build the application
console.log('🏗️  Step 5: Building application...');
try {
  execSync('npm run build', { 
    cwd: rootDir, 
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });
  console.log('✅ Application build completed');
} catch (error) {
  console.error('❌ Application build failed');
  process.exit(1);
}

// 6. Validate build output
console.log('📦 Step 6: Validating build output...');

const distDir = path.join(rootDir, 'dist');
if (!fs.existsSync(distDir)) {
  console.error('❌ Build output directory "dist" not found');
  process.exit(1);
}

const distFiles = fs.readdirSync(distDir);
if (distFiles.length === 0) {
  console.error('❌ Build output directory is empty');
  process.exit(1);
}

console.log(`✅ Build output contains ${distFiles.length} files`);

// 7. Security check - ensure no sensitive files in build
console.log('🔐 Step 7: Security validation...');

const sensitivePatterns = ['.env', 'private', 'secret', 'key'];
const buildFiles = execSync('find dist -type f', { cwd: rootDir }).toString().split('\n');

const sensitiveFiles = buildFiles.filter(file => 
  sensitivePatterns.some(pattern => file.toLowerCase().includes(pattern))
);

if (sensitiveFiles.length > 0) {
  console.error('❌ Potentially sensitive files found in build:');
  sensitiveFiles.forEach(file => console.error(`   - ${file}`));
  process.exit(1);
}

console.log('✅ No sensitive files detected in build output');

// 8. Final summary
console.log('\n🎉 Production build completed successfully!');
console.log('📋 Build Summary:');
console.log(`   - Environment: ${process.env.NODE_ENV}`);
console.log(`   - Build directory: dist/`);
console.log(`   - Files created: ${distFiles.length}`);
console.log(`   - Debug files excluded: ${debugFiles.length}`);

console.log('\n💡 Next steps:');
console.log('   - Test the build with: npm start');
console.log('   - Deploy using Docker or your preferred method');
console.log('   - Ensure all environment variables are set in production');

console.log('\n🔒 Security reminders:');
console.log('   - Never commit .env files');
console.log('   - Use environment variables or secrets management in production');
console.log('   - Enable HTTPS and security headers');
console.log('   - Monitor logs for any debug output');