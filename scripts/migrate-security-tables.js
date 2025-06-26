import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function migrateSecurityTables() {
  console.log('🔄 Starting security tables migration...');

  try {
    // Add security fields to users table
    console.log('📊 Adding security fields to users table...');
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS account_locked BOOLEAN DEFAULT false NOT NULL,
      ADD COLUMN IF NOT EXISTS account_locked_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS account_locked_reason TEXT,
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS last_login_ip TEXT,
      ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' NOT NULL
    `);

    // Update audit_logs table to include new fields
    console.log('📊 Updating audit_logs table...');
    await db.execute(sql`
      ALTER TABLE audit_logs 
      ADD COLUMN IF NOT EXISTS entity_type TEXT,
      ADD COLUMN IF NOT EXISTS entity_id TEXT,
      ADD COLUMN IF NOT EXISTS changes JSONB
    `);

    // Create login_attempts table
    console.log('📊 Creating login_attempts table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        email TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        successful BOOLEAN NOT NULL,
        failure_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    // Create sessions table
    console.log('📊 Creating sessions table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        token TEXT NOT NULL UNIQUE,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        active BOOLEAN DEFAULT true NOT NULL,
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `);

    // Create security_alerts table
    console.log('📊 Creating security_alerts table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS security_alerts (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'new' NOT NULL,
        metadata JSONB,
        acknowledged_at TIMESTAMP WITH TIME ZONE,
        acknowledged_by TEXT,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    // Create rate_limit_violations table
    console.log('📊 Creating rate_limit_violations table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rate_limit_violations (
        id SERIAL PRIMARY KEY,
        ip_address TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id),
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        violation_count INTEGER DEFAULT 1 NOT NULL,
        window_start TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    // Create indexes for better performance
    console.log('📊 Creating indexes...');
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
      CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
      CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
      
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(active);
      
      CREATE INDEX IF NOT EXISTS idx_security_alerts_type ON security_alerts(type);
      CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON security_alerts(severity);
      CREATE INDEX IF NOT EXISTS idx_security_alerts_status ON security_alerts(status);
      CREATE INDEX IF NOT EXISTS idx_security_alerts_created ON security_alerts(created_at);
      
      CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_ip ON rate_limit_violations(ip_address);
      CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_endpoint ON rate_limit_violations(endpoint);
      CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_created ON rate_limit_violations(created_at);
    `);

    console.log('✅ Security tables migration completed successfully!');
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  }

  process.exit(0);
}

migrateSecurityTables();