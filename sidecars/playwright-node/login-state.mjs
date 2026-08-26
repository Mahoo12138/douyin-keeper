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
  // A Creator Center shell can contain cached identity nodes before the QR
  // flow has completed. The QR is the user-facing source of truth here: while
  // it is still visible, this attempt cannot be authenticated.
  if (creatorAuthenticated && identityReady && sessionCookie && !qrVisible) return "authenticated";
  if ((creatorAuthenticated || sessionCookie || (qrSeen && !qrVisible)) && !qrVisible) return "scanned";
  return "waiting";
}
