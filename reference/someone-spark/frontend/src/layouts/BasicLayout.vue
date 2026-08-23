<template>
  <div class="console">
    <aside class="side" :class="{ collapsed }">
      <div class="side-brand">
        <span class="side-mark">火</span>
        <span v-show="!collapsed" class="side-name">{{ name }}</span>
      </div>
      <nav class="side-nav">
        <div v-for="g in groups" :key="g.key" class="side-group">
          <button type="button" class="side-group-title" @click="toggle(g.key)">{{ g.label }}</button>
          <div v-show="open[g.key]" class="side-items">
            <router-link v-for="item in g.items" :key="item.path" :to="item.path" class="side-link">{{ item.label }}</router-link>
          </div>
        </div>
      </nav>
    </aside>
    <div class="console-main">
      <header class="console-head">
        <button type="button" class="icon-btn" @click="collapsed = !collapsed">菜单</button>
        <span class="head-email">{{ session.me?.email }}</span>
        <a class="head-link" href="/" target="_self">官网</a>
        <button type="button" class="icon-btn" @click="onLogout">退出</button>
      </header>
      <main class="console-body">
        <router-view />
      </main>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSessionStore } from "../stores/session";
const session = useSessionStore();
const route = useRoute();
const router = useRouter();
const collapsed = ref(false);
const name = computed(() => session.site?.name || "火花");
const userGroups = [
  { key: "overview", label: "总览", items: [{ path: "/dashboard", label: "数据看板" }] },
  { key: "account", label: "账户", items: [{ path: "/wallet", label: "钱包与套餐" }, { path: "/account", label: "账户设置" }] },
  { key: "douyin", label: "抖音", items: [{ path: "/douyin", label: "账号" }, { path: "/friends", label: "好友" }, { path: "/chat", label: "聊天" }, { path: "/tasks", label: "任务" }] },
  { key: "logs", label: "记录", items: [{ path: "/logs", label: "发送日志" }] }
];
const adminGroups = [
  { key: "overview", label: "总览", items: [{ path: "/admin/dashboard", label: "数据看板" }] },
  { key: "ops", label: "运营", items: [{ path: "/admin/users", label: "用户" }, { path: "/admin/plans", label: "套餐" }, { path: "/admin/keys", label: "卡密" }] },
  { key: "review", label: "审核", items: [{ path: "/admin/chat-review", label: "聊天审核" }] },
  { key: "sys", label: "系统", items: [{ path: "/admin/settings", label: "站点" }, { path: "/admin/audit", label: "审计" }] }
];
const groups = computed(() => (session.isAdmin ? adminGroups : userGroups));
const open = reactive<Record<string, boolean>>({});
function initOpen() {
  for (const g of groups.value) {
    open[g.key] = g.items.some((i) => route.path === i.path || route.path.startsWith(i.path + "/"));
  }
}
initOpen();
function toggle(key: string) {
  open[key] = !open[key];
}
async function onLogout() {
  await session.logout();
  await router.push("/");
}
</script>
