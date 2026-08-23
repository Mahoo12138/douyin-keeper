<template>
  <div class="page">
    <h1>发卡</h1>
    <p class="muted">明文卡密只出现这一次，请立刻交给用户。库里只存哈希。</p>
    <form class="panel narrow" @submit.prevent="create">
      <label>类型
        <select v-model="kind">
          <option value="balance">余额卡</option>
          <option value="plan">套餐卡</option>
        </select>
      </label>
      <label v-if="kind === 'balance'">金额（分）<input v-model.number="amount" type="number" min="1" required /></label>
      <label v-if="kind === 'plan'">套餐
        <select v-model="plan">
          <option value="weekly">周卡</option>
          <option value="monthly">月卡</option>
          <option value="quarterly">季卡</option>
          <option value="yearly">年卡</option>
        </select>
      </label>
      <label>数量<input v-model.number="qty" type="number" min="1" max="50" required /></label>
      <label>备注<input v-model="remark" maxlength="80" /></label>
      <p v-if="error" class="form-err">{{ error }}</p>
      <button type="submit" class="btn-dark" :disabled="busy">生成</button>
    </form>
    <section v-if="codes.length" class="panel">
      <p class="form-hint">请复制保存，关闭页面后无法再看明文。</p>
      <pre class="code-dump">{{ codes.join("\n") }}</pre>
    </section>
    <section class="panel">
      <h2>批次</h2>
      <p class="muted">库中只存哈希，列表不回明文。</p>
      <table class="plain-table">
        <thead><tr><th>批次</th><th>类型</th><th>数量</th><th>未兑</th><th>已兑</th><th>备注</th><th>时间</th></tr></thead>
        <tbody>
          <tr v-for="b in batches" :key="b.public_id">
            <td>{{ b.public_id }}</td>
            <td>{{ b.kind }}{{ b.plan_code ? " / " + b.plan_code : "" }}{{ b.kind === "balance" ? " / " + (b.amount_cents / 100).toFixed(2) : "" }}</td>
            <td>{{ b.quantity }}</td>
            <td>{{ b.unused }}</td>
            <td>{{ b.used }}</td>
            <td>{{ b.remark || "—" }}</td>
            <td>{{ b.created_at.replace("T", " ").slice(0, 16) }}</td>
          </tr>
          <tr v-if="!batches.length"><td colspan="7" class="muted">暂无数据</td></tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import http, { errMessage } from "../../api/http";
type Batch = { public_id: string; kind: string; plan_code: string; amount_cents: number; quantity: number; unused: number; used: number; remark: string; created_at: string };
const kind = ref<"balance" | "plan">("balance");
const amount = ref(10000);
const plan = ref("monthly");
const qty = ref(1);
const remark = ref("");
const error = ref("");
const busy = ref(false);
const codes = ref<string[]>([]);
const batches = ref<Batch[]>([]);
async function loadBatches() {
  const { data } = await http.get("/api/v1/admin/keys/batches");
  batches.value = data.data.batches || [];
}
async function create() {
  error.value = "";
  busy.value = true;
  try {
    const body: Record<string, unknown> = { kind: kind.value, quantity: qty.value, remark: remark.value };
    if (kind.value === "balance") body.amount_cents = amount.value;
    if (kind.value === "plan") body.plan_code = plan.value;
    const { data } = await http.post("/api/v1/admin/keys", body);
    codes.value = data.data.codes || [];
    await loadBatches();
  } catch (e) {
    error.value = errMessage(e, "生成失败");
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  try {
    await loadBatches();
  } catch (e) {
    error.value = errMessage(e);
  }
});
</script>
