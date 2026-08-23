<template>
  <div class="page">
    <p class="muted"><router-link to="/douyin">← 返回号位列表</router-link></p>
    <h1>{{ acc?.nickname || "未绑定号位" }}</h1>
    <p class="muted">登录态 {{ statusText(acc?.session_status) }}<template v-if="acc?.phone_masked"> · {{ acc.phone_masked }}</template></p>
    <p v-if="error" class="form-err">{{ error }}</p>
    <p v-if="info" class="form-info">{{ info }}</p>
    <p v-if="hint" class="form-hint">{{ hint }}</p>
    <section class="panel">
      <h2>登录</h2>
      <div class="tabs">
        <button type="button" :class="{ on: tab === 'qr' }" @click="tab = 'qr'">扫码</button>
        <button type="button" :class="{ on: tab === 'sms' }" @click="tab = 'sms'">短信</button>
      </div>
      <div v-if="tab === 'qr'">
        <p class="muted">套餐无效也能重新登录。用抖音 App 扫描下方二维码，成功后写入加密会话。</p>
        <div class="btn-row">
          <button type="button" class="btn-dark" :disabled="busy" @click="startQR">获取二维码</button>
          <button v-if="canCancel" type="button" class="btn-ghost" :disabled="cancelling" @click="cancelLogin">取消当前作业</button>
        </div>
        <div v-if="qrImage" class="qr-box"><img :src="qrImage" alt="登录二维码" width="168" height="168" /></div>
        <form v-if="needQRSms" class="narrow" @submit.prevent="submitQRSms">
          <p class="muted">扫码已确认，抖音要求短信身份验证。验证码发到该抖音账号绑定手机，填到下方即可。</p>
          <label>短信验证码<input v-model="smsCode" maxlength="6" required /></label>
          <button type="submit" class="btn-dark" :disabled="smsBusy">提交验证码</button>
        </form>
      </div>
      <div v-if="tab === 'sms'">
        <p class="muted">平台不代收短信。获取验证码后在自己的手机查看短信，再填回本页。</p>
        <form class="narrow" @submit.prevent="startSMS">
          <label>手机号<input v-model="phone" maxlength="13" required /></label>
          <button type="submit" class="btn-dark" :disabled="busy">获取验证码</button>
        </form>
        <form v-if="smsSession" class="narrow" @submit.prevent="verifySMS">
          <label>短信验证码<input v-model="smsCode" maxlength="6" required /></label>
          <button type="submit" class="btn-dark" :disabled="busy">确认登录</button>
        </form>
        <div v-if="canCancel" class="btn-row">
          <button type="button" class="btn-ghost" :disabled="cancelling" @click="cancelLogin">取消当前作业</button>
        </div>
      </div>
    </section>
    <section class="panel">
      <button type="button" class="collapse-head" @click="openChan = !openChan">通道开关 {{ openChan ? "▴" : "▾" }}</button>
      <div v-if="openChan" class="chan-body">
        <label class="check"><input type="checkbox" :checked="acc?.prefer_protocol" @change="patch({ prefer_protocol: ($event.target as HTMLInputElement).checked })" /> 文字优先走协议通道</label>
        <label class="check"><input type="checkbox" :checked="acc?.allow_first_message" @change="patch({ allow_first_message: ($event.target as HTMLInputElement).checked })" /> 允许 Creator 首聊</label>
        <p class="muted">默认同步/发送仍要套餐有效。这里只存偏好。</p>
      </div>
    </section>
    <section class="panel">
      <h2>其它</h2>
      <div class="btn-row">
        <button type="button" class="btn-ghost" :disabled="busy" @click="checkSess">检查登录态</button>
        <button type="button" class="btn-ghost" :disabled="busy" @click="syncFriends">同步好友</button>
        <button type="button" class="btn-ghost" :disabled="busy || !acc?.risk_status" @click="resume">恢复风控</button>
        <button type="button" class="btn-ghost" :disabled="busy || !acc?.has_session" @click="unbind">解绑</button>
      </div>
      <p class="muted">解绑只清加密会话，号位行和聊天归档保留。</p>
    </section>
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http, { errCode, errMessage, errStatus, loginFailText } from "../../api/http";
type Acc = {
  public_id: string;
  nickname: string | null;
  douyin_uid: string | null;
  session_status: string;
  phone_masked: string;
  has_session: boolean;
  prefer_protocol: boolean;
  allow_first_message: boolean;
  risk_status: string;
  last_login_check_at?: string | null;
  login_pending?: boolean;
};
const route = useRoute();
const acc = ref<Acc | null>(null);
const tab = ref<"qr" | "sms">("qr");
const openChan = ref(false);
const error = ref("");
const hint = ref("");
const info = ref("");
const busy = ref(false);
const canCancel = ref(false);
const cancelling = ref(false);
const qrImage = ref("");
const phone = ref("");
const smsCode = ref("");
const smsSession = ref("");
const qrJobId = ref("");
const needQRSms = ref(false);
const smsBusy = ref(false);
let es: EventSource | null = null;
let esDone = false;
let pollTimer: number | null = null;
let pollDeadline = 0;
let pollLeft = 0;
let seenPending = false;
let watchStatus = "";
let watchCheckAt = "";
let watchHadSession = false;
function statusText(s?: string) {
  if (s === "valid") return "已登录";
  if (s === "expired") return "已过期";
  if (s === "unknown") return "未知";
  return "未绑定";
}
function closeES() {
  if (es) {
    es.close();
    es = null;
  }
}
function stopPoll() {
  if (pollTimer != null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}
function progressHint(step: string) {
  if (step === "launch") return "正在启动浏览器…";
  if (step === "goto") return "正在打开抖音首页…";
  if (step === "click_login") return "正在打开登录层…";
  if (step === "layer") return "已出现登录层，正在抽码…";
  if (step === "qr") return "已获取二维码，等待扫码…";
  if (step === "wait_session") return "已扫码，正在写入登录态…";
  if (step === "identity") return "扫码已确认，请完成短信验证";
  if (step === "sms_send") return "已请求短信验证码，请填写收到的验证码";
  if (step === "sms_fill") return "正在填写短信验证码…";
  if (step === "sms_submit") return "已提交短信验证码，正在等待登录…";
  if (step === "sms_wait") return "已提交验证码，仍在等待登录…";
  if (step === "sms_bad") return "验证码未通过，请重新填写";
  if (step === "sms_retry") return "验证码未填上或可能未提交，请重试或在 App 上完成验证";
  if (step === "challenge") return "登录还需完成额外验证";
  return "";
}
function onIdentityRequired() {
  needQRSms.value = true;
  hint.value = "扫码已确认，请完成短信验证";
  busy.value = false;
  pollDeadline = Date.now() + 5 * 60 * 1000;
  pollLeft = Math.max(pollLeft, 150);
}
function showLoginFail(code: string, raw: string) {
  const msg = loginFailText(raw);
  if (code === "busy") {
    error.value = msg || "上一次扫码还在进行，请等待或取消";
    info.value = "";
    canCancel.value = true;
    return;
  }
  if (code === "login_rate_limited" || code === "rate_limited") {
    info.value = msg;
    error.value = "";
    return;
  }
  info.value = "";
  error.value = msg;
}
function markLoginOK(nick?: string) {
  hint.value = nick ? "已绑定 " + nick : "登录成功";
  error.value = "";
  info.value = "";
  canCancel.value = false;
  busy.value = false;
  needQRSms.value = false;
  esDone = true;
  stopPoll();
  closeES();
  void load();
}
function beginLoginWatch() {
  watchStatus = acc.value?.session_status || "";
  watchCheckAt = acc.value?.last_login_check_at || "";
  watchHadSession = !!acc.value?.has_session;
  seenPending = false;
  pollDeadline = 0;
  pollLeft = 0;
}
function sessionBecameValid(row: Acc | null) {
  if (!row) return false;
  const ready = row.session_status === "valid" || !!row.has_session;
  if (!ready) return false;
  if (watchStatus !== "valid" && !watchHadSession) return true;
  const at = row.last_login_check_at || "";
  return !!at && at !== watchCheckAt;
}
function giveUpPoll() {
  pollTimer = null;
  if (esDone) return;
  hint.value = "未检测到登录，请重试或取消作业";
  error.value = "";
  busy.value = false;
  canCancel.value = true;
  esDone = true;
  closeES();
}
function startStatusPoll() {
  if (pollTimer != null) return;
  if (pollDeadline <= 0 || Date.now() >= pollDeadline) {
    pollDeadline = Date.now() + 5 * 60 * 1000;
    pollLeft = 150;
  }
  const tick = async () => {
    pollTimer = null;
    try {
      const { data } = await http.get("/api/v1/douyin/" + route.params.id);
      acc.value = data.data;
      if (data.data?.login_pending) seenPending = true;
      if (sessionBecameValid(data.data)) {
        markLoginOK(data.data.nickname || "");
        return;
      }
      if (seenPending && data.data && data.data.login_pending === false) {
        giveUpPoll();
        return;
      }
    } catch {
      /* 轮询失败不打断等待 */
    }
    pollLeft -= 1;
    if (pollLeft <= 0 || Date.now() >= pollDeadline) {
      giveUpPoll();
      return;
    }
    pollTimer = window.setTimeout(tick, 2000);
  };
  pollTimer = window.setTimeout(tick, 1500);
}
function listen(jobId: string) {
  closeES();
  esDone = false;
  canCancel.value = true;
  const id = String(route.params.id);
  es = new EventSource("/api/v1/douyin/" + id + "/login/events?job=" + encodeURIComponent(jobId), { withCredentials: true });
  es.onmessage = (ev) => {
    let data: { type?: string; image?: string; message?: string; nickname?: string; step?: string; sms_session?: string; code?: string; session_status?: string } = {};
    try {
      data = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (data.image) qrImage.value = data.image;
    if (data.type === "sms_required" || data.step === "identity") {
      onIdentityRequired();
    }
    if (data.type === "progress" && data.step) {
      const t = progressHint(data.step);
      if (t) hint.value = t;
      if (data.step === "sms_submit" || data.step === "sms_wait" || data.step === "sms_bad" || data.step === "sms_retry" || data.step === "challenge") {
        needQRSms.value = true;
        pollDeadline = Date.now() + 4 * 60 * 1000;
        pollLeft = Math.max(pollLeft, 120);
        busy.value = false;
      }
    }
    if (data.step === "waiting_code") {
      hint.value = "已发送，请查看自己的短信后填验证码";
      busy.value = false;
      if (data.sms_session) smsSession.value = data.sms_session;
    }
    if (data.type === "error") {
      showLoginFail(data.code || "", data.message || "登录失败");
      busy.value = false;
      esDone = true;
      stopPoll();
      closeES();
      if (data.code === "busy") {
        seenPending = true;
        startStatusPoll();
      }
    }
    if ((data.type === "success" || data.type === "done") && data.step !== "waiting_code") {
      markLoginOK(data.nickname);
    }
  };
  es.addEventListener("timeout", () => {
    if (esDone) return;
    hint.value = "登录推送已超时，正在确认是否已登录…";
    closeES();
    startStatusPoll();
  });
  es.onerror = () => {
    if (esDone) return;
    if (es && es.readyState === EventSource.CLOSED) {
      hint.value = "登录推送已断开，正在确认是否已登录…";
      closeES();
      startStatusPoll();
    }
  };
}
async function load() {
  const { data } = await http.get("/api/v1/douyin/" + route.params.id);
  acc.value = data.data;
}
async function startQR() {
  error.value = "";
  hint.value = "";
  info.value = "";
  qrImage.value = "";
  qrJobId.value = "";
  needQRSms.value = false;
  smsCode.value = "";
  busy.value = true;
  canCancel.value = false;
  beginLoginWatch();
  try {
    const { data } = await http.post("/api/v1/douyin/" + route.params.id + "/login/qr", {});
    qrJobId.value = data.data.job_id || "";
    listen(data.data.job_id);
    seenPending = true;
    startStatusPoll();
  } catch (e) {
    const code = errStatus(e) === 429 ? (errCode(e) || "login_rate_limited") : errCode(e);
    showLoginFail(code, errMessage(e));
    busy.value = false;
    if (code === "busy") {
      seenPending = true;
      startStatusPoll();
    }
  }
}
async function startSMS() {
  error.value = "";
  hint.value = "";
  info.value = "";
  busy.value = true;
  canCancel.value = false;
  beginLoginWatch();
  try {
    const { data } = await http.post("/api/v1/douyin/" + route.params.id + "/login/sms/start", { phone: phone.value });
    smsSession.value = data.data.sms_session || data.data.job_id;
    listen(data.data.job_id);
    hint.value = "正在请求验证码…";
    seenPending = true;
    startStatusPoll();
  } catch (e) {
    const code = errStatus(e) === 429 ? (errCode(e) || "login_rate_limited") : errCode(e);
    showLoginFail(code, errMessage(e));
    busy.value = false;
    if (code === "busy") {
      seenPending = true;
      startStatusPoll();
    }
  }
}
async function submitQRSms() {
  error.value = "";
  info.value = "";
  if (!qrJobId.value) {
    error.value = "没有进行中的扫码作业，请重新获取二维码";
    return;
  }
  smsBusy.value = true;
  try {
    await http.post("/api/v1/douyin/" + route.params.id + "/login/qr/sms", { job_id: qrJobId.value, code: smsCode.value });
    hint.value = "已提交短信验证码，正在等待登录…";
  } catch (e) {
    const code = errStatus(e) === 429 ? (errCode(e) || "login_rate_limited") : errCode(e);
    showLoginFail(code, errMessage(e));
  } finally {
    smsBusy.value = false;
  }
}
async function verifySMS() {
  error.value = "";
  info.value = "";
  busy.value = true;
  canCancel.value = false;
  beginLoginWatch();
  try {
    const { data } = await http.post("/api/v1/douyin/" + route.params.id + "/login/sms/verify", { sms_session: smsSession.value, code: smsCode.value });
    listen(data.data.job_id);
    seenPending = true;
    startStatusPoll();
  } catch (e) {
    const code = errStatus(e) === 429 ? (errCode(e) || "login_rate_limited") : errCode(e);
    showLoginFail(code, errMessage(e));
    busy.value = false;
    if (code === "busy") {
      seenPending = true;
      startStatusPoll();
    }
  }
}
async function cancelLogin() {
  cancelling.value = true;
  try {
    await http.post("/api/v1/douyin/" + route.params.id + "/login/cancel", {});
    canCancel.value = false;
    busy.value = false;
    esDone = true;
    stopPoll();
    closeES();
    hint.value = "已取消当前登录作业，可以重新获取二维码或验证码";
    error.value = "";
    needQRSms.value = false;
    qrJobId.value = "";
  } catch (e) {
    error.value = errMessage(e, "无法取消");
  } finally {
    cancelling.value = false;
  }
}
async function patch(body: Record<string, boolean>) {
  try {
    const { data } = await http.patch("/api/v1/douyin/" + route.params.id, body);
    acc.value = data.data;
  } catch (e) {
    error.value = errMessage(e);
  }
}
async function checkSess() {
  error.value = "";
  try {
    await http.post("/api/v1/douyin/" + route.params.id + "/session/check", {});
    hint.value = "已提交登录态检查";
    setTimeout(() => { void load(); }, 800);
  } catch (e) {
    error.value = errMessage(e);
  }
}
async function syncFriends() {
  error.value = "";
  hint.value = "";
  try {
    const { data } = await http.post("/api/v1/douyin/" + route.params.id + "/friends/sync", {});
    hint.value = "已入队同步 " + data.data.job_id;
  } catch (e) {
    error.value = errMessage(e, "无法同步");
  }
}
async function resume() {
  error.value = "";
  try {
    await http.post("/api/v1/douyin/" + route.params.id + "/risk/resume", {});
    hint.value = "已恢复该号，其它号不受影响";
    await load();
  } catch (e) {
    error.value = errMessage(e);
  }
}
async function unbind() {
  if (!window.confirm("解绑后需重新登录。号位和归档会保留。")) return;
  error.value = "";
  try {
    await http.post("/api/v1/douyin/" + route.params.id + "/unbind", {});
    hint.value = "已解绑";
    await load();
  } catch (e) {
    error.value = errMessage(e);
  }
}
onMounted(async () => {
  try {
    await load();
  } catch (e) {
    error.value = errMessage(e);
  }
});
onBeforeUnmount(() => {
  stopPoll();
  closeES();
});
</script>
