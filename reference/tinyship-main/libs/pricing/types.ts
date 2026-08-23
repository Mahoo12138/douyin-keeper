import type { Plan, RecurringPlan, OneTimePlan, CreditPlan } from '@config';
import type { PricingPlan } from '@libs/database';

/**
 * Extended Plan type with dynamic pricing metadata
 */
export type PlanWithMeta = Plan & {
  originalPrice?: number | null;
  locales?: string[] | null;
  sortOrder?: number;
  paypalPlanId?: string;
};

/**
 * Input for creating a new dynamic pricing plan
 */
export interface CreatePlanInput {
  provider: string;
  amount: number;
  originalPrice?: number | null;
  currency: string;
  durationType: 'recurring' | 'one_time' | 'credits';
  durationMonths?: number | null;
  credits?: number | null;
  recommended?: boolean;
  sortOrder?: number;
  isActive?: boolean;
  locales?: string[] | null;
  stripePriceId?: string | null;
  paypalPlanId?: string | null;
  creemProductId?: string | null;
  dodoProductId?: string | null;
  i18n: Record<string, { name: string; description: string; duration?: string; features?: string | string[] }>;
}

/**
 * Normalizes features from either markdown string or string[] to string[]
 * for backward-compatible display on pricing pages.
 * Accepts: "- Feature A\n- Feature B" or ["Feature A", "Feature B"]
 */
export function normalizeFeatures(features: unknown): string[] {
  if (!features) return [];
  if (Array.isArray(features)) return features;
  if (typeof features === 'string') {
    return features
      .split('\n')
      .map(line => line.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Converts features (string[] or string) to markdown string for form editing.
 */
export function featuresToMarkdown(features: unknown): string {
  if (!features) return '';
  if (typeof features === 'string') return features;
  if (Array.isArray(features)) return features.map(f => `- ${f}`).join('\n');
  return '';
}

/**
 * Input for updating an existing dynamic pricing plan
 */
export interface UpdatePlanInput extends Partial<CreatePlanInput> {
  id: string;
}

/**
 * Converts a DB pricing plan row to the standard Plan type used by pricing pages
 */
export function dbPlanToPlanWithMeta(row: PricingPlan): PlanWithMeta {
  const rawI18n = row.i18n as Record<string, { name: string; description: string; duration: string; features: string | string[] }>;
  const normalizedI18n: Record<string, { name: string; description: string; duration: string; features: string[] }> = {};
  for (const [locale, data] of Object.entries(rawI18n)) {
    normalizedI18n[locale] = {
      ...data,
      features: normalizeFeatures(data.features),
    };
  }

  const base = {
    id: row.id,
    provider: row.provider,
    amount: parseFloat(String(row.amount)),
    currency: row.currency,
    recommended: row.recommended ?? false,
    i18n: normalizedI18n,
    originalPrice: row.originalPrice ? parseFloat(String(row.originalPrice)) : null,
    locales: row.locales ?? null,
    sortOrder: row.sortOrder ?? 0,
  };

  if (row.durationType === 'credits') {
    return {
      ...base,
      duration: { type: 'credits' },
      credits: row.credits ?? 0,
      stripePriceId: row.stripePriceId ?? undefined,
      stripeProductId: undefined,
      paypalPlanId: row.paypalPlanId ?? undefined,
      creemProductId: row.creemProductId ?? undefined,
      dodoProductId: row.dodoProductId ?? undefined,
    } as PlanWithMeta;
  }

  if (row.durationType === 'recurring') {
    return {
      ...base,
      duration: { type: 'recurring', months: row.durationMonths ?? 1 },
      stripePriceId: row.stripePriceId ?? undefined,
      stripeProductId: undefined,
      paypalPlanId: row.paypalPlanId ?? undefined,
      creemProductId: row.creemProductId ?? undefined,
      dodoProductId: row.dodoProductId ?? undefined,
    } as PlanWithMeta;
  }

  // one_time
  return {
    ...base,
    duration: { type: 'one_time', months: row.durationMonths ?? 1 },
    stripePriceId: row.stripePriceId ?? undefined,
    stripeProductId: undefined,
    paypalPlanId: row.paypalPlanId ?? undefined,
    creemProductId: row.creemProductId ?? undefined,
    dodoProductId: row.dodoProductId ?? undefined,
  } as PlanWithMeta;
}
