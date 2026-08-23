<template>
  <div class="page">
    <h1>运营看板</h1>
    <p v-if="error" class="form-err">{{ error }}</p>
    <div class="cards mb">
      <router-link class="stat" to="/admin/users"><span class="stat-label">有效套餐用户</span><strong>{{ n(cards.active_subscribers) }}</strong><em>含体验卡</em></router-link>
      <router-link class="stat" to="/admin/users"><span class="stat-label">今日新注册</span><strong>{{ n(cards.today_register) }}</strong><em>上海自然日</em></router-link>
      <router-link class="stat" to="/admin/audit"><span class="stat-label">今日发送成功</span><strong>{{ n(cards.today_send_ok) }}</strong><em>不含试跑</em></router-link>
      <div class="stat"><span class="stat-label">今日发送失败</span><strong>{{ n(cards.today_send_fail) }}</strong><em>不含试跑</em></div>
    </div>
    <div class="cards mb">
      <div class="stat"><span class="stat-label">登录有效</span><strong>{{ n(cards.session_valid) }}</strong><em>抖音号</em></div>
      <div class="stat"><span class="stat-label">登录失效</span><strong>{{ n(cards.session_bad) }}</strong><em>过期 / 未知</em></div>
      <div class="stat"><span class="stat-label">风控中</span><strong>{{ n(cards.risk) }}</strong><em>按号暂停</em></div>
      <router-link class="stat" to="/admin/keys"><span class="stat-label">未兑卡密</span><strong>{{ n(cards.unused_keys) }}</strong><em>只计张数</em></router-link>
    </div>
    <section class="panel">
      <h2>近 7 日</h2>
      <div v-if="hasSeries" class="bars dual">
        <div v-for="p in dash?.series || []" :key="p.date" class="bar-col">
          <div class="bar-pair">
            <div class="bar" :style="{ height: barH(p.send_ok, 'send') + 'px' }"></div>
            <div class="bar bar2" :style="{ height: barH(p.register, 'reg') + 'px' }"></div>
          </div>
          <span>{{ p.send_ok }}/{{ p.register }}</span>
          <em>{{ p.date.slice(5) }}</em>
        </div>
      </div>
      <p v-else class="muted">暂无数据</p>
      <p class="muted">黑柱发送成功 · 灰柱新注册</p>
    </section>
    <section class="panel">
      <h2>待办</h2>
      <p>待审违规 <router-link to="/admin/chat-review?flag=pending">{{ dash?.violations || 0 }}</router-link> 条 · 队列等待 {{ dash?.queue?.pending || 0 }} / 执行 {{ dash?.queue?.active || 0 }}
        <span v-if="dash && !dash.playwright?.ok" class="form-err"> · Playwright 不健康</span>
      </p>
      <p class="muted">近 7 日购买入账 {{ yuan(cards.income_7d_cents) }}（不含调余额）</p>
      <table class="plain-table">
        <thead><tr><th>用户</th><th>号</th><th>原因</th><th>至</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in dash?.risk_todos || []" :key="i">
            <td>{{ r.email }}</td>
            <td>{{ r.nickname || r.public_id }}</td>
            <td>{{ r.reason || r.risk }}</td>
            <td>{{ r.risk_until ? r.risk_until.replace("T", " ").slice(0, 16) : "—" }}</td>
          </tr>
          <tr v-if="!(dash?.risk_todos || []).length"><td colspan="4" class="muted">暂无数据</td></tr>
        </tbody>
      </table>
      <p><router-link to="/admin/chat-review">去聊天审核</router-link></p>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import http, { errMessage } from "../../api/http";
type Cards = Record<string, number>;
type Point = { date: string; send_ok: number; register: number };
type Risk = { email: string; public_id: string; nickname: string; risk: string; reason: string; risk_until: string | null };
type Dash = { cards: Cards; series: Point[]; risk_todos: Risk[]; queue: { pending: number; active: number }; violations: number; playwright: { ok: boolean } };
const dash = ref<Dash | null>(null);
const error = ref("");
const cards = computed(() => dash.value?.cards || {});
const hasSeries = computed(() => (dash.value?.series || []).some((p) => p.send_ok > 0 || p.register > 0));
function n(v: number | undefined) {
  return v == null ? "—" : String(v);
}
function yuan(cents: number | undefined) {
  return ((cents || 0) / 100).toFixed(2) + " 元";
}
function barH(v: number, kind: "send" | "reg") {
  const arr = dash.value?.series || [];
  const max = Math.max(1, ...arr.map((p) => (kind === "send" ? p.send_ok : p.register)));
  return Math.max(4, Math.round(((v || 0) / max) * 72));
}
onMounted(async () => {
  try {
    const { data } = await http.get("/api/v1/admin/dashboard");
    dash.value = data.data;
  } catch (e) {
    error.value = errMessage(e);
  }
});
</script>
