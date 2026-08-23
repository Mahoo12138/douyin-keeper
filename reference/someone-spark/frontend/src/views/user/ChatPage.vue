<template>
  <div class="page">
    <h1>聊天</h1>
    <p class="muted">先选号。左好友右归档。用户不能删消息；解绑后归档仍在。无会话首聊需在号位详情打开 Creator 开关。</p>
    <div class="toolbar">
      <label>当前号
        <select v-model="account" @change="onAccount">
          <option value="">选择号位</option>
          <option v-for="a in accounts" :key="a.public_id" :value="a.public_id">{{ a.nickname || "未绑定" }}</option>
        </select>
      </label>
      <button type="button" class="btn-ghost" :disabled="!account || busy" @click="archive">同步聊天</button>
    </div>
    <p v-if="error" class="form-err">{{ error }}</p>
    <p v-if="hint" class="form-hint">{{ hint }}</p>
    <div class="chat-split">
      <aside class="chat-friends">
        <button v-for="f in friends" :key="f.public_id" type="button" class="friend-item" :class="{ on: friend === f.public_id }" @click="pick(f.public_id)">
          <strong>{{ f.nickname || f.display_name }}</strong>
          <span class="muted">{{ f.has_conversation ? "已有会话" : "未聊·可首聊" }}</span>
        </button>
        <p v-if="account && !friends.length" class="muted">暂无数据</p>
      </aside>
      <section class="chat-thread">
        <div class="msgs">
          <div v-for="(m, i) in messages" :key="i" class="bubble" :class="m.direction">
            <p>{{ m.body || (m.media_url ? "[图片] " + m.media_url : m.msg_type) }}</p>
            <em>{{ m.source }} · {{ m.observed_at }}</em>
          </div>
          <p v-if="friend && !messages.length" class="muted">暂无数据</p>
        </div>
        <form class="composer" @submit.prevent="sendText">
          <select v-model="sticker">
            <option value="">文字</option>
            <option v-for="s in stickers" :key="s.key" :value="s.key">{{ s.name }}</option>
          </select>
          <input v-model="text" maxlength="500" placeholder="发给当前好友" />
          <button type="submit" class="btn-dark" :disabled="!friend || busy">发送</button>
        </form>
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http, { errMessage } from "../../api/http";
type Acc = { public_id: string; nickname: string | null };
type Friend = { public_id: string; display_name: string; nickname: string; has_conversation: boolean };
type Msg = { direction: string; msg_type: string; body: string; media_url: string; source: string; observed_at: string };
type Sticker = { key: string; name: string };
const route = useRoute();
const router = useRouter();
const accounts = ref<Acc[]>([]);
const friends = ref<Friend[]>([]);
const messages = ref<Msg[]>([]);
const stickers = ref<Sticker[]>([]);
const account = ref("");
const friend = ref("");
const text = ref("");
const sticker = ref("");
const error = ref("");
const hint = ref("");
const busy = ref(false);
async function waitJob(jobId: string) {
  for (let i = 0; i < 24; i++) {
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
  const { data: st } = await http.get("/api/v1/stickers", { params: { account: account.value } });
  stickers.value = st.data.stickers || [];
}
async function loadMsgs() {
  messages.value = [];
  if (!account.value || !friend.value) return;
  const { data } = await http.get("/api/v1/chat/messages", { params: { account: account.value, friend: friend.value } });
  messages.value = data.data.messages || [];
}
function pick(id: string) {
  friend.value = id;
  void router.replace({ path: "/chat", query: { account: account.value, friend: id } });
  void loadMsgs();
}
async function onAccount() {
  friend.value = "";
  messages.value = [];
  await loadFriends();
  if (friends.value[0]) pick(friends.value[0].public_id);
}
async function archive() {
  error.value = "";
  hint.value = "";
  busy.value = true;
  try {
    const { data } = await http.post("/api/v1/douyin/" + account.value + "/chat/archive", {});
    const res = await waitJob(data.data.job_id);
    hint.value = res && res.ok === false ? (res.message || "同步失败") : "归档已追加（去重，不删旧行）";
    await loadMsgs();
  } catch (e) {
    error.value = errMessage(e);
  } finally {
    busy.value = false;
  }
}
async function sendText() {
  error.value = "";
  hint.value = "";
  if (!friend.value) return;
  busy.value = true;
  try {
    const body = sticker.value ? { sticker_key: sticker.value } : { body: text.value };
    const { data } = await http.post("/api/v1/friends/" + friend.value + "/send", body);
    const res = await waitJob(data.data.job_id);
    if (res && res.ok === false) {
      error.value = res.error_code || res.message || "发送失败";
    } else {
      hint.value = "已发送 · " + (res.channel || "");
      text.value = "";
      sticker.value = "";
      await loadFriends();
      await loadMsgs();
    }
  } catch (e) {
    error.value = errMessage(e, "无法发送");
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  try {
    const { data } = await http.get("/api/v1/douyin");
    accounts.value = data.data.accounts || [];
    const qa = typeof route.query.account === "string" ? route.query.account : "";
    const qf = typeof route.query.friend === "string" ? route.query.friend : "";
    account.value = qa || accounts.value[0]?.public_id || "";
    if (account.value) await loadFriends();
    if (qf) {
      friend.value = qf;
      await loadMsgs();
    } else if (friends.value[0]) {
      pick(friends.value[0].public_id);
    }
  } catch (e) {
    error.value = errMessage(e);
  }
});
</script>
