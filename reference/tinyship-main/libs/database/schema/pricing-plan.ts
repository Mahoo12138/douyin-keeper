import { getDialect } from '../shared/dialect';
import * as pgSchema from './pg/pricing-plan';
import * as sqliteSchema from './sqlite/pricing-plan';

export type { PricingPlan, NewPricingPlan } from './pg/pricing-plan';
export { planDurationTypes } from '../constants';

const _impl = ((getDialect() === 'sqlite' || getDialect() === 'd1') ? sqliteSchema : pgSchema) as typeof pgSchema;
export const pricingPlan = _impl.pricingPlan;
