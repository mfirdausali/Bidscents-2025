import { z } from 'zod';

// Base error class for all custom errors
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;
  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = new Date();

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  // Get safe error message for production
  getSafeMessage(): string {
    if (process.env.NODE_ENV === 'production' && !this.isOperational) {
      return 'An unexpected error occurred. Please try again later.';
    }
    return this.message;
  }

  toJSON() {
    return {
      message: this.getSafeMessage(),
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      ...(process.env.NODE_ENV !== 'production' && {
        stack: this.stack,
        details: this.details,
      }),
    };
  }
}

// Authentication errors
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super(message, 401, 'AUTHENTICATION_ERROR', true, details);
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor() {
    super('Your session has expired. Please log in again.', { reason: 'token_expired' });
  }
}

export class InvalidCredentialsError extends AuthenticationError {
  constructor() {
    super('Invalid email or password.', { reason: 'invalid_credentials' });
  }
}

// Authorization errors
export class AuthorizationError extends AppError {
  constructor(message: string = 'You do not have permission to perform this action', details?: any) {
    super(message, 403, 'AUTHORIZATION_ERROR', true, details);
  }
}

export class InsufficientPermissionsError extends AuthorizationError {
  constructor(requiredRole?: string) {
    super(
      'You do not have sufficient permissions to access this resource.',
      { requiredRole }
    );
  }
}

// Validation errors
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }

  static fromZodError(error: z.ZodError): ValidationError {
    const errors = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));

    return new ValidationError(
      'Validation failed',
      { errors }
    );
  }
}

// Resource errors
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number) {
    const message = identifier
      ? `${resource} with ID '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', true, { resource, identifier });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', true, details);
  }
}

export class DuplicateResourceError extends ConflictError {
  constructor(resource: string, field: string, value: any) {
    super(
      `${resource} with ${field} '${value}' already exists`,
      { resource, field, value }
    );
  }
}

// Business logic errors
export class BusinessRuleError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 422, 'BUSINESS_RULE_ERROR', true, details);
  }
}

export class InsufficientFundsError extends BusinessRuleError {
  constructor(required: number, available: number) {
    super(
      'Insufficient funds for this transaction',
      { required, available }
    );
  }
}

export class AuctionEndedError extends BusinessRuleError {
  constructor(auctionId: number) {
    super(
      'This auction has already ended',
      { auctionId }
    );
  }
}

export class BidTooLowError extends BusinessRuleError {
  constructor(minimumBid: number, attemptedBid: number) {
    super(
      `Bid must be at least ${minimumBid}. Your bid of ${attemptedBid} is too low.`,
      { minimumBid, attemptedBid }
    );
  }
}

// External service errors
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: any) {
    super(
      `External service error (${service}): ${message}`,
      502,
      'EXTERNAL_SERVICE_ERROR',
      false,
      { service, ...details }
    );
  }
}

export class PaymentGatewayError extends ExternalServiceError {
  constructor(gateway: string, message: string, details?: any) {
    super(gateway, message, details);
  }
}

export class StorageServiceError extends ExternalServiceError {
  constructor(message: string, details?: any) {
    super('Storage', message, details);
  }
}

// Rate limiting errors
export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super(
      'Too many requests. Please try again later.',
      429,
      'RATE_LIMIT_EXCEEDED',
      true,
      { retryAfter }
    );
  }
}

// Database errors
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(
      process.env.NODE_ENV === 'production' 
        ? 'A database error occurred' 
        : message,
      500,
      'DATABASE_ERROR',
      false,
      { originalError: originalError?.message }
    );
  }
}

export class TransactionError extends DatabaseError {
  constructor(operation: string, originalError?: Error) {
    super(
      `Transaction failed during ${operation}`,
      originalError
    );
  }
}

// Security errors
export class SecurityError extends AppError {
  constructor(message: string = 'Security violation detected', details?: any) {
    super(
      process.env.NODE_ENV === 'production' 
        ? 'Security error' 
        : message,
      403,
      'SECURITY_ERROR',
      false,
      details
    );
  }
}

export class CSRFError extends SecurityError {
  constructor() {
    super('CSRF token validation failed');
  }
}

export class SuspiciousActivityError extends SecurityError {
  constructor(activity: string) {
    super(`Suspicious activity detected: ${activity}`, { activity });
  }
}

// File handling errors
export class FileError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'FILE_ERROR', true, details);
  }
}

export class FileSizeError extends FileError {
  constructor(maxSize: number, actualSize: number) {
    super(
      `File size exceeds maximum allowed size of ${maxSize} bytes`,
      { maxSize, actualSize }
    );
  }
}

export class FileTypeError extends FileError {
  constructor(allowedTypes: string[], actualType: string) {
    super(
      `File type '${actualType}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      { allowedTypes, actualType }
    );
  }
}

// Helper function to determine if error is operational
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

// Helper function to get appropriate status code
export function getStatusCode(error: Error): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  
  // Map common errors to status codes
  if (error.name === 'ValidationError') return 400;
  if (error.name === 'CastError') return 400;
  if (error.name === 'JsonWebTokenError') return 401;
  if (error.name === 'TokenExpiredError') return 401;
  
  return 500;
}

// Error factory for creating errors from unknown sources
export function createAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return ValidationError.fromZodError(error);
  }

  if (error instanceof Error) {
    // Check for specific error types
    if (error.message.includes('duplicate key')) {
      return new ConflictError('Resource already exists');
    }
    
    if (error.message.includes('foreign key constraint')) {
      return new BusinessRuleError('Related resource constraint violation');
    }

    // Default to generic app error
    return new AppError(
      error.message,
      500,
      'UNKNOWN_ERROR',
      false,
      { originalError: error.name }
    );
  }

  // Handle non-Error objects
  return new AppError(
    'An unknown error occurred',
    500,
    'UNKNOWN_ERROR',
    false,
    { error: String(error) }
  );
}