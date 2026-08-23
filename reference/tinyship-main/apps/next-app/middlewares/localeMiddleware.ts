import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { i18n } from '../app/i18n-config'; // Adjusted import path
import { match as matchLocale } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { config } from '@config';

function getLocale(request: NextRequest): string {
  // Try to get locale from cookie first (highest priority)
  const cookieLocale = request.cookies.get(config.app.i18n.cookieKey)?.value;
  
  if (cookieLocale && i18n.locales.includes(cookieLocale as any)) {
    return cookieLocale;
  }
  // Check if auto-detection is enabled
  if (!config.app.i18n.autoDetect) {
    return i18n.defaultLocale;
  }

  // If auto-detect enabled and no cookie, detect from browser headers
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));
  
  const languages = new Negotiator({ headers: negotiatorHeaders }).languages();
  
  try {
    return matchLocale(languages, i18n.locales as unknown as string[], i18n.defaultLocale);
  } catch (error) {
    // If matchLocale fails, return default locale
    return i18n.defaultLocale;
  }
}

export function localeMiddleware(request: NextRequest): NextResponse | undefined {
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search; // Get search params

  // --- Skip API routes in locale middleware ---
  if (pathname.startsWith('/api/')) {
    return undefined; // API routes don't need locale redirects
  }

  // Check if there is any supported locale in the pathname
  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );
  // Redirect if there is no locale (for pages)
  if (pathnameIsMissingLocale) {
    const locale = getLocale(request);

    // e.g. incoming request is /products?token=123
    // The new URL is now /en/products?token=123
    return NextResponse.redirect(
      new URL(
        `/${locale}${pathname.startsWith('/') ? '' : '/'}${pathname}${search}`,
        request.url
      )
    );
  }

  // If locale exists, continue to the next middleware
  return undefined; 
} 