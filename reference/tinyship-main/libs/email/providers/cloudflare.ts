import { config } from '@config';
import { EmailOptions, EmailResponse } from '../types';

interface CloudflareApiError {
  code?: number;
  message?: string;
}

interface CloudflareSendResponse {
  success: boolean;
  errors?: CloudflareApiError[];
  messages?: { code?: number; message?: string }[];
  result?: {
    delivered?: string[];
    permanent_bounces?: string[];
    queued?: string[];
  } | null;
}

function buildCloudflareEndpoint(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;
}

function getMissingConfigMessage(): string {
  return 'Missing Cloudflare Email configuration. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to use the cloudflare provider.';
}

function getFirstErrorMessage(payload: CloudflareSendResponse): string {
  return payload.errors?.[0]?.message
    || payload.messages?.[0]?.message
    || 'Cloudflare Email request failed';
}

export async function sendEmailByCloudflare(options: EmailOptions): Promise<EmailResponse> {
  const accountId = config.email.cloudflare.accountId;
  const apiToken = config.email.cloudflare.apiToken;

  if (!accountId || !apiToken) {
    return {
      success: false,
      error: {
        message: getMissingConfigMessage(),
        name: 'CloudflareEmailError',
        provider: 'cloudflare',
      }
    };
  }

  try {
    const response = await fetch(buildCloudflareEndpoint(accountId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: options.to,
        from: options.from || config.email.defaultFrom!,
        subject: options.subject,
        html: options.html,
        text: options.text,
        cc: options.cc,
        bcc: options.bcc,
        reply_to: options.replyTo,
      }),
    });

    const payload = await response.json() as CloudflareSendResponse;

    if (!response.ok || !payload.success) {
      return {
        success: false,
        error: {
          message: getFirstErrorMessage(payload),
          name: 'CloudflareEmailError',
          provider: 'cloudflare',
        }
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error('Failed to send email via Cloudflare:', error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: 'CloudflareEmailError',
        provider: 'cloudflare',
      }
    };
  }
}
