/**
 * Keep QR login state decisions independent from Playwright so the worker
 * contract can be regression-tested without opening a browser.
 */
export function qrLoginState({
  challenge = false,
  platformAuthenticated = false,
  identityReady = false,
  sessionCookie = false,
  qrSeen = false,
  qrVisible = false,
} = {}) {
  if (challenge) return "challenge_required";
  // The web login dialog can keep the old QR node mounted after a successful
  // scan. Strong post-login signals must therefore take precedence over the
  // visual QR node; requiring all three avoids treating a cached shell or a
  // cookie alone as a completed login.
  if (platformAuthenticated && identityReady && sessionCookie) return "authenticated";
  if ((platformAuthenticated || sessionCookie || (qrSeen && !qrVisible)) && !qrVisible) return "scanned";
  return "waiting";
}

export function smsLoginRequiresFreshContext(input = {}) {
  return input?.force_login === true;
}

// The Douyin web login dialog can render the SMS form immediately, without a
// generic "登录" button. Keep this decision pure so the browser adapter does
// not treat that valid state as selector drift.
export function smsLoginSurfaceState({
  phoneInputVisible = false,
  loginButtonClicked = false,
  methodClicked = false,
} = {}) {
  if (phoneInputVisible) return "direct_form";
  if (loginButtonClicked || methodClicked) return "switching";
  return "unavailable";
}
