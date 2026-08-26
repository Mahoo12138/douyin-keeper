/**
 * Keep QR login state decisions independent from Playwright so the worker
 * contract can be regression-tested without opening a browser.
 */
export function qrLoginState({
  challenge = false,
  creatorAuthenticated = false,
  identityReady = false,
  sessionCookie = false,
  qrSeen = false,
  qrVisible = false,
} = {}) {
  if (challenge) return "challenge_required";
  if (creatorAuthenticated && identityReady && sessionCookie) return "authenticated";
  if (creatorAuthenticated || sessionCookie || (qrSeen && !qrVisible)) return "scanned";
  return "waiting";
}
