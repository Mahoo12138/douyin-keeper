import { getDialect } from '../shared/dialect';
import * as pgSchema from './pg/commission';
import * as sqliteSchema from './sqlite/commission';

export type { Commission, NewCommission } from './pg/commission';
export { commissionStatus } from '../constants';

const _impl = ((getDialect() === 'sqlite' || getDialect() === 'd1') ? sqliteSchema : pgSchema) as typeof pgSchema;
export const commission = _impl.commission;
