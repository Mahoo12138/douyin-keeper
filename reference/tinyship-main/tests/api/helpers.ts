/**
 * Minimal API test helpers.
 *
 * Uses native fetch (Node 22+) — no extra dependencies.
 * Tests run against whichever app is serving on BASE_URL (default :7001).
 */

export const BASE_URL =
  process.env.API_TEST_BASE_URL || 'http://localhost:7001';

export function uniqueEmail(prefix = 'api'): string {
  const slug = prefix.startsWith('e2e-') ? prefix.slice(4) : prefix;
  return `e2e-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

function extractCookies(res: Response): string {
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

/**
 * Make an HTTP request to the running app.
 * Cookies are passed manually (Node fetch has no cookie jar).
 * `redirect: 'manual'` prevents following 3xx so we see actual status codes.
 */
export async function api(
  method: string,
  path: string,
  cookies = '',
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookies) headers['Cookie'] = cookies;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  return fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
}

/**
 * Register a new user via Better Auth.
 * Returns session cookies on success (Better Auth auto-creates a session on sign-up).
 */
export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<{ status: number; cookies: string; userId?: string }> {
  let lastStatus = 0;
  let lastCookies = '';
  let userId: string | undefined;

  for (let attempt = 0; attempt <= 3; attempt++) {
    const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ name, email, password }),
      redirect: 'manual',
    });

    lastStatus = res.status;
    lastCookies = extractCookies(res);
    const payload = await res.json().catch(() => null);
    userId = payload?.user?.id;

    if (res.status !== 429) break;

    // Rate-limited — exponential backoff
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
    }
  }

  return { status: lastStatus, cookies: lastCookies, userId };
}

/**
 * Abort-safe check that the dev server is reachable.
 */
export async function ensureServerRunning(): Promise<void> {
  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(
      `Server not reachable at ${BASE_URL}. ` +
        'Start it first: pnpm dev:next | dev:nuxt | dev:tanstack',
    );
  }
}
