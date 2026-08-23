<template>
  <div class="page">
    <h1>聊天审核</h1>
    <div class="toolbar">
      <label>检索<input v-model="q" placeholder="号 public_id 或好友名" @keyup.enter="load" /></label>
      <label>号<input v-model="account" placeholder="account public_id" @keyup.enter="load" /></label>
      <label>标记
        <select v-model="flag">
          <option value="all">全部</option>
          <option value="pending">待审违规</option>
          <option value="violation">违规</option>
          <option value="benign">无事</option>
          <option value="none">未标</option>
        </select>
      </label>
      <button type="button" class="btn-dark" @click="load">筛选</button>
    </div>
    <p v-if="error" class="form-err">{{ error }}</p>
    <table class="plain-table">
      <thead><tr><th>时间</th><th>号</th><th>好友</th><th>方向</th><th>预览</th><th>标记</th><th></th></tr></thead>
      <tbody>
        <tr v-for="m in list" :key="m.id">
          <td>{{ m.observed_at.replace("T", " ").slice(0, 16) }}</td>
          <td>{{ m.account_public_id }}</td>
          <td>{{ m.friend }}</td>
          <td>{{ m.direction }}</td>
          <td>{{ m.preview }}</td>
          <td>{{ m.review_flag }}</td>
          <td class="row-act"><button type="button" class="btn-ghost" @click="open(m.id)">打开</button></td>
        </tr>
        <tr v-if="!list.length"><td colspan="7" class="muted">暂无数据</td></tr>
      </tbody>
    </table>
    <div v-if="detail" class="modal-mask" @click.self="detail = null">
      <aside class="modal">
        <h2>{{ detail.friend }} · {{ detail.direction }}</h2>
        <p class="muted">{{ detail.account_public_id }} · {{ detail.observed_at.replace("T", " ").slice(0, 16) }}</p>
        <p class="modal-body">{{ detail.body }}</p>
        <div class="btn-row">
          <button type="button" class="btn-dark" :disabled="busy" @click="mark('violation')">标违规</button>
          <button type="button" class="btn-ghost" :disabled="busy" @click="mark('benign')">无事</button>
          <button type="button" class="btn-ghost" :disabled="busy" @click="mark('none')">清除</button>
        </div>
        <p v-if="formErr" class="form-err">{{ formErr }}</p>
      </aside>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http, { errMessage } from "../../api/http";
type Row = { id: number; account_public_id: string; friend: string; direction: string; preview: string; review_flag: string; observed_at: string };
type Detail = Row & { body: string; msg_type: string };
const route = useRoute();
const q = ref("");
const account = ref(typeof route.query.account === "string" ? route.query.account : "");
const flag = ref(typeof route.query.flag === "string" ? route.query.flag : "all");
const list = ref<Row[]>([]);
const detail = ref<Detail | null>(null);
const error = ref("");
const formErr = ref("");
const busy = ref(false);
async function load() {
  const params: Record<string, string> = {};
  if (q.value) params.q = q.value;
  if (account.value) params.account = account.value;
  if (flag.value && flag.value !== "all") params.flag = flag.value;
  const { data } = await http.get("/api/v1/admin/chat-review", { params });
  list.value = data.data.messages || [];
}
async function open(id: number) {
  formErr.value = "";
  const { data } = await http.get("/api/v1/admin/chat-review/" + id);
  detail.value = data.data;
}
async function mark(fl: string) {
  if (!detail.value) return;
  busy.value = true;
  formErr.value = "";
  try {
    await http.post("/api/v1/admin/chat-review/" + detail.value.id + "/flag", { flag: fl });
    detail.value.review_flag = fl;
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
