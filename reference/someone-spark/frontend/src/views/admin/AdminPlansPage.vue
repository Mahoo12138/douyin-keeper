<template>
  <div class="page">
    <h1>套餐</h1>
    <p v-if="error" class="form-err">{{ error }}</p>
    <table class="plain-table">
      <thead><tr><th>编码</th><th>名称</th><th>天数</th><th>价格（分）</th><th>日限额</th><th>上架</th><th></th></tr></thead>
      <tbody>
        <tr v-for="p in plans" :key="p.code">
          <td>{{ p.code }}</td>
          <td><input v-model="p.name" /></td>
          <td><input v-model.number="p.duration_days" type="number" min="1" /></td>
          <td><input v-model.number="p.price_cents" type="number" min="0" /></td>
          <td><input v-model.number="p.daily_send_limit" type="number" min="0" /></td>
          <td><input type="checkbox" v-model="p.is_active" /></td>
          <td class="row-act"><button type="button" class="btn-dark" :disabled="busy" @click="save(p)">保存</button></td>
        </tr>
      </tbody>
    </table>
    <form class="panel narrow" @submit.prevent="create">
      <h2>新增</h2>
      <label>编码<input v-model="code" required /></label>
      <label>名称<input v-model="name" required /></label>
      <label>天数<input v-model.number="days" type="number" min="1" required /></label>
      <label>价格（分）<input v-model.number="price" type="number" min="0" required /></label>
      <button type="submit" class="btn-dark" :disabled="busy">创建</button>
    </form>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import http, { errMessage } from "../../api/http";
type Plan = { code: string; name: string; duration_days: number; price_cents: number; daily_send_limit: number | null; is_active: boolean };
const plans = ref<Plan[]>([]);
const error = ref("");
const busy = ref(false);
const code = ref("");
const name = ref("");
const days = ref(31);
const price = ref(4900);
async function load() {
  const { data } = await http.get("/api/v1/admin/plans");
  plans.value = data.data.plans || [];
}
async function save(p: Plan) {
  busy.value = true;
  try {
    await http.patch("/api/v1/admin/plans/" + p.code, { name: p.name, duration_days: p.duration_days, price_cents: p.price_cents, daily_send_limit: p.daily_send_limit || null, is_active: p.is_active });
    await load();
  } catch (e) {
    error.value = errMessage(e);
  } finally {
    busy.value = false;
  }
}
async function create() {
  busy.value = true;
  try {
    await http.post("/api/v1/admin/plans", { code: code.value, name: name.value, duration_days: days.value, price_cents: price.value });
    code.value = "";
    name.value = "";
    await load();
  } catch (e) {
    error.value = errMessage(e);
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
