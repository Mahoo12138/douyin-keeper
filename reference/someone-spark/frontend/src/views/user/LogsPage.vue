<template>
  <div class="page">
    <h1>发送日志</h1>
    <div class="toolbar">
      <label>号位
        <select v-model="account" @change="load">
          <option value="">全部</option>
          <option v-for="a in accounts" :key="a.public_id" :value="a.public_id">{{ a.nickname || "未绑定" }}</option>
        </select>
      </label>
    </div>
    <p v-if="error" class="form-err">{{ error }}</p>
    <table class="plain-table">
      <thead><tr><th>时间</th><th>号</th><th>好友</th><th>通道</th><th>状态</th><th>试跑</th><th>说明</th></tr></thead>
      <tbody>
        <tr v-for="row in logs" :key="row.public_id">
          <td>{{ row.created_at.replace("T", " ").slice(0, 16) }}</td>
          <td>{{ row.account_name || row.account }}</td>
          <td>{{ row.friend_name }}</td>
          <td>{{ row.channel }}</td>
          <td>{{ row.status }}{{ row.error_code ? " · " + row.error_code : "" }}</td>
          <td>{{ row.dry_run ? "是" : "" }}</td>
          <td>{{ row.body }}</td>
        </tr>
        <tr v-if="!logs.length"><td colspan="7" class="muted">暂无数据</td></tr>
      </tbody>
    </table>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import http, { errMessage } from "../../api/http";
type Acc = { public_id: string; nickname: string | null };
type Log = { public_id: string; account: string; account_name: string; friend_name: string; channel: string; status: string; error_code: string; dry_run: boolean; body: string; created_at: string };
const accounts = ref<Acc[]>([]);
const logs = ref<Log[]>([]);
const account = ref("");
const error = ref("");
async function load() {
  const { data } = await http.get("/api/v1/logs", { params: account.value ? { account: account.value } : {} });
  logs.value = data.data.logs || [];
}
onMounted(async () => {
  try {
    const { data } = await http.get("/api/v1/douyin");
    accounts.value = data.data.accounts || [];
    await load();
  } catch (e) {
    error.value = errMessage(e);
  }
});
</script>
