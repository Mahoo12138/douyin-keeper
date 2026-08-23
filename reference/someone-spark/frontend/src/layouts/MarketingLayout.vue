<template>
  <div class="mkt">
    <header class="mkt-bar">
      <a class="mkt-logo" href="/">{{ name }}</a>
      <nav class="mkt-nav" aria-label="页面区块">
        <a href="#features">功能</a>
        <a href="#who">谁适合</a>
        <a href="#how">说明</a>
      </nav>
      <div class="mkt-actions">
        <template v-if="session.loggedIn">
          <router-link class="btn btn-ghost" :to="consolePath">进入控制台</router-link>
        </template>
        <template v-else>
          <router-link class="btn btn-ghost" to="/login">登录</router-link>
          <router-link v-if="registerOn" class="btn btn-solid" to="/register">注册</router-link>
        </template>
      </div>
    </header>
    <router-view />
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useSessionStore } from "../stores/session";
import "../styles/marketing.css";
const session = useSessionStore();
const name = computed(() => session.site?.name || "火花");
const registerOn = computed(() => session.site?.register_enabled !== false);
const consolePath = computed(() => (session.isAdmin ? "/admin/dashboard" : "/dashboard"));
</script>

