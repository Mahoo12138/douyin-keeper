import { config } from '@config';
import type { Plan } from '@config';
import { dynamicPlanService } from './service';
import type { PlanWithMeta } from './types';

export { dynamicPlanService } from './service';
export { pricingAdminService } from './admin';
export { dbPlanToPlanWithMeta } from './types';
export type { PlanWithMeta, CreatePlanInput, UpdatePlanInput } from './types';

/**
 * Get all active pricing plans based on pricingMode config.
 * Returns static config plans or dynamic DB plans depending on mode.
 */
export async function getActivePlans(): Promise<PlanWithMeta[]> {
  if (config.payment.pricingMode === 'static') {
    return staticPlansToMeta();
  }
  return dynamicPlanService.getActivePlans();
}

/**
 * Get a single plan by ID based on pricingMode config.
 */
export async function getPlanById(planId: string): Promise<PlanWithMeta | null> {
  if (config.payment.pricingMode === 'static') {
    const plan = (config.payment.plans as Record<string, any>)[planId];
    if (!plan) return null;
    return staticPlanToMeta(planId, plan);
  }
  return dynamicPlanService.getPlanById(planId);
}

/**
 * Get a single purchasable plan by ID — used by checkout (payment initiate).
 * In dynamic mode only active plans are returned, so deactivated
 * (soft-deleted) plans cannot be purchased. Webhook fulfilment should
 * keep using getPlanById to resolve historical orders.
 */
export async function getPurchasablePlanById(planId: string): Promise<PlanWithMeta | null> {
  if (config.payment.pricingMode === 'static') {
    const plan = (config.payment.plans as Record<string, any>)[planId];
    if (!plan) return null;
    return staticPlanToMeta(planId, plan);
  }
  return dynamicPlanService.getActivePlanById(planId);
}

/**
 * Filter plans by user locale.
 * Plans with locales=null are shown to all users.
 * Plans with specific locales are only shown to matching users.
 */
export function getPlansForLocale(plans: PlanWithMeta[], locale: string): PlanWithMeta[] {
  return plans.filter(p => !p.locales || p.locales.includes(locale));
}

/**
 * Convert all static config plans to PlanWithMeta format
 */
function staticPlansToMeta(): PlanWithMeta[] {
  return Object.entries(config.payment.plans).map(([key, plan], index) => {
    return staticPlanToMeta(key, plan, index);
  });
}

/**
 * Convert a single static config plan to PlanWithMeta
 */
function staticPlanToMeta(key: string, plan: any, sortOrder = 0): PlanWithMeta {
  return {
    ...plan,
    id: key,
    originalPrice: null,
    locales: null,
    sortOrder,
  } as PlanWithMeta;
}
