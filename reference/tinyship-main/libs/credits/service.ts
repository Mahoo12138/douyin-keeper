import { db, isD1Dialect, runD1Batch, runNativeD1Batch } from '@libs/database';
import { user, creditTransaction, creditTransactionTypes } from '@libs/database/schema';
import { eq, desc, asc, and, or, like, sql, count } from 'drizzle-orm';
import type { 
  AddCreditsParams, 
  ConsumeCreditsParams, 
  ConsumeCreditsResult,
  GetTransactionsOptions,
  GetAllTransactionsOptions,
  GetTransactionsPaginatedResult,
  CreditTransactionType
} from './types';
import type { CreditTransaction } from '@libs/database/schema/credit-transaction';

/**
 * Credit Service - Manages user credit balances and transactions
 */
export class CreditService {
  /**
   * Get the current credit balance for a user
   */
  async getBalance(userId: string): Promise<number> {
    const result = await db
      .select({ creditBalance: user.creditBalance })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!result.length) {
      return 0;
    }

    return parseFloat(result[0].creditBalance) || 0;
  }

  /**
   * Add credits to a user's account
   * Used for purchases, bonuses, refunds, and adjustments
   */
  async addCredits(params: AddCreditsParams): Promise<CreditTransaction> {
    const { userId, amount, type, orderId, description, metadata } = params;

    if (amount <= 0) {
      throw new Error('Amount must be positive when adding credits');
    }

    const transactionId = `txn_${crypto.randomUUID()}`;

    // D1's Workers binding does not accept the BEGIN/SAVEPOINT statements
    // emitted by Drizzle's transaction callback. A D1 batch is atomic and
    // executes statements in order, so it preserves the update + ledger write.
    if (isD1Dialect()) {
      const [updatedUsers, transactions] = await runD1Batch([
        db
          .update(user)
          .set({
            creditBalance: sql`${user.creditBalance} + ${amount}`,
            updatedAt: new Date(),
          })
          .where(eq(user.id, userId))
          .returning({ creditBalance: user.creditBalance }),
        db
          .insert(creditTransaction)
          .values({
            id: transactionId,
            userId,
            type,
            amount: amount.toString(),
            balance: sql`(SELECT ${user.creditBalance} FROM ${user} WHERE ${user.id} = ${userId})`,
            orderId: orderId || null,
            description: description || `${type} credits`,
            metadata: metadata || null,
          })
          .returning(),
      ]);

      if (!(updatedUsers as Array<{ creditBalance: string }>)[0]) {
        throw new Error(`User not found: ${userId}`);
      }

      return (transactions as CreditTransaction[])[0];
    }

    // Node PostgreSQL and local better-sqlite3 support Drizzle transactions.
    const result = await db.transaction(async (tx) => {
      // Update user balance
      const [updatedUser] = await tx
        .update(user)
        .set({
          creditBalance: sql`${user.creditBalance} + ${amount}`,
          updatedAt: new Date()
        })
        .where(eq(user.id, userId))
        .returning({ creditBalance: user.creditBalance });

      if (!updatedUser) {
        throw new Error(`User not found: ${userId}`);
      }

      const newBalance = parseFloat(updatedUser.creditBalance);

      // Create transaction record
      const [transaction] = await tx
        .insert(creditTransaction)
        .values({
          id: transactionId,
          userId,
          type,
          amount: amount.toString(),
          balance: newBalance.toString(),
          orderId: orderId || null,
          description: description || `${type} credits`,
          metadata: metadata || null
        })
        .returning();

      return transaction;
    });

    return result;
  }

  /**
   * Consume credits from a user's account
   * Returns success status and new balance
   * 
   * Uses atomic conditional update to prevent race conditions:
   * UPDATE ... SET credit_balance = credit_balance - amount 
   * WHERE id = userId AND credit_balance >= amount
   * 
   * This ensures that concurrent requests cannot both deduct credits
   * if the combined total would exceed the available balance.
   */
  async consumeCredits(params: ConsumeCreditsParams): Promise<ConsumeCreditsResult> {
    const { userId, amount, description, metadata } = params;

    if (amount <= 0) {
      return {
        success: false,
        newBalance: await this.getBalance(userId),
        error: 'Amount must be positive when consuming credits'
      };
    }

    try {
      if (isD1Dialect()) {
        const transactionId = `txn_${crypto.randomUUID()}`;
        const descriptionValue = description || 'Credits consumed';
        const metadataValue = metadata ? JSON.stringify(metadata) : null;

        const [updateResult] = await runNativeD1Batch([
          {
            sql: `UPDATE user
                  SET credit_balance = credit_balance - ?, updated_at = ?
                  WHERE id = ? AND credit_balance >= ?
                  RETURNING credit_balance`,
            params: [amount, Math.floor(Date.now() / 1000), userId, amount],
          },
          {
            sql: `INSERT INTO credit_transaction (id, user_id, type, amount, balance, description, metadata, created_at)
                  SELECT ?, ?, ?, ?, credit_balance, ?, ?, ?
                  FROM user WHERE id = ? AND changes() > 0`,
            params: [transactionId, userId, creditTransactionTypes.CONSUMPTION, (-amount).toString(), descriptionValue, metadataValue, Math.floor(Date.now() / 1000), userId],
          },
        ]);

        const updatedUsers = (updateResult?.results ?? []) as Array<{ credit_balance: string }>;

        if (updatedUsers.length === 0) {
          const [existingUser] = await db
            .select({ creditBalance: user.creditBalance })
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);

          if (!existingUser) {
            throw new Error(`User not found: ${userId}`);
          }

          return {
            success: false,
            newBalance: parseFloat(existingUser.creditBalance) || 0,
            error: 'Insufficient credits',
          };
        }

        const newBalance = parseFloat(updatedUsers[0].credit_balance);
        return { success: true, newBalance, transactionId };
      }

      const result = await db.transaction(async (tx) => {
        // Atomic conditional update: only deduct if balance is sufficient
        // This prevents race conditions by combining check and update in one SQL statement
        const updateResult = await tx
          .update(user)
          .set({
            creditBalance: sql`${user.creditBalance} - ${amount}`,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(user.id, userId),
              sql`${user.creditBalance} >= ${amount}`
            )
          )
          .returning({ creditBalance: user.creditBalance });

        // If no row was updated, either user doesn't exist or insufficient credits
        if (updateResult.length === 0) {
          // Check if user exists to provide accurate error message
          const [existingUser] = await tx
            .select({ creditBalance: user.creditBalance })
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);

          if (!existingUser) {
            throw new Error(`User not found: ${userId}`);
          }

          // User exists but has insufficient credits
          return {
            success: false,
            newBalance: parseFloat(existingUser.creditBalance) || 0,
            error: 'Insufficient credits'
          };
        }

        const newBalance = parseFloat(updateResult[0].creditBalance);

        // Create transaction record (negative amount for consumption)
        const transactionId = `txn_${crypto.randomUUID()}`;
        await tx.insert(creditTransaction).values({
          id: transactionId,
          userId,
          type: creditTransactionTypes.CONSUMPTION,
          amount: (-amount).toString(),  // Negative for consumption
          balance: newBalance.toString(),
          description: description || 'Credits consumed',
          metadata: metadata || null
        });

        return {
          success: true,
          newBalance,
          transactionId
        };
      });

      return result;
    } catch (error) {
      console.error('Error consuming credits:', error);
      return {
        success: false,
        newBalance: await this.getBalance(userId),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if user has enough credits for an operation
   */
  async hasEnoughCredits(userId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(userId);
    return balance >= amount;
  }

  /**
   * Get credit transaction history for a user (simple version)
   */
  async getTransactions(
    userId: string, 
    options: GetTransactionsOptions = {}
  ): Promise<CreditTransaction[]> {
    const { limit = 50, offset = 0, type } = options;

    let query = db
      .select()
      .from(creditTransaction)
      .where(
        type 
          ? and(
              eq(creditTransaction.userId, userId),
              eq(creditTransaction.type, type)
            )
          : eq(creditTransaction.userId, userId)
      )
      .orderBy(desc(creditTransaction.createdAt))
      .limit(limit)
      .offset(offset);

    return query;
  }

  /**
   * Get credit transaction history with pagination info
   */
  async getTransactionsPaginated(
    userId: string, 
    options: GetTransactionsOptions = {}
  ): Promise<GetTransactionsPaginatedResult> {
    const { page = 1, limit = 10, type } = options;
    const offset = (page - 1) * limit;

    const whereCondition = type 
      ? and(
          eq(creditTransaction.userId, userId),
          eq(creditTransaction.type, type)
        )
      : eq(creditTransaction.userId, userId);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(creditTransaction)
      .where(whereCondition);
    
    const total = countResult[0]?.count || 0;

    // Get paginated transactions
    const transactions = await db
      .select()
      .from(creditTransaction)
      .where(whereCondition)
      .orderBy(desc(creditTransaction.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      transactions,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get all credit transactions across all users (admin only)
   * Supports pagination, search, filtering, and sorting
   */
  async getAllTransactionsPaginated(
    options: GetAllTransactionsOptions = {}
  ): Promise<GetTransactionsPaginatedResult & { transactions: Array<CreditTransaction & { userEmail?: string | null; userName?: string | null }> }> {
    const { 
      page = 1, 
      limit = 10, 
      searchField, 
      searchValue, 
      type, 
      userId,
      sortBy = 'createdAt',
      sortDirection = 'desc'
    } = options;
    
    const offset = (page - 1) * limit;
    
    // Build where conditions
    const whereConditions: any[] = [];
    
    // Search conditions
    if (searchValue && searchField) {
      switch (searchField) {
        case 'id':
          whereConditions.push(eq(creditTransaction.id, searchValue));
          break;
        case 'userId':
          whereConditions.push(eq(creditTransaction.userId, searchValue));
          break;
        case 'userEmail':
          whereConditions.push(like(user.email, `%${searchValue}%`));
          break;
        case 'userName':
          whereConditions.push(like(user.name, `%${searchValue}%`));
          break;
        case 'description':
          whereConditions.push(like(creditTransaction.description, `%${searchValue}%`));
          break;
      }
    }
    
    // Filter by transaction type
    if (type) {
      whereConditions.push(eq(creditTransaction.type, type));
    }
    
    // Filter by user ID
    if (userId) {
      whereConditions.push(eq(creditTransaction.userId, userId));
    }
    
    // Build where clause - only use and() if we have conditions
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;
    
    // Get total count
    const countQuery = db
      .select({ count: count() })
      .from(creditTransaction)
      .leftJoin(user, eq(creditTransaction.userId, user.id));
    
    const countResult = whereClause 
      ? await countQuery.where(whereClause)
      : await countQuery;
    
    const total = countResult[0]?.count || 0;
    
    // Build sorting
    let orderBy;
    switch (sortBy) {
      case 'id':
        orderBy = sortDirection === 'desc' ? desc(creditTransaction.id) : asc(creditTransaction.id);
        break;
      case 'userId':
        orderBy = sortDirection === 'desc' ? desc(creditTransaction.userId) : asc(creditTransaction.userId);
        break;
      case 'userEmail':
        orderBy = sortDirection === 'desc' ? desc(user.email) : asc(user.email);
        break;
      case 'type':
        orderBy = sortDirection === 'desc' ? desc(creditTransaction.type) : asc(creditTransaction.type);
        break;
      case 'amount':
        orderBy = sortDirection === 'desc' ? desc(creditTransaction.amount) : asc(creditTransaction.amount);
        break;
      case 'createdAt':
      default:
        orderBy = sortDirection === 'desc' ? desc(creditTransaction.createdAt) : asc(creditTransaction.createdAt);
        break;
    }
    
    // Build data query
    const dataQuery = db
      .select({
        id: creditTransaction.id,
        userId: creditTransaction.userId,
        type: creditTransaction.type,
        amount: creditTransaction.amount,
        balance: creditTransaction.balance,
        orderId: creditTransaction.orderId,
        description: creditTransaction.description,
        metadata: creditTransaction.metadata,
        createdAt: creditTransaction.createdAt,
        // User info
        userEmail: user.email,
        userName: user.name,
      })
      .from(creditTransaction)
      .leftJoin(user, eq(creditTransaction.userId, user.id));
    
    // Get paginated transactions with user info
    const transactions = whereClause
      ? await dataQuery.where(whereClause).orderBy(orderBy).limit(limit).offset(offset)
      : await dataQuery.orderBy(orderBy).limit(limit).offset(offset);
    
    return {
      transactions: transactions as any,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get credit status summary for a user
   * Includes balance and recent transaction count
   */
  async getStatus(userId: string): Promise<{
    balance: number;
    totalPurchased: number;
    totalConsumed: number;
  }> {
    const balance = await this.getBalance(userId);

    // Get aggregated stats
    const stats = await db
      .select({
        type: creditTransaction.type,
        total: sql<string>`SUM(ABS(${creditTransaction.amount}))`
      })
      .from(creditTransaction)
      .where(eq(creditTransaction.userId, userId))
      .groupBy(creditTransaction.type);

    let totalPurchased = 0;
    let totalConsumed = 0;

    for (const stat of stats) {
      const amount = parseFloat(stat.total) || 0;
      if (stat.type === 'purchase' || stat.type === 'bonus') {
        totalPurchased += amount;
      } else if (stat.type === 'consumption') {
        totalConsumed += amount;
      }
    }

    return {
      balance,
      totalPurchased,
      totalConsumed
    };
  }
}

// Export singleton instance
export const creditService = new CreditService();
