/**
 * Custom error types for boost operations
 * Provides comprehensive error handling for the boost system
 */

export enum BoostErrorCode {
  INVALID_PACKAGE = 'INVALID_PACKAGE',
  PRODUCT_NOT_OWNED = 'PRODUCT_NOT_OWNED',
  ALREADY_FEATURED = 'ALREADY_FEATURED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  BILLPLZ_ERROR = 'BILLPLZ_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  TRANSACTION_ROLLBACK = 'TRANSACTION_ROLLBACK',
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',
  EXPIRED_PACKAGE = 'EXPIRED_PACKAGE',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  PACKAGE_NOT_FOUND = 'PACKAGE_NOT_FOUND',
  WEBHOOK_VALIDATION_FAILED = 'WEBHOOK_VALIDATION_FAILED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR'
}

export class BoostOrderError extends Error {
  public readonly code: BoostErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly timestamp: Date;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: BoostErrorCode,
    statusCode: number = 400,
    details?: Record<string, any>,
    requestId?: string
  ) {
    super(message);
    this.name = 'BoostOrderError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date();
    this.requestId = requestId;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BoostOrderError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
      stack: this.stack
    };
  }
}

export class BoostValidationError extends BoostOrderError {
  constructor(
    message: string,
    field: string,
    value: any,
    requestId?: string
  ) {
    super(
      message,
      BoostErrorCode.INVALID_INPUT,
      400,
      { field, value, type: 'validation' },
      requestId
    );
    this.name = 'BoostValidationError';
  }
}

export class BoostPaymentError extends BoostOrderError {
  constructor(
    message: string,
    billplzErrorCode?: string,
    billplzErrorMessage?: string,
    requestId?: string
  ) {
    super(
      message,
      BoostErrorCode.PAYMENT_FAILED,
      402,
      { 
        billplzErrorCode, 
        billplzErrorMessage, 
        type: 'payment' 
      },
      requestId
    );
    this.name = 'BoostPaymentError';
  }
}

export class BoostBillplzError extends BoostOrderError {
  constructor(
    message: string,
    billplzResponse?: any,
    requestId?: string
  ) {
    super(
      message,
      BoostErrorCode.BILLPLZ_ERROR,
      503,
      { 
        billplzResponse, 
        type: 'billplz_integration' 
      },
      requestId
    );
    this.name = 'BoostBillplzError';
  }
}

export class BoostRateLimitError extends BoostOrderError {
  constructor(
    message: string,
    limit: number,
    windowMs: number,
    requestId?: string
  ) {
    super(
      message,
      BoostErrorCode.RATE_LIMIT_EXCEEDED,
      429,
      { 
        limit, 
        windowMs, 
        type: 'rate_limit' 
      },
      requestId
    );
    this.name = 'BoostRateLimitError';
  }
}

export class BoostDatabaseError extends BoostOrderError {
  constructor(
    message: string,
    operation: string,
    originalError?: Error,
    requestId?: string
  ) {
    super(
      message,
      BoostErrorCode.DATABASE_ERROR,
      500,
      { 
        operation, 
        originalError: originalError?.message,
        type: 'database' 
      },
      requestId
    );
    this.name = 'BoostDatabaseError';
  }
}

export class BoostDuplicateRequestError extends BoostOrderError {
  constructor(
    message: string,
    idempotencyKey: string,
    requestId?: string
  ) {
    super(
      message,
      BoostErrorCode.DUPLICATE_REQUEST,
      409,
      { 
        idempotencyKey, 
        type: 'duplicate_request' 
      },
      requestId
    );
    this.name = 'BoostDuplicateRequestError';
  }
}

/**
 * Error message mappings for user-friendly error responses
 */
export const BoostErrorMessages: Record<BoostErrorCode, string> = {
  [BoostErrorCode.INVALID_PACKAGE]: 'The selected boost package is invalid or no longer available',
  [BoostErrorCode.PRODUCT_NOT_OWNED]: 'You can only boost products that you own',
  [BoostErrorCode.ALREADY_FEATURED]: 'This product is already featured and cannot be boosted again',
  [BoostErrorCode.PAYMENT_FAILED]: 'Payment processing failed. Please try again or use a different payment method',
  [BoostErrorCode.BILLPLZ_ERROR]: 'Payment service is temporarily unavailable. Please try again later',
  [BoostErrorCode.INVALID_INPUT]: 'Invalid input provided. Please check your request and try again',
  [BoostErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please wait before trying again',
  [BoostErrorCode.INSUFFICIENT_FUNDS]: 'Insufficient funds for this boost package',
  [BoostErrorCode.TRANSACTION_ROLLBACK]: 'Transaction failed and has been rolled back. Please try again',
  [BoostErrorCode.DUPLICATE_REQUEST]: 'This request has already been processed',
  [BoostErrorCode.EXPIRED_PACKAGE]: 'The boost package has expired and is no longer available',
  [BoostErrorCode.UNAUTHORIZED_ACCESS]: 'You are not authorized to perform this action',
  [BoostErrorCode.PRODUCT_NOT_FOUND]: 'The specified product could not be found',
  [BoostErrorCode.PACKAGE_NOT_FOUND]: 'The specified boost package could not be found',
  [BoostErrorCode.WEBHOOK_VALIDATION_FAILED]: 'Webhook validation failed. Request may be invalid',
  [BoostErrorCode.DATABASE_ERROR]: 'Database operation failed. Please try again',
  [BoostErrorCode.NETWORK_ERROR]: 'Network error occurred. Please check your connection and try again'
};

/**
 * Utility function to create standardized error responses
 */
export function createErrorResponse(
  error: BoostOrderError,
  includeDetails: boolean = false
) {
  const response: any = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      timestamp: error.timestamp,
      requestId: error.requestId
    }
  };

  if (includeDetails && error.details) {
    response.error.details = error.details;
  }

  return response;
}

/**
 * Utility function to log errors with structured format
 */
export function logBoostError(
  error: BoostOrderError,
  context: Record<string, any> = {}
) {
  const logData = {
    timestamp: error.timestamp,
    requestId: error.requestId,
    errorCode: error.code,
    errorMessage: error.message,
    statusCode: error.statusCode,
    details: error.details,
    context,
    stack: error.stack
  };

  console.error('🚨 BOOST ERROR:', JSON.stringify(logData, null, 2));
}

/**
 * Middleware to handle boost errors
 */
export function handleBoostError(error: any, req: any, res: any, next: any) {
  if (error instanceof BoostOrderError) {
    logBoostError(error, {
      url: req.url,
      method: req.method,
      userId: req.user?.id,
      ip: req.ip
    });

    return res.status(error.statusCode).json(
      createErrorResponse(error, process.env.NODE_ENV === 'development')
    );
  }

  // Handle other errors
  const boostError = new BoostOrderError(
    'An unexpected error occurred',
    BoostErrorCode.DATABASE_ERROR,
    500,
    { originalError: error.message }
  );

  logBoostError(boostError, {
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    ip: req.ip
  });

  return res.status(500).json(
    createErrorResponse(boostError, process.env.NODE_ENV === 'development')
  );
}