import zxcvbn from 'zxcvbn';
import { createHash } from 'crypto';

// Common weak passwords list (top 1000)
const COMMON_PASSWORDS = new Set([
  '123456', 'password', '12345678', 'qwerty', '123456789',
  'letmein', '1234567', 'football', 'iloveyou', 'admin',
  'welcome', 'monkey', 'login', 'abc123', 'starwars',
  'dragon', 'passw0rd', 'master', 'hello', 'freedom',
  'whatever', 'qazwsx', 'trustno1', '654321', 'jordan23',
  'harley', 'password1', '1234567890', 'superman', 'batman',
  // Add more from a comprehensive list
]);

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  minStrengthScore: number; // zxcvbn score (0-4)
  preventCommonPasswords: boolean;
  preventUserInfo: boolean;
  maxLength: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  minStrengthScore: 3,
  preventCommonPasswords: true,
  preventUserInfo: true,
  maxLength: 128
};

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: {
    score: number; // 0-4
    feedback: {
      warning: string;
      suggestions: string[];
    };
    crackTime: string;
  };
}

export class PasswordValidator {
  constructor(private policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY) {}
  
  validate(
    password: string, 
    userInputs: string[] = []
  ): PasswordValidationResult {
    const errors: string[] = [];
    
    // Length validation
    if (password.length < this.policy.minLength) {
      errors.push(`Password must be at least ${this.policy.minLength} characters long`);
    }
    
    if (password.length > this.policy.maxLength) {
      errors.push(`Password must not exceed ${this.policy.maxLength} characters`);
    }
    
    // Character type requirements
    if (this.policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (this.policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (this.policy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (this.policy.requireSpecialChars && !/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    // Common password check
    if (this.policy.preventCommonPasswords) {
      const lowerPassword = password.toLowerCase();
      if (COMMON_PASSWORDS.has(lowerPassword)) {
        errors.push('This password is too common. Please choose a more unique password');
      }
    }
    
    // Strength analysis using zxcvbn
    const strengthResult = zxcvbn(password, userInputs);
    
    if (strengthResult.score < this.policy.minStrengthScore) {
      errors.push(`Password strength is too weak (${strengthResult.score}/4). Please choose a stronger password`);
    }
    
    // User info check
    if (this.policy.preventUserInfo && userInputs.length > 0) {
      const lowerPassword = password.toLowerCase();
      for (const input of userInputs) {
        if (input && lowerPassword.includes(input.toLowerCase())) {
          errors.push('Password should not contain personal information');
          break;
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      strength: {
        score: strengthResult.score,
        feedback: {
          warning: strengthResult.feedback.warning || '',
          suggestions: strengthResult.feedback.suggestions || []
        },
        crackTime: strengthResult.crack_times_display.offline_slow_hashing_1e4_per_second
      }
    };
  }
  
  // Generate password strength feedback for UI
  getStrengthFeedback(score: number): {
    text: string;
    color: string;
    percentage: number;
  } {
    const feedback = [
      { text: 'Very Weak', color: '#dc2626', percentage: 20 },
      { text: 'Weak', color: '#f97316', percentage: 40 },
      { text: 'Fair', color: '#eab308', percentage: 60 },
      { text: 'Good', color: '#22c55e', percentage: 80 },
      { text: 'Strong', color: '#16a34a', percentage: 100 }
    ];
    
    return feedback[score] || feedback[0];
  }
}

// Password history management
export class PasswordHistory {
  private readonly maxHistory = 5;
  
  // Hash password for storage in history
  private hashPassword(password: string, salt: string): string {
    return createHash('sha256')
      .update(password + salt)
      .digest('hex');
  }
  
  // Check if password was previously used
  async isPasswordReused(
    password: string,
    userId: string,
    previousHashes: string[]
  ): Promise<boolean> {
    const currentHash = this.hashPassword(password, userId);
    return previousHashes.includes(currentHash);
  }
  
  // Add password to history
  async addToHistory(
    password: string,
    userId: string,
    previousHashes: string[]
  ): Promise<string[]> {
    const newHash = this.hashPassword(password, userId);
    const updatedHistory = [newHash, ...previousHashes].slice(0, this.maxHistory);
    return updatedHistory;
  }
}

// Account lockout protection
export class AccountLockout {
  private attempts = new Map<string, { count: number; firstAttempt: Date }>();
  private readonly maxAttempts = 5;
  private readonly lockoutDuration = 15 * 60 * 1000; // 15 minutes
  private readonly attemptWindow = 10 * 60 * 1000; // 10 minutes
  
  recordFailedAttempt(identifier: string): {
    isLocked: boolean;
    remainingAttempts: number;
    lockoutUntil?: Date;
  } {
    const now = new Date();
    const record = this.attempts.get(identifier);
    
    if (!record) {
      this.attempts.set(identifier, { count: 1, firstAttempt: now });
      return { isLocked: false, remainingAttempts: this.maxAttempts - 1 };
    }
    
    // Reset if outside attempt window
    if (now.getTime() - record.firstAttempt.getTime() > this.attemptWindow) {
      this.attempts.set(identifier, { count: 1, firstAttempt: now });
      return { isLocked: false, remainingAttempts: this.maxAttempts - 1 };
    }
    
    record.count++;
    
    if (record.count >= this.maxAttempts) {
      const lockoutUntil = new Date(now.getTime() + this.lockoutDuration);
      return {
        isLocked: true,
        remainingAttempts: 0,
        lockoutUntil
      };
    }
    
    return {
      isLocked: false,
      remainingAttempts: this.maxAttempts - record.count
    };
  }
  
  clearAttempts(identifier: string): void {
    this.attempts.delete(identifier);
  }
  
  isLocked(identifier: string): boolean {
    const record = this.attempts.get(identifier);
    if (!record || record.count < this.maxAttempts) return false;
    
    const now = new Date();
    const lockoutEnd = new Date(
      record.firstAttempt.getTime() + this.attemptWindow + this.lockoutDuration
    );
    
    if (now > lockoutEnd) {
      this.attempts.delete(identifier);
      return false;
    }
    
    return true;
  }
}

// Export instances
export const passwordValidator = new PasswordValidator();
export const passwordHistory = new PasswordHistory();
export const accountLockout = new AccountLockout();