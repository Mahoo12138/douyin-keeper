<template>
  <div class="page">
    <h1>抖音号</h1>
    <p class="muted">一行一个号。登录、解绑、通道开关都在详情页，列表不摊开面板。</p>
    <p v-if="error" class="form-err">{{ error }}</p>
    <table class="plain-table">
      <thead><tr><th>昵称</th><th>登录态</th><th></th></tr></thead>
      <tbody>
        <tr v-for="row in accounts" :key="row.public_id">
          <td>{{ row.nickname || "未绑定" }}</td>
          <td><span class="badge" :class="row.session_status">{{ statusText(row.session_status) }}</span></td>
          <td class="row-act"><router-link class="btn-dark" :to="'/douyin/' + row.public_id">进入</router-link></td>
        </tr>
        <tr v-if="!accounts.length && !error"><td colspan="3" class="muted">暂无数据</td></tr>
      </tbody>
    </table>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import http, { errMessage } from "../../api/http";
type Acc = { public_id: string; nickname: string | null; session_status: string };
const accounts = ref<Acc[]>([]);
const error = ref("");
function statusText(s: string) {
  if (s === "valid") return "已登录";
  if (s === "expired") return "已过期";
  if (s === "unknown") return "未知";
  return "未绑定";
}
onMounted(async () => {
  try {
    const { data } = await http.get("/api/v1/douyin");
    accounts.value = data.data.accounts || [];
  } catch (e) {
    error.value = errMessage(e);
  }
});
</script>
