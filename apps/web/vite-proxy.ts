export const apiProxy = {
  target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:18080',
  // The backend validates cookie-backed mutations against the browser Origin.
  // Keeping the original Host makes Vite development match production's
  // same-origin deployment shape.
  changeOrigin: false,
} as const
