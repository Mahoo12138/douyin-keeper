import { db, pricingPlan } from '@libs/database';
import { eq, and, asc } from 'drizzle-orm';
import type { PlanWithMeta } from './types';
import { dbPlanToPlanWithMeta } from './types';

/**
 * Dynamic Pricing Plan Service - handles DB queries for pricing plans
 */
export class DynamicPlanService {
  /**
   * Get all active plans, ordered by sortOrder
   */
  async getActivePlans(): Promise<PlanWithMeta[]> {
    const rows = await db
      .select()
      .from(pricingPlan)
      .where(eq(pricingPlan.isActive, true))
      .orderBy(asc(pricingPlan.sortOrder), asc(pricingPlan.createdAt));

    return rows.map(dbPlanToPlanWithMeta);
  }

  /**
   * Get a single plan by ID (active or inactive)
   */
  async getPlanById(planId: string): Promise<PlanWithMeta | null> {
    const rows = await db
      .select()
      .from(pricingPlan)
      .where(eq(pricingPlan.id, planId))
      .limit(1);

    if (!rows.length) return null;
    return dbPlanToPlanWithMeta(rows[0]);
  }

  /**
   * Get a single active plan by ID — used by checkout so that
   * deactivated (soft-deleted) plans cannot be purchased.
   */
  async getActivePlanById(planId: string): Promise<PlanWithMeta | null> {
    const rows = await db
      .select()
      .from(pricingPlan)
      .where(and(eq(pricingPlan.id, planId), eq(pricingPlan.isActive, true)))
      .limit(1);

    if (!rows.length) return null;
    return dbPlanToPlanWithMeta(rows[0]);
  }

  /**
   * Get all plans (including inactive) for admin panel
   */
  async getAllPlans(): Promise<PlanWithMeta[]> {
    const rows = await db
      .select()
      .from(pricingPlan)
      .orderBy(asc(pricingPlan.sortOrder), asc(pricingPlan.createdAt));

    return rows.map(dbPlanToPlanWithMeta);
  }
}

export const dynamicPlanService = new DynamicPlanService();
