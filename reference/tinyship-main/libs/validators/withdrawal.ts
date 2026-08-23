import { z } from 'zod'

type TranslationFunction = (key: string, params?: Record<string, any>) => string

const withdrawalMethodSchema = z.enum(['alipay', 'paypal', 'bank_transfer'])

export const withdrawalRequestSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  paymentMethod: withdrawalMethodSchema,
  paymentAccount: z.string().trim().min(1).max(200),
})

/**
 * Factory for withdrawal form Zod schemas with i18n error messages.
 * Follows the same pattern as createValidators() in user.ts.
 *
 * Payment method values are inlined to avoid importing server-only config
 * into client bundles.
 */
export function createWithdrawalValidators(t: TranslationFunction) {
  const withdrawalFormSchema = z.object({
    amount: z
      .string()
      .min(1, t('validators.withdrawal.amount.required'))
      .refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
        message: t('validators.withdrawal.amount.positive'),
      }),
    paymentMethod: withdrawalMethodSchema,
    paymentAccount: z
      .string()
      .min(1, t('validators.withdrawal.paymentAccount.required'))
      .max(200, t('validators.withdrawal.paymentAccount.maxLength', { max: 200 })),
  }).superRefine((value, ctx) => {
    if (!value.paymentMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paymentMethod'],
        message: t('validators.withdrawal.paymentMethod.required'),
      })
    }
  })

  return { withdrawalFormSchema }
}

export type WithdrawalValidators = ReturnType<typeof createWithdrawalValidators>
