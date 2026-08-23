<template>
  <div class="page">
    <h1>账户设置</h1>
    <p class="muted">登录邮箱 {{ session.me?.email }}</p>
    <form class="narrow" @submit.prevent="onSubmit">
      <label>当前密码<input v-model="oldP" type="password" required /></label>
      <label>新密码<input v-model="newP" type="password" minlength="8" required /></label>
      <p v-if="error" class="form-err">{{ error }}</p>
      <p v-if="okMsg" class="form-hint">{{ okMsg }}</p>
      <button class="btn btn-dark" type="submit" :disabled="loading">保存</button>
    </form>
  </div>
</template>
<script setup lang="ts">
import { ref } from "vue";
import http, { errMessage } from "../../api/http";
import { useSessionStore } from "../../stores/session";
const session = useSessionStore();
const oldP = ref("");
const newP = ref("");
const error = ref("");
const okMsg = ref("");
const loading = ref(false);
async function onSubmit() {
  error.value = "";
  okMsg.value = "";
  loading.value = true;
  try {
    await http.post("/api/v1/account/password", { old_password: oldP.value, new_password: newP.value });
    okMsg.value = "密码已更新";
    oldP.value = "";
    newP.value = "";
  } catch (e) {
    error.value = errMessage(e, "修改失败");
  } finally {
    loading.value = false;
  }
}
</script>
