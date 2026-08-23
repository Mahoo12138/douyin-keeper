import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRoot = path.resolve(currentDir, '../..');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });

type EmailModule = typeof import('./index');

type Command = 'basic' | 'verification' | 'reset';

interface ParsedArgs {
  command: Command;
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const normalizedArgs = argv[0] === '--' ? argv.slice(1) : argv;
  const [commandArg, ...rest] = normalizedArgs;
  const command = (commandArg || 'basic') as Command;

  if (!['basic', 'verification', 'reset'].includes(command)) {
    printHelp(`Unknown command: ${commandArg}`);
    process.exit(1);
  }

  const flags: Record<string, string> = {};

  for (let i = 0; i < rest.length; i += 1) {
    const current = rest[i];
    if (!current?.startsWith('--')) continue;

    const key = current.slice(2);
    const value = rest[i + 1];

    if (!value || value.startsWith('--')) {
      flags[key] = 'true';
      i -= 1;
      continue;
    }

    flags[key] = value;
  }

  return { command, flags };
}

function printHelp(error?: string): void {
  if (error) {
    console.error(`\n${error}\n`);
  }

  console.log(`
Email smoke test

Usage:
  pnpm email:test -- basic --to you@example.com [--provider resend|cloudflare]
  pnpm email:test -- verification --to you@example.com [--provider resend|cloudflare]
  pnpm email:test -- reset --to you@example.com [--provider resend|cloudflare]

Common flags:
  --to             Recipient email (required)
  --provider       resend | cloudflare
  --from           Override sender email
  --locale         en | zh-CN (template commands only, default: en)

Basic email flags:
  --subject        Email subject
  --html           HTML body
  --text           Plain text body

Verification email flags:
  --name           Recipient name
  --url            Verification URL
  --expiry-hours   Expiration window in hours

Reset email flags:
  --name           Recipient name
  --url            Reset URL
  --expiry-hours   Expiration window in hours

Examples:
  pnpm email:test -- basic --to you@example.com --provider cloudflare --subject "Smoke Test"
  pnpm email:test -- verification --to you@example.com --provider resend --name Viking
  pnpm email:test -- reset --to you@example.com --provider cloudflare --locale zh-CN
`);
}

function requireFlag(flags: Record<string, string>, key: string): string {
  const value = flags[key];
  if (!value) {
    printHelp(`Missing required flag: --${key}`);
    process.exit(1);
  }
  return value;
}

async function run(): Promise<void> {
  const emailModule: EmailModule = await import('./index');
  const { command, flags } = parseArgs(process.argv.slice(2));
  const to = requireFlag(flags, 'to');
  const provider = flags.provider as 'resend' | 'cloudflare' | undefined;
  const from = flags.from;

  if (flags.help === 'true' || flags.h === 'true') {
    printHelp();
    return;
  }

  let result;

  if (command === 'basic') {
    result = await emailModule.sendEmail({
      to,
      from,
      provider,
      subject: flags.subject || 'TinyShip Email Smoke Test',
      html: flags.html || '<h1>TinyShip Email Smoke Test</h1><p>If you received this email, the provider is working.</p>',
      text: flags.text || 'TinyShip Email Smoke Test. If you received this email, the provider is working.',
    });
  } else if (command === 'verification') {
    result = await emailModule.sendVerificationEmail(to, {
      name: flags.name || 'TinyShip User',
      verification_url: flags.url || 'https://example.com/verify?token=email-smoke-test',
      expiry_hours: Number(flags['expiry-hours'] || '1'),
      locale: (flags.locale as 'en' | 'zh-CN') || 'en',
    }, {
      from,
      provider,
    });
  } else {
    result = await emailModule.sendResetPasswordEmail(to, {
      name: flags.name || 'TinyShip User',
      reset_url: flags.url || 'https://example.com/reset?token=email-smoke-test',
      expiry_hours: Number(flags['expiry-hours'] || '1'),
      locale: (flags.locale as 'en' | 'zh-CN') || 'en',
    }, {
      from,
      provider,
    });
  }

  if (!result.success) {
    console.error('\nEmail send failed');
    console.error(`Provider: ${result.error?.provider || provider || 'default'}`);
    console.error(`Error: ${result.error?.message || 'Unknown error'}\n`);
    process.exit(1);
  }

  console.log('\nEmail send succeeded');
  console.log(`Command: ${command}`);
  console.log(`Recipient: ${to}`);
  console.log(`Provider: ${provider || 'default'}`);
  if (result.id) {
    console.log(`Message ID: ${result.id}`);
  }
  console.log('');
}

run().catch((error) => {
  console.error('\nEmail test script crashed');
  console.error(error);
  process.exit(1);
});
