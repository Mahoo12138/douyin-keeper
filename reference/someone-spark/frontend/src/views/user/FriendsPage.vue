<template>
  <div class="page">
    <h1>好友</h1>
    <p class="muted">先选号，再看该号的好友。登录仍在号位详情，这里不铺扫码。</p>
    <div class="toolbar">
      <label>当前号
        <select v-model="account" @change="loadFriends">
          <option value="">选择号位</option>
          <option v-for="a in accounts" :key="a.public_id" :value="a.public_id">{{ a.nickname || "未绑定" }} · {{ statusText(a.session_status) }}</option>
        </select>
      </label>
      <button type="button" class="btn-dark" :disabled="!account || busy" @click="sync">同步好友</button>
    </div>
    <p v-if="error" class="form-err">{{ error }}</p>
    <p v-if="hint" class="form-hint">{{ hint }}</p>
    <table class="plain-table">
      <thead><tr><th>昵称</th><th>会话</th><th>火花</th><th></th></tr></thead>
      <tbody>
        <tr v-for="f in friends" :key="f.public_id">
          <td>{{ f.nickname || f.display_name }}<div class="muted">{{ f.display_name }}</div></td>
          <td>{{ f.has_conversation ? "已有" : "未聊" }}</td>
          <td><input type="checkbox" :checked="f.spark_enabled" @change="toggle(f, ($event.target as HTMLInputElement).checked)" /></td>
          <td class="row-act"><router-link class="btn-ghost" :to="'/chat?account=' + account + '&friend=' + f.public_id">聊天</router-link></td>
        </tr>
        <tr v-if="account && !friends.length"><td colspan="4" class="muted">暂无数据</td></tr>
      </tbody>
    </table>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http, { errMessage } from "../../api/http";
type Acc = { public_id: string; nickname: string | null; session_status: string };
type Friend = { public_id: string; display_name: string; nickname: string; has_conversation: boolean; spark_enabled: boolean };
const route = useRoute();
const accounts = ref<Acc[]>([]);
const friends = ref<Friend[]>([]);
const account = ref("");
const error = ref("");
const hint = ref("");
const busy = ref(false);
function statusText(s: string) {
  if (s === "valid") return "已登录";
  if (s === "expired") return "已过期";
  return "未绑定";
}
async function waitJob(jobId: string) {
  for (let i = 0; i < 20; i++) {
    const { data } = await http.get("/api/v1/jobs/" + jobId);
    if (data.data && data.data.pending) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    return data.data;
  }
  return { pending: true };
}
async function loadFriends() {
  friends.value = [];
  if (!account.value) return;
  const { data } = await http.get("/api/v1/friends", { params: { account: account.value } });
  friends.value = data.data.friends || [];
}
async function sync() {
  error.value = "";
  hint.value = "";
  busy.value = true;
  try {
    const { data } = await http.post("/api/v1/douyin/" + account.value + "/friends/sync", {});
    const res = await waitJob(data.data.job_id);
    if (res && res.ok === false) {
      error.value = res.message || "同步失败";
    } else {
      hint.value = "已同步 " + (res.friends || 0) + " 个好友";
      await loadFriends();
    }
  } catch (e) {
    error.value = errMessage(e, "无法同步");
  } finally {
    busy.value = false;
  }
}
async function toggle(f: Friend, on: boolean) {
  try {
    await http.patch("/api/v1/friends/" + f.public_id, { spark_enabled: on });
    f.spark_enabled = on;
  } catch (e) {
    error.value = errMessage(e);
  }
}
onMounted(async () => {
  try {
    const { data } = await http.get("/api/v1/douyin");
    accounts.value = data.data.accounts || [];
    const q = typeof route.query.account === "string" ? route.query.account : "";
    account.value = q || accounts.value[0]?.public_id || "";
    if (account.value) await loadFriends();
  } catch (e) {
    error.value = errMessage(e);
  }
});
</script>
