<template>
  <div class="page">
    <h1>钱包与套餐</h1>
    <div class="tabs">
      <button type="button" :class="{ on: tab === 'overview' }" @click="tab = 'overview'">概览</button>
      <button type="button" :class="{ on: tab === 'buy' }" @click="tab = 'buy'">购买</button>
      <button type="button" :class="{ on: tab === 'ledger' }" @click="tab = 'ledger'">账变</button>
    </div>
    <p v-if="error" class="form-err">{{ error }}</p>
    <p v-if="hint" class="form-hint">{{ hint }}</p>
    <section v-if="tab === 'overview' && wallet">
      <div class="cards cards-3">
        <div class="stat"><span class="stat-label">余额</span><strong>{{ yuan(wallet.balance_cents) }}</strong><em>卡密兑入，购买扣减</em></div>
        <div class="stat"><span class="stat-label">当前套餐</span><strong>{{ planTitle }}</strong><em>{{ planHint }}</em></div>
        <div class="stat"><span class="stat-label">号位</span><strong>{{ slotText }}</strong><em>已绑定 / 配额，上限 {{ wallet.max_slots }}</em></div>
      </div>
      <div class="panel">
        <p class="muted">加号费 {{ yuan(wallet.add_price_cents) }}。加号不另买时长，共享当前套餐。</p>
        <button type="button" class="btn-dark" :disabled="busy || !wallet.can_add" @click="addSlot">增加号位</button>
        <span v-if="!wallet.can_add" class="muted"> {{ wallet.cannot_add_reason }}</span>
      </div>
      <form class="panel narrow" @submit.prevent="redeem">
        <h2>兑卡</h2>
        <label>卡密<input v-model="code" autocomplete="off" required /></label>
        <button type="submit" class="btn-dark" :disabled="busy">兑换</button>
      </form>
    </section>
    <section v-if="tab === 'buy' && wallet">
      <ul class="plan-list">
        <li v-for="p in wallet.plans" :key="p.code">
          <div>
            <strong>{{ p.name }}</strong>
            <span class="muted">{{ p.duration_days }} 天</span>
          </div>
          <em>{{ yuan(p.price_cents) }}</em>
          <button type="button" class="btn-dark" :disabled="busy" @click="buy(p.code)">购买</button>
        </li>
      </ul>
    </section>
    <section v-if="tab === 'ledger'">
      <table class="plain-table">
        <thead><tr><th>时间</th><th>类型</th><th>变动</th><th>余额</th><th>说明</th></tr></thead>
        <tbody>
          <tr v-for="(row, i) in ledgers" :key="i">
            <td>{{ fmtTime(row.created_at) }}</td>
            <td>{{ typeName(row.type) }}</td>
            <td>{{ signedYuan(row.delta_cents) }}</td>
            <td>{{ yuan(row.balance_after) }}</td>
            <td>{{ row.remark }}</td>
          </tr>
          <tr v-if="!ledgers.length"><td colspan="5" class="muted">暂无数据</td></tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import http, { errMessage } from "../../api/http";
type Plan = { code: string; name: string; duration_days: number; price_cents: number };
type Ent = { valid: boolean; plan_name: string; source: string; ends_at: string | null; remaining_days: number; slot_quota: number; bound_count: number; is_trial: boolean };
type Wallet = { balance_cents: number; entitlement: Ent; add_price_cents: number; max_slots: number; can_add: boolean; cannot_add_reason: string; plans: Plan[] };
type Ledger = { type: string; delta_cents: number; balance_after: number; remark: string; created_at: string };
const tab = ref<"overview" | "buy" | "ledger">("overview");
const wallet = ref<Wallet | null>(null);
const ledgers = ref<Ledger[]>([]);
const code = ref("");
const error = ref("");
const hint = ref("");
const busy = ref(false);
const planTitle = computed(() => {
  const e = wallet.value?.entitlement;
  if (!e || !e.valid) return "无套餐";
  return (e.plan_name || "套餐") + " · " + e.remaining_days + " 天";
});
const planHint = computed(() => {
  const e = wallet.value?.entitlement;
  if (!e || !e.valid) return "兑卡或购买后生效";
  const kind = e.source === "trial" ? "体验" : "正式";
  return kind + (e.ends_at ? "，到期 " + fmtTime(e.ends_at) : "");
});
const slotText = computed(() => {
  const e = wallet.value?.entitlement;
  if (!e) return "—";
  return e.bound_count + " / " + e.slot_quota;
});
function yuan(cents: number) {
  return (Number(cents || 0) / 100).toFixed(2) + " 元";
}
function signedYuan(cents: number) {
  const n = Number(cents || 0) / 100;
  const s = n > 0 ? "+" : "";
  return s + n.toFixed(2) + " 元";
}
function fmtTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}
function typeName(t: string) {
  const m: Record<string, string> = { purchase_slot: "加号", purchase_plan: "买套餐", redeem_balance: "兑余额", redeem_plan: "兑套餐", admin_adjust: "调账" };
  return m[t] || t;
}
async function loadWallet() {
  const { data } = await http.get("/api/v1/wallet");
  wallet.value = data.data;
}
async function loadLedgers() {
  const { data } = await http.get("/api/v1/wallet/ledgers");
  ledgers.value = data.data.items || [];
}
async function redeem() {
  error.value = "";
  hint.value = "";
  busy.value = true;
  try {
    await http.post("/api/v1/wallet/redeem", { code: code.value });
    code.value = "";
    hint.value = "兑换成功";
    await loadWallet();
    await loadLedgers();
  } catch (e) {
    error.value = errMessage(e, "兑换失败");
  } finally {
    busy.value = false;
  }
}
async function buy(planCode: string) {
  error.value = "";
  hint.value = "";
  busy.value = true;
  try {
    await http.post("/api/v1/wallet/purchase", { plan_code: planCode });
    hint.value = "套餐已到账";
    await loadWallet();
    await loadLedgers();
  } catch (e) {
    error.value = errMessage(e, "购买失败");
  } finally {
    busy.value = false;
  }
}
async function addSlot() {
  error.value = "";
  hint.value = "";
  busy.value = true;
  try {
    await http.post("/api/v1/wallet/slots", {});
    hint.value = "已增加一个号位";
    await loadWallet();
    await loadLedgers();
  } catch (e) {
    error.value = errMessage(e, "加号失败");
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  try {
    await loadWallet();
    await loadLedgers();
  } catch (e) {
    error.value = errMessage(e, "读取钱包失败");
  }
});
</script>
