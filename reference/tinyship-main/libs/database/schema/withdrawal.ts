import { getDialect } from '../shared/dialect';
import * as pgSchema from './pg/withdrawal';
import * as sqliteSchema from './sqlite/withdrawal';

export type { Withdrawal, NewWithdrawal } from './pg/withdrawal';
export { withdrawalStatus } from '../constants';

const _impl = ((getDialect() === 'sqlite' || getDialect() === 'd1') ? sqliteSchema : pgSchema) as typeof pgSchema;
export const withdrawal = _impl.withdrawal;
