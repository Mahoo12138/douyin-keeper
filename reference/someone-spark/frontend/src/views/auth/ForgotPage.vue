<template>
  <form class="auth-form" @submit.prevent="onSubmit">
    <h1>找回密码</h1>
    <label>邮箱<input v-model="email" type="email" required /></label>
    <div class="code-row">
      <label>验证码<input v-model="code" inputmode="numeric" maxlength="6" required /></label>
      <button type="button" class="btn btn-ghost" :disabled="cool>0 || sending" @click="sendCode">{{ cool>0 ? cool + "s" : "获取验证码" }}</button>
    </div>
    <label>新密码<input v-model="password" type="password" minlength="8" required /></label>
    <p v-if="error" class="form-err">{{ error }}</p>
    <p v-if="hint" class="form-hint">{{ hint }}</p>
    <button class="btn btn-solid wide" type="submit" :disabled="loading">重置密码</button>
    <p class="form-links"><router-link to="/login">返回登录</router-link></p>
  </form>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import http, { ensureCsrf, errMessage } from "../../api/http";
const router = useRouter();
const email = ref("");
const code = ref("");
const password = ref("");
const error = ref("");
const hint = ref("");
const loading = ref(false);
const sending = ref(false);
const cool = ref(0);
let timer = 0;
onMounted(() => {
  void ensureCsrf(true);
});
onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});
async function sendCode() {
  error.value = "";
  sending.value = true;
  try {
    await ensureCsrf();
    await http.post("/api/v1/auth/forgot/send-code", { email: email.value });
    hint.value = "若邮箱已注册，验证码已发出。";
    cool.value = 60;
    timer = window.setInterval(() => {
      cool.value -= 1;
      if (cool.value <= 0) window.clearInterval(timer);
    }, 1000);
  } catch (e) {
    error.value = errMessage(e, "发送失败");
  } finally {
    sending.value = false;
  }
}
async function onSubmit() {
  error.value = "";
  loading.value = true;
  try {
    await ensureCsrf();
    await http.post("/api/v1/auth/forgot/reset", { email: email.value, code: code.value, password: password.value });
    await router.replace("/login");
  } catch (e) {
    error.value = errMessage(e, "重置失败");
  } finally {
    loading.value = false;
  }
}
</script>
