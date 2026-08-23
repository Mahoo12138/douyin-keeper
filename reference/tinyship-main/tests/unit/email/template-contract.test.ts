process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'https://app.example.com';

import { beforeAll, describe, expect, test } from 'vitest';

describe('compiled email template contract', () => {
  let generateVerificationEmail: typeof import('@libs/email/templates/index').generateVerificationEmail;
  let generateResetPasswordEmail: typeof import('@libs/email/templates/index').generateResetPasswordEmail;

  beforeAll(async () => {
    ({ generateVerificationEmail, generateResetPasswordEmail } = await import('@libs/email/templates/index'));
  });

  test('verification email renders without unresolved placeholders', () => {
    const { html, subject } = generateVerificationEmail({
      name: 'Test User',
      verification_url: 'https://app.example.com/verify?token=abc',
      expiry_hours: 24,
      locale: 'en',
    });

    expect(subject.length).toBeGreaterThan(0);
    expect(html).not.toMatch(/\{\{[{]{0,2}[^}]+\}\}{0,2}\}/);
  });

  test('reset-password email renders without unresolved placeholders', () => {
    const { html, subject } = generateResetPasswordEmail({
      name: 'Test User',
      reset_url: 'https://app.example.com/reset?token=abc',
      expiry_hours: 1,
      locale: 'zh-CN',
    });

    expect(subject.length).toBeGreaterThan(0);
    expect(html).not.toMatch(/\{\{[{]{0,2}[^}]+\}\}{0,2}\}/);
  });
});
