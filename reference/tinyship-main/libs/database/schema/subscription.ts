import { getDialect } from '../shared/dialect';
import * as pgSchema from './pg/subscription';
import * as sqliteSchema from './sqlite/subscription';

export { subscriptionStatus, paymentTypes } from '../constants';

const _impl = ((getDialect() === 'sqlite' || getDialect() === 'd1') ? sqliteSchema : pgSchema) as typeof pgSchema;
export const subscription = _impl.subscription;
