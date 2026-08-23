<template>
  <div class="page">
    <h1>数据看板</h1>
    <a-alert v-if="notice" type="info" :message="notice" show-icon closable class="mb" />
    <p v-if="error" class="form-err">{{ error }}</p>
    <div class="cards">
      <router-link class="stat" to="/wallet">
        <span class="stat-label">套餐剩余</span>
        <strong>{{ subText }}</strong>
        <em>{{ subHint }}</em>
      </router-link>
      <router-link class="stat" to="/douyin">
        <span class="stat-label">号位</span>
        <strong>{{ slotText }}</strong>
        <em>已绑定 / 配额</em>
      </router-link>
      <router-link class="stat" to="/logs">
        <span class="stat-label">今日发送</span>
        <strong>{{ sendText }}</strong>
        <em>成功 / 失败 · 上海日</em>
      </router-link>
      <router-link class="stat" to="/tasks">
        <span class="stat-label">异常</span>
        <strong>{{ anomalyText }}</strong>
        <em>登录失效 + 风控</em>
      </router-link>
    </div>
    <section class="panel">
      <h2>待办</h2>
      <table class="plain-table">
        <thead><tr><th>号</th><th>类型</th><th>说明</th><th></th></tr></thead>
        <tbody>
          <tr v-for="(row, i) in dash?.todos || []" :key="i">
            <td>{{ row.nickname || "—" }}</td>
            <td>{{ todoType(row.type) }}</td>
            <td>{{ row.message }}</td>
            <td class="row-act"><router-link class="btn-ghost" :to="row.href">{{ todoAct(row.action) }}</router-link></td>
          </tr>
          <tr v-if="!(dash?.todos || []).length"><td colspan="4" class="muted">暂无数据</td></tr>
        </tbody>
      </table>
    </section>
    <section class="panel">
      <h2>各号一览</h2>
      <table class="plain-table">
        <thead><tr><th>昵称</th><th>登录态</th><th>今日已发</th><th>下次任务</th><th>通道</th><th></th></tr></thead>
        <tbody>
          <tr v-for="a in dash?.accounts || []" :key="a.public_id">
            <td>{{ a.nickname || "未绑定" }}</td>
            <td>{{ statusText(a.session_status) }}</td>
            <td>{{ a.sent_today }} / {{ a.daily_cap }}</td>
            <td>{{ a.next_task_at ? fmt(a.next_task_at) : "—" }}</td>
            <td>{{ a.channel }}</td>
            <td class="row-act"><router-link class="btn-dark" :to="'/douyin/' + a.public_id">进入</router-link></td>
          </tr>
          <tr v-if="!(dash?.accounts || []).length"><td colspan="6" class="muted">暂无数据</td></tr>
        </tbody>
      </table>
    </section>
    <section class="panel">
      <h2>近 7 日发送</h2>
      <div v-if="hasSeries" class="bars">
        <div v-for="p in dash?.series || []" :key="p.date" class="bar-col">
          <div class="bar" :style="{ height: barH(p.ok) + 'px' }"></div>
          <span>{{ p.ok }}</span>
          <em>{{ p.date.slice(5) }}</em>
        </div>
      </div>
      <p v-else class="muted">暂无数据</p>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import http, { errMessage } from "../../api/http";
type Todo = { nickname: string; type: string; message: string; action: string; href: string };
type Acc = { public_id: string; nickname: string; session_status: string; sent_today: number; daily_cap: number; next_task_at: string | null; channel: string };
type Point = { date: string; ok: number };
type Dash = {
  notice?: string;
  cards: {
    subscription: { remaining_days: number; source: string; ends_at: string | null; plan_name: string; valid: boolean };
    slots: { bound: number; quota: number };
    today_send: { ok: number; fail: number };
    anomalies: { expired_login: number; risk: number };
  };
  todos: Todo[];
  accounts: Acc[];
  series: Point[];
};
const notice = ref("");
const dash = ref<Dash | null>(null);
const error = ref("");
const subText = computed(() => {
  const s = dash.value?.cards.subscription;
  if (!s || !s.valid) return "无套餐";
  return s.remaining_days + " 天";
});
const subHint = computed(() => {
  const s = dash.value?.cards.subscription;
  if (!s || !s.valid) return "去钱包开通";
  return (s.source === "trial" ? "体验" : "正式") + (s.plan_name ? " · " + s.plan_name : "");
});
const slotText = computed(() => {
  const s = dash.value?.cards.slots;
  if (!s) return "—";
  return s.bound + " / " + s.quota;
});
const sendText = computed(() => {
  const s = dash.value?.cards.today_send;
  if (!s) return "0 / 0";
  return s.ok + " / " + s.fail;
});
const anomalyText = computed(() => {
  const s = dash.value?.cards.anomalies;
  if (!s) return "0";
  return String((s.expired_login || 0) + (s.risk || 0));
});
const hasSeries = computed(() => (dash.value?.series || []).some((p) => p.ok > 0));
function statusText(s: string) {
  if (s === "valid") return "已登录";
  if (s === "expired") return "已过期";
  if (s === "unknown") return "未知";
  return "未绑定";
}
function todoType(t: string) {
  if (t === "login_expired") return "登录失效";
  if (t === "risk") return "风控暂停";
  if (t === "plan_soon") return "套餐将到期";
  if (t === "task_pending") return "任务未发";
  return t;
}
function todoAct(a: string) {
  if (a === "bind") return "去绑定";
  if (a === "resume") return "去恢复";
  if (a === "wallet") return "去钱包";
  return "去任务";
}
function fmt(s: string) {
  return s.replace("T", " ").slice(0, 16);
}
function barH(n: number) {
  const max = Math.max(1, ...(dash.value?.series || []).map((p) => p.ok));
  return Math.max(4, Math.round((n / max) * 80));
}
onMounted(async () => {
  try {
    const { data } = await http.get("/api/v1/dashboard");
    dash.value = data.data;
    notice.value = data.data.notice || "";
  } catch (e) {
    error.value = errMessage(e);
  }
});
</script>
