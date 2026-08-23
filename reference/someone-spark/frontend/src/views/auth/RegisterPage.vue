<template>
  <div v-if="!registerOn" class="auth-form">
    <h1>注册已关闭</h1>
    <p>站点暂不接受新用户。<router-link to="/login">去登录</router-link></p>
  </div>
  <form v-else class="auth-form" @submit.prevent="onSubmit">
    <h1>注册</h1>
    <label>邮箱<input v-model="email" type="email" autocomplete="username" required /></label>
    <div class="code-row">
      <label>验证码<input v-model="code" inputmode="numeric" maxlength="6" required /></label>
      <button type="button" class="btn btn-ghost" :disabled="cool>0 || sending" @click="sendCode">{{ cool>0 ? cool + "s" : (sending ? "发送中" : "获取验证码") }}</button>
    </div>
    <label>密码<input v-model="password" type="password" autocomplete="new-password" minlength="8" required /></label>
    <label class="check"><input v-model="agree" type="checkbox" /> 我了解自动化、协议发送和聊天归档可能违反平台规则，风险自负。</label>
    <p v-if="error" class="form-err">{{ error }}</p>
    <p v-if="hint" class="form-hint">{{ hint }}</p>
    <button class="btn btn-solid wide" type="submit" :disabled="loading">{{ loading ? "提交中…" : "注册" }}</button>
    <p class="form-links"><router-link to="/login">已有账号</router-link></p>
  </form>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import http, { ensureCsrf, errMessage } from "../../api/http";
import { useSessionStore } from "../../stores/session";
const session = useSessionStore();
const router = useRouter();
const registerOn = computed(() => session.site?.register_enabled !== false);
const email = ref("");
const code = ref("");
const password = ref("");
const agree = ref(false);
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
  hint.value = "";
  sending.value = true;
  try {
    await ensureCsrf();
    await http.post("/api/v1/auth/register/send-code", { email: email.value });
    hint.value = "验证码已发送，请查收邮箱（含垃圾箱）。";
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
    const res = await session.register({ email: email.value, code: code.value, password: password.value, agree: agree.value });
    await router.replace(res.redirect || "/dashboard");
  } catch (e) {
    error.value = errMessage(e, "注册失败");
  } finally {
    loading.value = false;
  }
}
</script>
