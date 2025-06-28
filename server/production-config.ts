/**
 * Production environment configuration and validation
 * Ensures all required environment variables are set and validates configuration
 */

export interface ProductionConfig {
  isProduction: boolean;
  isDevelopment: boolean;
  enableDebugLogging: boolean;
  enablePerformanceMonitoring: boolean;
  enableDetailedErrorReporting: boolean;
  enableConsoleLogging: boolean;
  validateSSL: boolean;
}

class ConfigValidator {
  private requiredEnvVars = [
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

  private optionalEnvVars = [
    'NODE_ENV',
    'PORT',
    'LOG_LEVEL',
    'REDIS_URL'
  ];

  validate(): void {
    const missing: string[] = [];
    const warnings: string[] = [];

    // Check required environment variables
    for (const envVar of this.requiredEnvVars) {
      if (!process.env[envVar]) {
        missing.push(envVar);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate URLs in production
    if (this.isProduction()) {
      this.validateProductionUrls();
      this.validateSecrets();
    }

    // Check for development configurations in production
    if (this.isProduction()) {
      this.checkDevelopmentConfigs();
    }

    console.log('✅ Environment configuration validated successfully');
    if (warnings.length > 0) {
      console.warn('⚠️ Configuration warnings:', warnings);
    }
  }

  private validateProductionUrls(): void {
    const appUrl = process.env.APP_URL;
    const clientUrl = process.env.CLIENT_URL;
    const supabaseUrl = process.env.SUPABASE_URL;

    if (appUrl?.includes('localhost') || appUrl?.includes('127.0.0.1')) {
      throw new Error('APP_URL cannot use localhost in production');
    }

    if (clientUrl?.includes('localhost') || clientUrl?.includes('127.0.0.1')) {
      throw new Error('CLIENT_URL cannot use localhost in production');
    }

    if (!appUrl?.startsWith('https://')) {
      throw new Error('APP_URL must use HTTPS in production');
    }

    if (!clientUrl?.startsWith('https://')) {
      throw new Error('CLIENT_URL must use HTTPS in production');
    }

    if (!supabaseUrl?.startsWith('https://')) {
      throw new Error('SUPABASE_URL must use HTTPS in production');
    }
  }

  private validateSecrets(): void {
    const jwtSecret = process.env.JWT_SECRET;
    const billplzSecret = process.env.BILLPLZ_SECRET_KEY;
    const billplzXSign = process.env.BILLPLZ_XSIGN_KEY;

    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long in production');
    }

    if (!billplzSecret || billplzSecret.length < 10) {
      throw new Error('BILLPLZ_SECRET_KEY appears to be invalid in production');
    }

    if (!billplzXSign || billplzXSign.length < 32) {
      throw new Error('BILLPLZ_XSIGN_KEY appears to be invalid in production');
    }

    // Check if using sandbox in production
    if (process.env.BILLPLZ_BASE_URL?.includes('sandbox')) {
      console.warn('⚠️ WARNING: Using Billplz sandbox in production environment');
    }
  }

  private checkDevelopmentConfigs(): void {
    // Check for common development patterns
    const warnings: string[] = [];

    if (process.env.DEMO_MODE === 'true') {
      warnings.push('DEMO_MODE is enabled in production');
    }

    if (process.env.LOG_LEVEL === 'debug') {
      warnings.push('LOG_LEVEL is set to debug in production');
    }

    if (warnings.length > 0) {
      console.warn('⚠️ Development configurations detected in production:', warnings);
    }
  }

  isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  }
}

// Create configuration object
export const productionConfig: ProductionConfig = {
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  enableDebugLogging: process.env.NODE_ENV !== 'production',
  enablePerformanceMonitoring: process.env.NODE_ENV !== 'production',
  enableDetailedErrorReporting: process.env.NODE_ENV !== 'production',
  enableConsoleLogging: process.env.NODE_ENV !== 'production' || process.env.ENABLE_CONSOLE_LOGS === 'true',
  validateSSL: process.env.NODE_ENV === 'production'
};

// Export validator
export const configValidator = new ConfigValidator();

// Helper functions for code conditional logic
export const isProduction = () => productionConfig.isProduction;
export const isDevelopment = () => productionConfig.isDevelopment;
export const shouldLogDebug = () => productionConfig.enableDebugLogging;
export const shouldLogToConsole = () => productionConfig.enableConsoleLogging;

// Production safety checks
export function ensureProductionSafety(): void {
  if (isProduction()) {
    // Disable debug endpoints or features
    console.log('🔒 Production mode: Debug features disabled');
    
    // Validate all environment variables
    configValidator.validate();
    
    // Set stricter timeouts and limits
    process.env.REQUEST_TIMEOUT = process.env.REQUEST_TIMEOUT || '30000';
    process.env.MAX_PAYLOAD_SIZE = process.env.MAX_PAYLOAD_SIZE || '10mb';
  } else {
    console.log('🛠️ Development mode: Debug features enabled');
  }
}