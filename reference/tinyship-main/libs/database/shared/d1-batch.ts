import { getDialect } from './dialect';

export type D1BatchCapable = {
  batch: <T extends readonly unknown[]>(statements: T) => Promise<{ [K in keyof T]: unknown }>;
};

/**
 * Create a D1 batch runner bound to a specific database instance.
 */
export function createRunD1Batch(db: D1BatchCapable) {
  return async function runD1Batch<T extends readonly unknown[]>(
    statements: T,
  ): Promise<{ [K in keyof T]: unknown }> {
    if (getDialect() !== 'd1') {
      throw new Error('[db] runD1Batch requires DB_DIALECT=d1');
    }

    return db.batch(statements);
  };
}
