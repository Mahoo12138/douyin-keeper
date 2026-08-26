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
  // Creator Center can keep the old QR element mounted after a successful
  // scan. Strong post-login signals must therefore take precedence over the
  // visual QR node; requiring all three avoids treating a cached shell or a
  // cookie alone as a completed login.
  if (creatorAuthenticated && identityReady && sessionCookie) return "authenticated";
  if ((creatorAuthenticated || sessionCookie || (qrSeen && !qrVisible)) && !qrVisible) return "scanned";
  return "waiting";
}
