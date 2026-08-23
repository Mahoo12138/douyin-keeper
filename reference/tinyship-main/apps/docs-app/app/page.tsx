import { redirect } from 'next/navigation';
import { config } from '@config';

/**
 * Root page - redirects to default locale docs
 */
export default function RootPage() {
  const defaultLocale = config.app.i18n.defaultLocale || 'en';
  redirect(`/${defaultLocale}`);
}

