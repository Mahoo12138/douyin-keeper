import { db, pricingPlan } from '@libs/database';
import type { PricingPlan } from '@libs/database';
import { eq, asc } from 'drizzle-orm';
import type { CreatePlanInput, UpdatePlanInput } from './types';

/**
 * Admin operations for managing dynamic pricing plans
 */
export class PricingAdminService {
  /**
   * Get all plans for admin (including inactive)
   */
  async getAllPlans(): Promise<PricingPlan[]> {
    return db
      .select()
      .from(pricingPlan)
      .orderBy(asc(pricingPlan.sortOrder), asc(pricingPlan.createdAt));
  }

  /**
   * Create a new pricing plan
   */
  async createPlan(input: CreatePlanInput): Promise<PricingPlan> {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

    const [result] = await db
      .insert(pricingPlan)
      .values({
        id,
        provider: input.provider,
        amount: String(input.amount),
        originalPrice: input.originalPrice != null ? String(input.originalPrice) : null,
        currency: input.currency,
        durationType: input.durationType,
        durationMonths: input.durationMonths ?? null,
        credits: input.credits ?? null,
        recommended: input.recommended ?? false,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        locales: input.locales ?? null,
        stripePriceId: input.stripePriceId ?? null,
        paypalPlanId: input.paypalPlanId ?? null,
        creemProductId: input.creemProductId ?? null,
        dodoProductId: input.dodoProductId ?? null,
        i18n: input.i18n,
      })
      .returning();

    return result;
  }

  /**
   * Update an existing pricing plan
   */
  async updatePlan(input: UpdatePlanInput): Promise<PricingPlan | null> {
    const updateData: Record<string, any> = {};

    if (input.provider !== undefined) updateData.provider = input.provider;
    if (input.amount !== undefined) updateData.amount = String(input.amount);
    if (input.originalPrice !== undefined) updateData.originalPrice = input.originalPrice != null ? String(input.originalPrice) : null;
    if (input.currency !== undefined) updateData.currency = input.currency;
    if (input.durationType !== undefined) updateData.durationType = input.durationType;
    if (input.durationMonths !== undefined) updateData.durationMonths = input.durationMonths;
    if (input.credits !== undefined) updateData.credits = input.credits;
    if (input.recommended !== undefined) updateData.recommended = input.recommended;
    if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.locales !== undefined) updateData.locales = input.locales;
    if (input.stripePriceId !== undefined) updateData.stripePriceId = input.stripePriceId;
    if (input.paypalPlanId !== undefined) updateData.paypalPlanId = input.paypalPlanId;
    if (input.creemProductId !== undefined) updateData.creemProductId = input.creemProductId;
    if (input.dodoProductId !== undefined) updateData.dodoProductId = input.dodoProductId;
    if (input.i18n !== undefined) updateData.i18n = input.i18n;

    updateData.updatedAt = new Date();

    const [result] = await db
      .update(pricingPlan)
      .set(updateData)
      .where(eq(pricingPlan.id, input.id))
      .returning();

    return result ?? null;
  }

  /**
   * Soft-delete a plan (set isActive = false)
   */
  async deletePlan(planId: string): Promise<boolean> {
    const [result] = await db
      .update(pricingPlan)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(pricingPlan.id, planId))
      .returning();

    return !!result;
  }

  /**
   * Hard-delete a plan (permanent removal)
   */
  async hardDeletePlan(planId: string): Promise<boolean> {
    const result = await db
      .delete(pricingPlan)
      .where(eq(pricingPlan.id, planId))
      .returning();

    return result.length > 0;
  }

  /**
   * Update sort order for multiple plans
   */
  async reorderPlans(planOrders: { id: string; sortOrder: number }[]): Promise<void> {
    for (const { id, sortOrder } of planOrders) {
      await db
        .update(pricingPlan)
        .set({ sortOrder, updatedAt: new Date() })
        .where(eq(pricingPlan.id, id));
    }
  }

  /**
   * Import plans from static config into the database
   */
  async importFromStaticConfig(plans: Record<string, any>): Promise<number> {
    let count = 0;
    const entries = Object.entries(plans);

    for (let i = 0; i < entries.length; i++) {
      const [key, plan] = entries[i];
      const p = plan as any;

      await this.createPlan({
        provider: p.provider,
        amount: p.amount,
        currency: p.currency,
        durationType: p.duration?.type ?? 'one_time',
        durationMonths: p.duration?.months ?? null,
        credits: p.credits ?? null,
        recommended: p.recommended ?? false,
        sortOrder: i,
        isActive: true,
        locales: null,
        stripePriceId: p.stripePriceId ?? null,
        paypalPlanId: p.paypalPlanId ?? null,
        creemProductId: p.creemProductId ?? null,
        dodoProductId: p.dodoProductId ?? null,
        i18n: p.i18n ?? {},
      });
      count++;
    }

    return count;
  }
}

export const pricingAdminService = new PricingAdminService();
