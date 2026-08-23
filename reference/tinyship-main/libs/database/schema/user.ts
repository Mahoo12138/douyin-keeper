import { getDialect } from '../shared/dialect';
import * as pgSchema from './pg/user';
import * as sqliteSchema from './sqlite/user';

export type { User, NewUser } from './pg/user';

const _impl = ((getDialect() === 'sqlite' || getDialect() === 'd1') ? sqliteSchema : pgSchema) as typeof pgSchema;
export const user = _impl.user;
