import { describe, expect, test } from 'vitest';
import { hmacSha256Hex, sha256Hex } from '@libs/payment/utils/web-crypto';

describe('payment web-crypto helpers', () => {
  test('sha256Hex matches known digest output', async () => {
    await expect(sha256Hex('hello')).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  test('hmacSha256Hex produces stable signatures', async () => {
    const signature = await hmacSha256Hex('secret', 'payload');

    expect(signature).toHaveLength(64);
    await expect(hmacSha256Hex('secret', 'payload')).resolves.toBe(signature);
  });
});
