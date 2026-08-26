const LOGIN_PATH_PATTERN = /\/(?:login|passport|account)\b/i;

// A session cookie is only a transport hint. The page must expose a logged-in
// profile signal and must not still be on a login route/modal before a browser
// operation is allowed to continue.
export function isAuthenticatedPage(snapshot = {}) {
  const url = String(snapshot.url || "");
  const hasProfileSignal = Boolean(snapshot.hasProfileSignal);
  const hasLoginSignal = Boolean(snapshot.hasLoginSignal);
  if (LOGIN_PATH_PATTERN.test(url)) return false;
  if (hasLoginSignal) return false;
  return hasProfileSignal;
}
