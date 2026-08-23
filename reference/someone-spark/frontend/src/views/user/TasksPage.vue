<template>
  <div class="page">
    <h1>任务</h1>
    <p class="muted">每号每好友一条。Tick 只扫套餐有效且非静默的号。试跑写日志、不占当日额度。</p>
    <div class="toolbar">
      <label>当前号
        <select v-model="account" @change="load">
          <option value="">选择号位</option>
          <option v-for="a in accounts" :key="a.public_id" :value="a.public_id">{{ a.nickname || "未绑定" }}</option>
        </select>
      </label>
      <button type="button" class="btn-dark" :disabled="!account" @click="open = true">新建任务</button>
    </div>
    <p v-if="error" class="form-err">{{ error }}</p>
    <p v-if="hint" class="form-hint">{{ hint }}</p>
    <table class="plain-table">
      <thead><tr><th>好友</th><th>文案</th><th>启用</th><th>上次入队</th><th></th></tr></thead>
      <tbody>
        <tr v-for="t in tasks" :key="t.public_id">
          <td>{{ t.friend_name || t.display_name }}</td>
          <td>{{ t.body }}</td>
          <td><input type="checkbox" :checked="t.enabled" @change="toggle(t, ($event.target as HTMLInputElement).checked)" /></td>
          <td>{{ t.last_enqueued_at ? t.last_enqueued_at.replace('T',' ').slice(0,16) : "—" }}</td>
          <td class="row-act"><button type="button" class="btn-ghost" :disabled="busy" @click="run(t)">试跑</button></td>
        </tr>
        <tr v-if="account && !tasks.length"><td colspan="5" class="muted">暂无数据</td></tr>
      </tbody>
    </table>
    <div v-if="open" class="drawer-mask" @click.self="open = false">
      <aside class="drawer">
        <h2>新建任务</h2>
        <form class="narrow" @submit.prevent="create">
          <label>好友
            <select v-model="friend" required>
              <option value="">选择好友</option>
              <option v-for="f in friends" :key="f.public_id" :value="f.public_id">{{ f.nickname || f.display_name }}</option>
            </select>
          </label>
          <label>文案<textarea v-model="body" rows="3" required></textarea></label>
          <p v-if="formErr" class="form-err">{{ formErr }}</p>
          <div class="btn-row">
            <button type="submit" class="btn-dark" :disabled="busy">保存</button>
            <button type="button" class="btn-ghost" @click="open = false">取消</button>
          </div>
        </form>
      </aside>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import http, { errMessage } from "../../api/http";
type Acc = { public_id: string; nickname: string | null };
type Friend = { public_id: string; nickname: string; display_name: string };
type Task = { public_id: string; friend_name: string; display_name: string; body: string; enabled: boolean; last_enqueued_at: string | null };
const route = useRoute();
const accounts = ref<Acc[]>([]);
const friends = ref<Friend[]>([]);
const tasks = ref<Task[]>([]);
const account = ref("");
const friend = ref("");
const body = ref("续火花");
const open = ref(false);
const error = ref("");
const hint = ref("");
const formErr = ref("");
const busy = ref(false);
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
async function load() {
  tasks.value = [];
  friends.value = [];
  if (!account.value) return;
  const { data } = await http.get("/api/v1/tasks", { params: { account: account.value } });
  tasks.value = data.data.tasks || [];
  const fr = await http.get("/api/v1/friends", { params: { account: account.value } });
  friends.value = fr.data.data.friends || [];
}
async function create() {
  formErr.value = "";
  busy.value = true;
  try {
    await http.post("/api/v1/tasks", { account: account.value, friend: friend.value, body: body.value });
    open.value = false;
    friend.value = "";
    await load();
  } catch (e) {
    formErr.value = errMessage(e);
  } finally {
    busy.value = false;
  }
}
async function toggle(t: Task, on: boolean) {
  try {
    await http.patch("/api/v1/tasks/" + t.public_id, { enabled: on });
    t.enabled = on;
  } catch (e) {
    error.value = errMessage(e);
  }
}
async function run(t: Task) {
  error.value = "";
  hint.value = "";
  busy.value = true;
  try {
    const { data } = await http.post("/api/v1/tasks/" + t.public_id + "/run", {});
    const res = await waitJob(data.data.job_id);
    hint.value = res && res.ok === false ? (res.error_code || "试跑失败") : "试跑已写入日志，未占当日额度";
  } catch (e) {
    error.value = errMessage(e);
  } finally {
    busy.value = false;
  }
}
watch(open, (v) => {
  if (v && account.value && !friends.value.length) void load();
});
onMounted(async () => {
  try {
    const { data } = await http.get("/api/v1/douyin");
    accounts.value = data.data.accounts || [];
    const q = typeof route.query.account === "string" ? route.query.account : "";
    account.value = q || accounts.value[0]?.public_id || "";
    if (account.value) await load();
  } catch (e) {
    error.value = errMessage(e);
  }
});
</script>
