/**
 * Configuration type definitions
 */

type BasePlan = {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  recommended?: boolean;
  i18n: {
    [locale: string]: {
      name: string;
      description: string;
      duration: string;
      features: string[];
    }
  };
};

export type RecurringPlan = BasePlan & {
  duration: { type: 'recurring'; months: number };
  stripePriceId?: string | undefined;
  stripeProductId?: string | undefined;
  creemProductId?: string | undefined;
  dodoProductId?: string | undefined;
};

export type OneTimePlan = BasePlan & {
  duration: { type: 'one_time'; months: number };
  stripePriceId?: string | undefined;
  stripeProductId?: string | undefined;
  creemProductId?: string | undefined;
  dodoProductId?: string | undefined;
};

// Credit pack plan type for token-based consumption model
export type CreditPlan = BasePlan & {
  duration: { type: 'credits' };
  credits: number;  // Number of credits user receives after purchase
  stripePriceId?: string | undefined;
  stripeProductId?: string | undefined;
  creemProductId?: string | undefined;
  dodoProductId?: string | undefined;
};

export type Plan = RecurringPlan | OneTimePlan | CreditPlan;
