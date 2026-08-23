<template>
  <div class="page">
    <h1>站点设置</h1>
    <p v-if="error" class="form-err">{{ error }}</p>
    <p v-if="notice" class="form-hint">{{ notice }}</p>
    <form class="settings-grid" @submit.prevent="save">
      <section class="panel">
        <h2>站点</h2>
        <label>名称<input v-model="form['site.name']" /></label>
        <label>公告<input v-model="form['site.notice']" /></label>
        <label class="check"><input type="checkbox" v-model="maint" /> 维护模式</label>
        <label class="check"><input type="checkbox" v-model="regOn" /> 开放注册</label>
        <label>体验天数<input v-model="form['register.trial_days']" type="number" min="0" /></label>
      </section>
      <section class="panel">
        <h2>SEO</h2>
        <label>标题<input v-model="form['seo.title']" /></label>
        <label>描述<input v-model="form['seo.description']" /></label>
      </section>
      <section class="panel">
        <h2>计费与限额</h2>
        <label>加号费（分）<input v-model="form['billing.add_account_price_cents']" type="number" min="0" /></label>
        <label>每用户最多号位<input v-model="form['douyin.max_accounts_per_user']" type="number" min="1" /></label>
        <label>日限额<input v-model="form['send.daily_limit']" type="number" min="1" /></label>
        <label>硬顶<input v-model="form['send.hard_daily_cap']" type="number" min="1" /></label>
        <label>首聊日限额<input v-model="form['send.first_message_daily_limit']" type="number" min="0" /></label>
        <label class="check"><input type="checkbox" v-model="protoOn" /> 协议通道</label>
      </section>
      <section class="panel">
        <h2>静默与 Worker</h2>
        <label>静默开始<input v-model="form['send.quiet_start']" placeholder="00:00" /></label>
        <label>静默结束<input v-model="form['send.quiet_end']" placeholder="07:00" /></label>
        <label>同时浏览器数<input v-model="form['worker.max_browsers']" type="number" min="1" /></label>
      </section>
      <section class="panel">
        <h2>SMTP</h2>
        <label>主机<input v-model="form['smtp.host']" /></label>
        <label>端口<input v-model="form['smtp.port']" /></label>
        <label>用户<input v-model="form['smtp.user']" /></label>
        <label>发件人<input v-model="form['smtp.from']" /></label>
        <label>密码（只写不回）<input v-model="smtpPass" type="password" autocomplete="new-password" :placeholder="hasSmtp ? '已配置，留空不改' : '未设置'" /></label>
      </section>
      <section class="panel">
        <h2>登录限流</h2>
        <p class="muted">扫码/短信：每号每分钟 8 次、每 IP 每分钟 20 次，到期自动解除，不会永久封。调试连点后可立即清掉。</p>
        <button type="button" class="btn-ghost" :disabled="busy" @click="clearLoginRate">解除扫码/短信限流</button>
      </section>
      <div class="panel">
        <button type="submit" class="btn-dark" :disabled="busy">保存</button>
      </div>
    </form>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import http, { errMessage } from "../../api/http";
import { useSessionStore } from "../../stores/session";
const session = useSessionStore();
const form = ref<Record<string, string>>({});
const smtpPass = ref("");
const hasSmtp = ref(false);
const error = ref("");
const notice = ref("");
const busy = ref(false);
const maint = computed({
  get: () => form.value["site.maintenance"] === "1",
  set: (v: boolean) => { form.value["site.maintenance"] = v ? "1" : "0"; }
});
const regOn = computed({
  get: () => form.value["register.enabled"] !== "0",
  set: (v: boolean) => { form.value["register.enabled"] = v ? "1" : "0"; }
});
const protoOn = computed({
  get: () => form.value["send.protocol_enabled"] !== "0",
  set: (v: boolean) => { form.value["send.protocol_enabled"] = v ? "1" : "0"; }
});
onMounted(async () => {
  try {
    const { data } = await http.get("/api/v1/admin/settings");
    const raw = data.data || {};
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === "smtp.has_password") {
        hasSmtp.value = !!v;
        continue;
      }
      next[k] = v == null ? "" : String(v);
    }
    form.value = next;
  } catch (e) {
    error.value = errMessage(e);
  }
});
async function clearLoginRate() {
  error.value = "";
  notice.value = "";
  busy.value = true;
  try {
    const { data } = await http.post("/api/v1/admin/login-rate/clear", {});
    notice.value = "已解除 " + (data?.data?.cleared ?? 0) + " 条扫码/短信限流";
  } catch (e) {
    error.value = errMessage(e);
  } finally {
    busy.value = false;
  }
}
async function save() {
  error.value = "";
  notice.value = "";
  busy.value = true;
  try {
    const body: Record<string, string> = { ...form.value };
    if (smtpPass.value) body["smtp.password"] = smtpPass.value;
    await http.put("/api/v1/admin/settings", body);
    smtpPass.value = "";
    notice.value = "已保存，看板缓存已清。";
    const site = await http.get("/api/v1/public/site");
    session.site = site.data.data;
  } catch (e) {
    error.value = errMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>
