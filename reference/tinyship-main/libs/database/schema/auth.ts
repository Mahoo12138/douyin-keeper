import { getDialect } from '../shared/dialect';
import * as pgSchema from './pg/auth';
import * as sqliteSchema from './sqlite/auth';

const _impl = ((getDialect() === 'sqlite' || getDialect() === 'd1') ? sqliteSchema : pgSchema) as typeof pgSchema;
export const account = _impl.account;
export const session = _impl.session;
export const verification = _impl.verification;
