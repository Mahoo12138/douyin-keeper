<template>
  <div class="page">
    <h1>审计</h1>
    <div class="toolbar">
      <label>事件<input v-model="event" placeholder="如 admin.chat_read" @keyup.enter="load" /></label>
      <button type="button" class="btn-dark" @click="load">筛选</button>
    </div>
    <p v-if="error" class="form-err">{{ error }}</p>
    <table class="plain-table">
      <thead><tr><th>时间</th><th>操作者</th><th>事件</th><th>IP</th><th>详情</th></tr></thead>
      <tbody>
        <tr v-for="(r, i) in logs" :key="i">
          <td>{{ r.created_at.replace("T", " ").slice(0, 19) }}</td>
          <td>{{ r.actor || "—" }}</td>
          <td>{{ r.event }}</td>
          <td>{{ r.ip }}</td>
          <td>{{ r.meta }}</td>
        </tr>
        <tr v-if="!logs.length"><td colspan="5" class="muted">暂无数据</td></tr>
      </tbody>
    </table>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import http, { errMessage } from "../../api/http";
type Log = { actor: string; event: string; ip: string; meta: string; created_at: string };
const event = ref("");
const logs = ref<Log[]>([]);
const error = ref("");
async function load() {
  const { data } = await http.get("/api/v1/admin/audit", { params: event.value ? { event: event.value } : {} });
  logs.value = data.data.logs || [];
}
onMounted(async () => {
  try {
    await load();
  } catch (e) {
    error.value = errMessage(e);
  }
});
</script>
