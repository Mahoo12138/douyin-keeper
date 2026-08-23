/**
 * Credit transaction types
 */
export type CreditTransactionType = 
  | 'purchase'      // Credits purchased via payment
  | 'consumption'   // Credits consumed by usage
  | 'refund'        // Credits refunded
  | 'bonus'         // Bonus credits awarded
  | 'adjustment';   // Manual adjustment by admin

/**
 * Parameters for adding credits to a user account
 */
export interface AddCreditsParams {
  userId: string;
  amount: number;
  type: 'purchase' | 'bonus' | 'refund' | 'adjustment';
  orderId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for consuming credits from a user account
 */
export interface ConsumeCreditsParams {
  userId: string;
  amount: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of a credit consumption operation
 */
export interface ConsumeCreditsResult {
  success: boolean;
  newBalance: number;
  transactionId?: string;
  error?: string;
}

/**
 * Options for querying credit transactions
 */
export interface GetTransactionsOptions {
  limit?: number;
  offset?: number;
  page?: number;
  type?: CreditTransactionType;
}

/**
 * Options for querying all users' credit transactions (admin)
 */
export interface GetAllTransactionsOptions {
  page?: number;
  limit?: number;
  searchField?: string;
  searchValue?: string;
  type?: CreditTransactionType;
  userId?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

/**
 * Paginated result for credit transactions
 */
export interface GetTransactionsPaginatedResult {
  transactions: import('@libs/database/schema/credit-transaction').CreditTransaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * AI usage metadata stored with consumption transactions
 */
export interface AIUsageMetadata {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  messageCount?: number;
}

/**
 * Parameters for calculating credit consumption
 */
export interface CalculateConsumptionParams {
  totalTokens: number;
  model: string;
  provider: string;
  /** Operation type for fixed consumption mode: 'aiChat' | 'aiImage' */
  type?: 'aiChat' | 'aiImage';
}

