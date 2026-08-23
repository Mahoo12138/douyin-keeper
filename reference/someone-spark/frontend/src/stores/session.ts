import { defineStore } from "pinia";
import { computed, ref } from "vue";
import http, { errMessage } from "../api/http";
export type Me = { public_id: string; email: string; role: "user" | "admin" };
export type SitePublic = {
  name: string;
  notice: string;
  register_enabled: boolean;
  seo_title: string;
  seo_description: string;
  public_url: string;
};
export const useSessionStore = defineStore("session", () => {
  const me = ref<Me | null>(null);
  const site = ref<SitePublic | null>(null);
  const booted = ref(false);
  const loggedIn = computed(() => !!me.value);
  const isAdmin = computed(() => me.value?.role === "admin");
  async function bootstrap() {
    try {
      const [siteRes, meRes] = await Promise.allSettled([
        http.get("/api/v1/public/site"),
        http.get("/api/v1/me")
      ]);
      if (siteRes.status === "fulfilled") site.value = siteRes.value.data.data;
      if (meRes.status === "fulfilled") me.value = meRes.value.data.data;
    } finally {
      booted.value = true;
    }
  }
  async function login(email: string, password: string) {
    const { data } = await http.post("/api/v1/auth/login", { email, password });
    const { data: mine } = await http.get("/api/v1/me");
    me.value = mine.data;
    return data.data as { role: string; redirect: string };
  }
  async function register(payload: { email: string; code: string; password: string; agree: boolean }) {
    const { data } = await http.post("/api/v1/auth/register", payload);
    const { data: mine } = await http.get("/api/v1/me");
    me.value = mine.data;
    return data.data as { role: string; redirect: string };
  }
  async function logout() {
    try {
      await http.post("/api/v1/auth/logout");
    } finally {
      me.value = null;
    }
  }
  return { me, site, booted, loggedIn, isAdmin, bootstrap, login, register, logout, errMessage };
});
