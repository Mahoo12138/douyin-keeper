process.env.CREEM_API_KEY = process.env.CREEM_API_KEY || 'creem_test_key';
process.env.CREEM_WEBHOOK_SECRET = process.env.CREEM_WEBHOOK_SECRET || 'whsec_test_secret';
process.env.CREEM_SERVER_URL = process.env.CREEM_SERVER_URL || 'https://test-api.creem.io';

import { beforeAll, describe, expect, test } from 'vitest';

describe('Creem return URL verification', () => {
  let createPaymentProvider: typeof import('@libs/payment').createPaymentProvider;

  beforeAll(async () => {
    ({ createPaymentProvider } = await import('@libs/payment'));
  });

  test('verifyReturnUrl resolves asynchronously and rejects invalid signatures', async () => {
    const provider = createPaymentProvider('creem');
    const result = await provider.verifyReturnUrl(
      'https://example.com/success?checkout_id=ch_test123&order_id=ord_test456&signature=invalid_signature',
    );

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });
});
