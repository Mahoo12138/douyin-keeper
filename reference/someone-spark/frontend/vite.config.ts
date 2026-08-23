import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8080", changeOrigin: true, timeout: 360000 },
      "/healthz": { target: "http://127.0.0.1:8080", changeOrigin: true },
      "/readyz": { target: "http://127.0.0.1:8080", changeOrigin: true }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false
  }
});
