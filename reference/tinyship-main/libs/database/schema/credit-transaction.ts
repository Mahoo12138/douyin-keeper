import { getDialect } from '../shared/dialect';
import * as pgSchema from './pg/credit-transaction';
import * as sqliteSchema from './sqlite/credit-transaction';

export type { CreditTransaction, NewCreditTransaction } from './pg/credit-transaction';
export { creditTransactionTypes } from '../constants';

const _impl = ((getDialect() === 'sqlite' || getDialect() === 'd1') ? sqliteSchema : pgSchema) as typeof pgSchema;
export const creditTransaction = _impl.creditTransaction;
