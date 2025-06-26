/**
 * Supabase-based boost operations
 * This replaces the PostgreSQL transaction-based approach to avoid role permission issues
 */

import { supabase } from './supabase';
import { BoostOrderError, BoostDatabaseError, BoostErrorCode, logBoostError } from './boost-errors';
import crypto from 'crypto';

// Transaction state tracking (in-memory for now)
const activeTransactions = new Map<string, any>();

/**
 * Generate unique transaction ID
 */
export function generateTransactionId(): string {
  return `boost_tx_${crypto.randomUUID()}`;
}

/**
 * Track operation within a transaction
 */
export function trackOperation(transactionId: string, operation: string): void {
  const state = activeTransactions.get(transactionId);
  if (state) {
    state.operations = state.operations || [];
    state.operations.push({
      operation,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Execute boost operations using Supabase
 * This replaces the db.transaction approach with Supabase operations
 */
export async function executeSupabaseBoostTransaction<T>(
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

  const transactionId = generateTransactionId();
  const startTime = new Date();
  
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    
    const transactionState = {
      id: transactionId,
      operations: [],
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
      console.log(`🔄 Starting Supabase boost transaction ${transactionId} (attempt ${attempt}/${maxRetries})`);
      
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

      // Execute operations with timeout
      const resultPromise = (async () => {
        transactionState.status = 'pending';
        
        try {
          // Execute the operations directly with Supabase
          const result = await operations(transactionId);
          
          // Mark transaction as committed
          transactionState.status = 'committed';
          
          console.log(`✅ Supabase boost transaction ${transactionId} committed successfully`);
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
      })();

      const result = await Promise.race([resultPromise, timeoutPromise]);
      
      // Cleanup successful transaction
      activeTransactions.delete(transactionId);
      
      return result;
      
    } catch (error) {
      lastError = error as Error;
      
      console.error(`❌ Supabase boost transaction ${transactionId} failed (attempt ${attempt}/${maxRetries}):`, error);
      
      // Clean up failed transaction
      activeTransactions.delete(transactionId);
      
      // Check if we should retry
      const shouldRetry = 
        attempt < maxRetries && 
        !(error instanceof BoostOrderError) && // Don't retry business logic errors
        !error.message?.includes('duplicate key'); // Don't retry duplicates
      
      if (!shouldRetry) {
        throw error;
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
    transactionId,
    attempts: maxRetries,
    metadata,
    lastError: lastError?.message
  });

  throw finalError;
}

// Export functions that match the original boost-transactions.ts interface
export {
  trackOperation as trackBoostOperation,
  generateTransactionId as generateBoostTransactionId
};

// Re-export idempotency functions from boost-transactions
export { 
  checkIdempotentOperation, 
  storeIdempotentOperation 
} from './boost-transactions';

// Re-export the new Supabase-based transaction function as the default
export const executeBoostTransaction = executeSupabaseBoostTransaction;