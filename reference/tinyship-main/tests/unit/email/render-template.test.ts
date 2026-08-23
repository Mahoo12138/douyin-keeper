import { describe, expect, test } from 'vitest';
import { renderTemplate } from '@libs/email/templates/render';

describe('renderTemplate', () => {
  test('escapes double-brace interpolation values', () => {
    const html = renderTemplate('<p>{{message}}</p>', {
      message: '<script>alert(1)</script>',
    });

    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  test('preserves triple-brace raw interpolation values', () => {
    const html = renderTemplate('<a href="{{{url}}}">link</a>', {
      url: 'https://example.com/verify?token=abc',
    });

    expect(html).toBe('<a href="https://example.com/verify?token=abc">link</a>');
  });

  test('resolves nested dot-path interpolation', () => {
    const html = renderTemplate('<h1>{{translations.email.verification.subject}}</h1>', {
      translations: {
        email: {
          verification: {
            subject: 'Verify your email',
          },
        },
      },
    });

    expect(html).toBe('<h1>Verify your email</h1>');
  });

  test('renders missing keys as empty strings', () => {
    const html = renderTemplate('Hello {{name}}!', {});

    expect(html).toBe('Hello !');
  });

  test('does not evaluate handlebars block helpers when enabled', () => {
    const template = '{{#if enabled}}visible{{/if}}';
    const html = renderTemplate(template, { enabled: true });

    expect(html).toBe('visible');
    expect(html).not.toContain('{{#if');
  });

  test('still renders block body when condition is false because conditionals are unsupported', () => {
    const template = '{{#if enabled}}visible{{/if}}';
    const html = renderTemplate(template, { enabled: false });

    expect(html).toBe('visible');
    expect(html).not.toContain('{{#if');
  });
});
