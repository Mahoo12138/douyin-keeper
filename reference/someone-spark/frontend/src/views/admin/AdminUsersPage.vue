<template>
  <div class="page">
    <h1>用户</h1>
    <div class="toolbar">
      <label>检索<input v-model="q" placeholder="邮箱或 public_id" @keyup.enter="load" /></label>
      <button type="button" class="btn-dark" @click="load">搜索</button>
    </div>
    <p v-if="error" class="form-err">{{ error }}</p>
    <table class="plain-table">
      <thead><tr><th>邮箱</th><th>状态</th><th>余额</th><th>套餐到期</th><th>号位</th><th></th></tr></thead>
      <tbody>
        <tr v-for="u in users" :key="u.public_id">
          <td>{{ u.email }}</td>
          <td>{{ u.status }}</td>
          <td>{{ (u.balance_cents / 100).toFixed(2) }}</td>
          <td>{{ u.ends_at ? u.ends_at.slice(0, 10) : "—" }}</td>
          <td>{{ u.slot_quota }}</td>
          <td class="row-act"><button type="button" class="btn-ghost" @click="open(u.public_id)">详情</button></td>
        </tr>
        <tr v-if="!users.length"><td colspan="6" class="muted">暂无数据</td></tr>
      </tbody>
    </table>
    <div v-if="detail" class="drawer-mask" @click.self="detail = null">
      <aside class="drawer">
        <h2>{{ detail.email }}</h2>
        <p class="muted">余额 {{ (detail.balance_cents / 100).toFixed(2) }} · 套餐 {{ detail.ends_at || "无" }}</p>
        <table class="plain-table">
          <thead><tr><th>号</th><th>登录</th><th>风控</th></tr></thead>
          <tbody>
            <tr v-for="a in detail.accounts" :key="a.public_id">
              <td>{{ a.nickname || a.public_id }}</td>
              <td>{{ a.session_status }}</td>
              <td>{{ a.risk_status || "—" }}</td>
            </tr>
          </tbody>
        </table>
        <form class="narrow" @submit.prevent="adjust">
          <label>调余额（分）<input v-model.number="delta" type="number" required /></label>
          <label>备注<input v-model="remark" minlength="4" required /></label>
          <button type="submit" class="btn-dark" :disabled="busy">入账 / 扣减</button>
        </form>
        <div class="btn-row" style="margin-top:12px">
          <button type="button" class="btn-ghost" :disabled="busy" @click="toggle">{{ detail.status === "active" ? "禁用" : "启用" }}</button>
        </div>
        <p v-if="formErr" class="form-err">{{ formErr }}</p>
      </aside>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import http, { errMessage } from "../../api/http";
type User = { public_id: string; email: string; status: string; balance_cents: number; slot_quota: number; ends_at: string | null };
type Acc = { public_id: string; nickname: string; session_status: string; risk_status: string };
type Detail = User & { accounts: Acc[]; source?: string };
const q = ref("");
const users = ref<User[]>([]);
const detail = ref<Detail | null>(null);
const error = ref("");
const formErr = ref("");
const delta = ref(0);
const remark = ref("");
const busy = ref(false);
async function load() {
  const { data } = await http.get("/api/v1/admin/users", { params: q.value ? { q: q.value } : {} });
  users.value = data.data.users || [];
}
async function open(id: string) {
  formErr.value = "";
  const { data } = await http.get("/api/v1/admin/users/" + id);
  detail.value = data.data;
  delta.value = 0;
  remark.value = "";
}
async function adjust() {
  if (!detail.value) return;
  formErr.value = "";
  busy.value = true;
  try {
    await http.post("/api/v1/admin/users/" + detail.value.public_id + "/balance", { delta_cents: delta.value, remark: remark.value });
    await open(detail.value.public_id);
    await load();
  } catch (e) {
    formErr.value = errMessage(e);
  } finally {
    busy.value = false;
  }
}
async function toggle() {
  if (!detail.value) return;
  busy.value = true;
  try {
    await http.post("/api/v1/admin/users/" + detail.value.public_id + "/disable", { disabled: detail.value.status === "active" });
    await open(detail.value.public_id);
    await load();
  } catch (e) {
    formErr.value = errMessage(e);
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  try {
    await load();
  } catch (e) {
    error.value = errMessage(e);
  }
});
</script>
