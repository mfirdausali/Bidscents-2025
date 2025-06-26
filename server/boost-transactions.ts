/**
 * Database transaction management for boost operations
 * Provides comprehensive transaction handling with rollbacks and idempotency
 */

import { db } from './db';
import { sql } from 'drizzle-orm';
import { BoostOrderError, BoostDatabaseError, BoostDuplicateRequestError, BoostErrorCode, logBoostError } from './boost-errors';
import crypto from 'crypto';

// Transaction state tracking
interface TransactionState {
  id: string;
  operations: string[];
  rollbackActions: Array<() => Promise<void>>;
  startTime: Date;
  status: 'pending' | 'committed' | 'rolled_back' | 'failed';
  metadata?: Record<string, any>;
}

const activeTransactions = new Map<string, TransactionState>();

// Idempotency tracking for operations
interface IdempotentOperation {
  key: string;
  result: any;
  timestamp: Date;
  transactionId: string;
}

const idempotentOperations = new Map<string, IdempotentOperation>();
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Clean up expired idempotent operations
 */
function cleanupExpiredOperations() {
  const now = Date.now();
  for (const [key, operation] of idempotentOperations.entries()) {
    if (operation.timestamp.getTime() + IDEMPOTENCY_TTL <= now) {
      idempotentOperations.delete(key);
    }
  }
}

/**
 * Generate unique transaction ID
 */
export function generateTransactionId(): string {
  return `boost_tx_${crypto.randomUUID()}`;
}

/**
 * Create idempotency key for operations
 */
export function createIdempotencyKey(userId: number, operation: string, data: any): string {
  const hash = crypto.createHash('sha256')
    .update(`${userId}:${operation}:${JSON.stringify(data)}`)
    .digest('hex');
  return `boost_${operation}_${hash}`;
}

/**
 * Check if operation is idempotent
 */
export function checkIdempotentOperation(key: string): IdempotentOperation | null {
  cleanupExpiredOperations();
  return idempotentOperations.get(key) || null;
}

/**
 * Store idempotent operation result
 */
export function storeIdempotentOperation(
  key: string, 
  result: any, 
  transactionId: string
): void {
  idempotentOperations.set(key, {
    key,
    result,
    timestamp: new Date(),
    transactionId
  });
}

/**
 * Enhanced transaction wrapper with comprehensive error handling
 */
