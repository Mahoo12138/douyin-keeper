process.env.CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'acct_123';
process.env.CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'token_123';
process.env.EMAIL_DEFAULT_FROM = process.env.EMAIL_DEFAULT_FROM || 'noreply@example.com';
process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'https://example.com';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

let sendEmailByCloudflare: typeof import('@libs/email/providers/cloudflare').sendEmailByCloudflare;
let sendEmail: typeof import('@libs/email').sendEmail;
let sendResetPasswordEmail: typeof import('@libs/email').sendResetPasswordEmail;
let sendVerificationEmail: typeof import('@libs/email').sendVerificationEmail;

const originalAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const originalApiToken = process.env.CLOUDFLARE_API_TOKEN;
const originalDefaultFrom = process.env.EMAIL_DEFAULT_FROM;
const originalBaseUrl = process.env.APP_BASE_URL;

describe('Cloudflare email provider', () => {
  beforeAll(async () => {
    ({ sendEmailByCloudflare } = await import('@libs/email/providers/cloudflare'));
    ({ sendEmail, sendResetPasswordEmail, sendVerificationEmail } = await import('@libs/email'));
  });

  beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct_123';
    process.env.CLOUDFLARE_API_TOKEN = 'token_123';
    process.env.EMAIL_DEFAULT_FROM = 'noreply@example.com';
    process.env.APP_BASE_URL = 'https://example.com';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (originalAccountId === undefined) {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
    } else {
      process.env.CLOUDFLARE_ACCOUNT_ID = originalAccountId;
    }

    if (originalApiToken === undefined) {
      delete process.env.CLOUDFLARE_API_TOKEN;
    } else {
      process.env.CLOUDFLARE_API_TOKEN = originalApiToken;
    }

    if (originalDefaultFrom === undefined) {
      delete process.env.EMAIL_DEFAULT_FROM;
    } else {
      process.env.EMAIL_DEFAULT_FROM = originalDefaultFrom;
    }

    if (originalBaseUrl === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = originalBaseUrl;
    }
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  test('maps request fields to Cloudflare REST API shape', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      success: true,
      errors: [],
      messages: [],
      result: {
        delivered: ['user@example.com'],
        permanent_bounces: [],
        queued: [],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await sendEmailByCloudflare({
      to: 'user@example.com',
      subject: 'Welcome',
      html: '<p>Hello</p>',
      text: 'Hello',
      cc: ['manager@example.com'],
      bcc: 'audit@example.com',
      replyTo: 'support@example.com',
    });

    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/acct_123/email/sending/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token_123',
          'Content-Type': 'application/json',
        }),
      })
    );

    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      to: 'user@example.com',
      from: 'noreply@example.com',
      subject: 'Welcome',
      html: '<p>Hello</p>',
      text: 'Hello',
      cc: ['manager@example.com'],
      bcc: 'audit@example.com',
      reply_to: 'support@example.com',
    });
  });

  test('maps Cloudflare API errors into shared response shape', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      success: false,
      errors: [{ code: 1000, message: 'Sender domain not verified' }],
      result: null,
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await sendEmailByCloudflare({
      to: 'user@example.com',
      from: 'noreply@example.com',
      subject: 'Welcome',
      html: '<p>Hello</p>',
    });

    expect(result).toEqual({
      success: false,
      error: {
        message: 'Sender domain not verified',
        name: 'CloudflareEmailError',
        provider: 'cloudflare',
      }
    });
  });

  test('shared sendEmail uses config default provider when provider is omitted', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      success: true,
      errors: [],
      messages: [],
      result: {
        delivered: ['user@example.com'],
        permanent_bounces: [],
        queued: [],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Default provider test',
      html: '<p>Hello</p>',
      text: 'Hello',
    });

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('template helpers can send through the cloudflare provider', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({
      success: true,
      errors: [],
      messages: [],
      result: {
        delivered: ['user@example.com'],
        permanent_bounces: [],
        queued: [],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const verificationResult = await sendVerificationEmail('user@example.com', {
      name: 'Viking',
      verification_url: 'https://example.com/verify?token=123',
      expiry_hours: 1,
      locale: 'en',
    }, {
      provider: 'cloudflare',
    });

    const resetResult = await sendResetPasswordEmail('user@example.com', {
      name: 'Viking',
      reset_url: 'https://example.com/reset?token=456',
      expiry_hours: 1,
      locale: 'en',
    }, {
      provider: 'cloudflare',
    });

    expect(verificationResult.success).toBe(true);
    expect(resetResult.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('template helpers use config default provider when provider is omitted', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({
      success: true,
      errors: [],
      messages: [],
      result: {
        delivered: ['user@example.com'],
        permanent_bounces: [],
        queued: [],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const verificationResult = await sendVerificationEmail('user@example.com', {
      name: 'Viking',
      verification_url: 'https://example.com/verify?token=789',
      expiry_hours: 1,
      locale: 'en',
    });

    const resetResult = await sendResetPasswordEmail('user@example.com', {
      name: 'Viking',
      reset_url: 'https://example.com/reset?token=abc',
      expiry_hours: 1,
      locale: 'en',
    });

    expect(verificationResult.success).toBe(true);
    expect(resetResult.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
