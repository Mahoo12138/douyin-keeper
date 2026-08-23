import { getDialect } from '../shared/dialect';
import * as pgSchema from './pg/order';
import * as sqliteSchema from './sqlite/order';

export { orderStatus, paymentProviders } from '../constants';

const _impl = ((getDialect() === 'sqlite' || getDialect() === 'd1') ? sqliteSchema : pgSchema) as typeof pgSchema;
export const order = _impl.order;