export async function executeBoostTransaction<T>(
  operations: (txId: string) => Promise<T>,
  options?: {
    timeoutMs?: number;
    maxRetries?: number;
    idempotencyKey?: string;
    metadata?: Record<string, any>;
  }
): Promise<T> {
  const {
    timeoutMs = 30000,
    maxRetries = 3,
    idempotencyKey,
    metadata = {}
  } = options || {};

  // Check for idempotent operation
  if (idempotencyKey) {
    const existing = checkIdempotentOperation(idempotencyKey);
    if (existing) {
      console.log(`🔄 Returning idempotent result for key: ${idempotencyKey}`);
      return existing.result;
    }
  }

  const transactionId = generateTransactionId();
  const startTime = new Date();
  
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    
    const transactionState: TransactionState = {
      id: transactionId,
      operations: [],
      rollbackActions: [],
      startTime,
      status: 'pending',
      metadata: {
        ...metadata,
        attempt,
        maxRetries,
        idempotencyKey
      }
    };

    activeTransactions.set(transactionId, transactionState);

    try {
      console.log(`🔄 Starting boost transaction ${transactionId} (attempt ${attempt}/${maxRetries})`);
      
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new BoostDatabaseError(
            `Transaction timeout after ${timeoutMs}ms`,
            'transaction_timeout',
            undefined,
            transactionId
          ));
        }, timeoutMs);
      });

      // Execute transaction with timeout
      const resultPromise = db.transaction(async (tx) => {
        transactionState.status = 'pending';
        
        try {
          // Execute the operations
          const result = await operations(transactionId);
          
          // Mark transaction as committed
          transactionState.status = 'committed';
          
          // Store idempotent result if key provided
          if (idempotencyKey) {
            storeIdempotentOperation(idempotencyKey, result, transactionId);
          }
          
          console.log(`✅ Boost transaction ${transactionId} committed successfully`);
          return result;
          
        } catch (error) {
          transactionState.status = 'failed';
          
          // Log the error with transaction context
          if (error instanceof BoostOrderError) {
            logBoostError(error, {
              transactionId,
              attempt,
              operations: transactionState.operations,
              metadata: transactionState.metadata
            });
          }
          
          throw error;
        }
      });

      const result = await Promise.race([resultPromise, timeoutPromise]);
      
      // Cleanup successful transaction
      activeTransactions.delete(transactionId);
      
      return result;

    } catch (error) {
      lastError = error as Error;
      transactionState.status = 'rolled_back';
      
      console.error(`❌ Boost transaction ${transactionId} failed (attempt ${attempt}/${maxRetries}):`, error);
      
      // Execute rollback actions
      await executeRollbackActions(transactionState);
      
      // Clean up failed transaction
      activeTransactions.delete(transactionId);
      
      // If this was the last attempt, throw the error
      if (attempt >= maxRetries) {
        break;
      }
      
      // Wait before retry (exponential backoff)
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.log(`⏳ Retrying transaction in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // All retries exhausted
  const finalError = new BoostDatabaseError(
    `Transaction failed after ${maxRetries} attempts`,
    'transaction_retry_exhausted',
    lastError,
    transactionId
  );

  logBoostError(finalError, {
    attempts: maxRetries,
    lastError: lastError?.message,
    metadata
  });

  throw finalError;
}

/**
 * Execute rollback actions for a failed transaction
 */
async function executeRollbackActions(transactionState: TransactionState): Promise<void> {
  if (transactionState.rollbackActions.length === 0) {
    return;
  }

  console.log(`🔙 Executing ${transactionState.rollbackActions.length} rollback actions for transaction ${transactionState.id}`);

  // Execute rollback actions in reverse order
  for (let i = transactionState.rollbackActions.length - 1; i >= 0; i--) {
    try {
      await transactionState.rollbackActions[i]();
      console.log(`✅ Rollback action ${i + 1} completed for transaction ${transactionState.id}`);
    } catch (rollbackError) {
      console.error(`❌ Rollback action ${i + 1} failed for transaction ${transactionState.id}:`, rollbackError);
      // Continue with other rollback actions even if one fails
    }
  }
}

/**
 * Add a rollback action to the current transaction
 */
export function addRollbackAction(transactionId: string, action: () => Promise<void>): void {
  const transaction = activeTransactions.get(transactionId);
  if (transaction) {
    transaction.rollbackActions.push(action);
    transaction.operations.push('rollback_action_added');
  }
}

/**
 * Track operation in current transaction
 */
export function trackOperation(transactionId: string, operation: string): void {
  const transaction = activeTransactions.get(transactionId);
  if (transaction) {
    transaction.operations.push(operation);
  }
}

/**
 * Specific boost operation transactions
 */

/**
 * Create boost order with comprehensive transaction management
 */
export async function createBoostOrderTransaction(
  userId: number,
  productId: number,
  packageId: number,
  amount: number,
  duration: number,
  idempotencyKey?: string
) {
  return executeBoostTransaction(async (txId) => {
    trackOperation(txId, 'create_boost_order');
    
    // Verify product ownership
    const product = await db.query.products.findFirst({
      where: (products, { eq }) => eq(products.id, productId)
    });

    if (!product) {
      throw new BoostOrderError(
        'Product not found',
        BoostErrorCode.PRODUCT_NOT_FOUND,
        404,
        { productId },
        txId
      );
    }

    if (product.sellerId !== userId) {
      throw new BoostOrderError(
        'You can only boost your own products',
        BoostErrorCode.PRODUCT_NOT_OWNED,
        403,
        { productId, userId, ownerId: product.sellerId },
        txId
      );
    }

    // Check if product is already featured
    if (product.isFeatured) {
      throw new BoostOrderError(
        'Product is already featured',
        BoostErrorCode.ALREADY_FEATURED,
        409,
        { productId },
        txId
      );
    }

    // Verify package exists and is active
    const boostPackage = await db.query.boostPackages.findFirst({
      where: (packages, { eq, and }) => and(
        eq(packages.id, packageId),
        eq(packages.isActive, true)
      )
    });

    if (!boostPackage) {
      throw new BoostOrderError(
        'Boost package not found or inactive',
        BoostErrorCode.PACKAGE_NOT_FOUND,
        404,
        { packageId },
        txId
      );
    }

    // Create payment record
    trackOperation(txId, 'create_payment_record');
    const paymentResult = await db.insert(require('@shared/schema').payments).values({
      userId,
      productId,
      amount,
      status: 'pending',
      paymentType: 'boost',
      featureDuration: duration,
      orderId: `boost_${txId}`,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    const payment = paymentResult[0];

    // Add rollback action to delete payment if transaction fails
    addRollbackAction(txId, async () => {
      await db.delete(require('@shared/schema').payments)
        .where(require('drizzle-orm').eq(require('@shared/schema').payments.id, payment.id));
    });

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      status: payment.status,
      productId,
      packageId,
      transactionId: txId
    };

  }, {
    idempotencyKey,
    metadata: { userId, productId, packageId, amount, duration }
  });
}

/**
 * Process boost payment with transaction management
 */
export async function processBoostPaymentTransaction(
  paymentId: number,
  billId: string,
  status: string,
  paidAt?: Date,
  idempotencyKey?: string
) {
  return executeBoostTransaction(async (txId) => {
    trackOperation(txId, 'process_boost_payment');

    // Get payment record
    const paymentResult = await db.query.payments.findFirst({
      where: (payments, { eq }) => eq(payments.id, paymentId),
      with: {
        product: true
      }
    });

    if (!paymentResult) {
      throw new BoostOrderError(
        'Payment record not found',
        BoostErrorCode.PAYMENT_FAILED,
        404,
        { paymentId },
        txId
      );
    }

    const originalStatus = paymentResult.status;

    // Update payment status
    trackOperation(txId, 'update_payment_status');
    const updatedPayment = await db.update(require('@shared/schema').payments)
      .set({
        status,
        billId,
        paidAt,
        updatedAt: new Date()
      })
      .where(require('drizzle-orm').eq(require('@shared/schema').payments.id, paymentId))
      .returning();

    // Add rollback action to revert payment status
    addRollbackAction(txId, async () => {
      await db.update(require('@shared/schema').payments)
        .set({
          status: originalStatus,
          billId: null,
          paidAt: null,
          updatedAt: new Date()
        })
        .where(require('drizzle-orm').eq(require('@shared/schema').payments.id, paymentId));
    });

    // If payment is successful, update product featured status
    if (status === 'paid' && paymentResult.productId) {
      trackOperation(txId, 'update_product_featured_status');
      
      const featureUntil = new Date();
      featureUntil.setHours(featureUntil.getHours() + (paymentResult.featureDuration || 24));

      const originalProduct = paymentResult.product;
      
      await db.update(require('@shared/schema').products)
        .set({
          isFeatured: true,
          featuredUntil: featureUntil,
          featuredDurationHours: paymentResult.featureDuration || 24,
          updatedAt: new Date()
        })
        .where(require('drizzle-orm').eq(require('@shared/schema').products.id, paymentResult.productId));

      // Add rollback action to revert product status
      addRollbackAction(txId, async () => {
        await db.update(require('@shared/schema').products)
          .set({
            isFeatured: originalProduct?.isFeatured || false,
            featuredUntil: originalProduct?.featuredUntil || null,
            featuredDurationHours: originalProduct?.featuredDurationHours || null,
            updatedAt: new Date()
          })
          .where(require('drizzle-orm').eq(require('@shared/schema').products.id, paymentResult.productId));
      });
    }

    return {
      paymentId,
      status,
      productId: paymentResult.productId,
      transactionId: txId,
      billId
    };

  }, {
    idempotencyKey,
    metadata: { paymentId, billId, status }
  });
}

/**
 * Expire featured products transaction (using Supabase instead of Drizzle for compatibility)
 */
export async function expireFeaturedProductsTransaction() {
  // Import Supabase here to avoid circular dependencies
  const { supabase } = await import('./supabase');
  
  const transactionId = `expire_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const currentTime = new Date().toISOString();
  
  try {
    console.log(`🔄 Starting featured products expiration transaction ${transactionId}`);
    
    // Find expired featured products using Supabase
    // Check both isFeatured=true AND status='featured' for comprehensive coverage
    const { data: expiredByFlag, error: flagError } = await supabase
      .from('products')
      .select('id, name, is_featured, featured_until, status')
      .eq('is_featured', true)
      .lt('featured_until', currentTime);

    if (flagError) {
      console.error('Error finding expired products by is_featured flag:', flagError);
    }

    const { data: expiredByStatus, error: statusError } = await supabase
      .from('products')
      .select('id, name, is_featured, featured_until, status')
      .eq('status', 'featured')
      .lt('featured_until', currentTime);

    if (statusError) {
      console.error('Error finding expired products by status:', statusError);
    }

    // Combine and deduplicate expired products
    const allExpired = [...(expiredByFlag || []), ...(expiredByStatus || [])];
    const uniqueExpired = allExpired.filter((product, index, self) => 
      index === self.findIndex(p => p.id === product.id)
    );

    if (uniqueExpired.length === 0) {
      console.log(`✅ No expired featured products found at ${currentTime}`);
      return { 
        expiredCount: 0, 
        expiredProducts: [], 
        transactionId 
      };
    }

    console.log(`🔄 Found ${uniqueExpired.length} expired featured products to update:`);
    uniqueExpired.forEach(product => {
      console.log(`   - Product ${product.id}: ${product.name} (expired: ${product.featured_until})`);
    });

    const productIds = uniqueExpired.map(p => p.id);
    
    // Update expired products to remove featured status
    const { error: updateError } = await supabase
      .from('products')
      .update({
        is_featured: false,
        status: 'active', // Change from 'featured' back to 'active'
        featured_until: null
        // Note: No updated_at column exists in Supabase schema
      })
      .in('id', productIds);

    if (updateError) {
      console.error('❌ Error updating expired featured products:', updateError);
      throw new Error(`Failed to update expired products: ${updateError.message}`);
    }

    console.log(`✅ Successfully expired ${uniqueExpired.length} featured products`);
    console.log(`📋 Expired product IDs: ${productIds.join(', ')}`);

    return {
      expiredCount: uniqueExpired.length,
      expiredProducts: productIds,
      transactionId
    };

  } catch (error) {
    console.error(`❌ Featured products expiration transaction ${transactionId} failed:`, error);
    throw error;
  }
}

/**
 * Get transaction status
 */
export function getTransactionStatus(transactionId: string): TransactionState | null {
  return activeTransactions.get(transactionId) || null;
}

/**
 * Cleanup old transactions (call periodically)
 */
export function cleanupOldTransactions(): void {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  for (const [id, transaction] of activeTransactions.entries()) {
    if (transaction.startTime.getTime() < oneHourAgo) {
      console.log(`🧹 Cleaning up old transaction: ${id}`);
      activeTransactions.delete(id);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupOldTransactions, 30 * 60 * 1000);