<template>
  <form class="auth-form" @submit.prevent="onSubmit">
    <h1>登录</h1>
    <label>邮箱<input v-model="email" type="email" autocomplete="username" required /></label>
    <label>密码<input v-model="password" type="password" autocomplete="current-password" required /></label>
    <p v-if="error" class="form-err">{{ error }}</p>
    <button class="btn btn-solid wide" type="submit" :disabled="loading">{{ loading ? "登录中…" : "登录" }}</button>
    <p class="form-links"><router-link to="/register">注册</router-link> · <router-link to="/forgot-password">忘记密码</router-link></p>
  </form>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ensureCsrf, errMessage } from "../../api/http";
import { useSessionStore } from "../../stores/session";
const session = useSessionStore();
const router = useRouter();
const route = useRoute();
const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);
onMounted(() => {
  void ensureCsrf(true);
});
async function onSubmit() {
  error.value = "";
  loading.value = true;
  try {
    await ensureCsrf();
    const res = await session.login(email.value, password.value);
    let redirect = typeof route.query.redirect === "string" ? route.query.redirect : res.redirect;
    if (res.role === "admin" && !redirect.startsWith("/admin")) {
      redirect = "/admin/dashboard";
    }
    await router.replace(redirect || res.redirect);
  } catch (e) {
    error.value = errMessage(e, "登录失败");
  } finally {
    loading.value = false;
  }
}
</script>
