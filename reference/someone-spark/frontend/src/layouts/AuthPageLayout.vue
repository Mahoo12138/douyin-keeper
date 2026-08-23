<template>
  <div class="auth-page">
    <div class="auth-card">
      <router-link class="auth-brand" to="/">{{ name }}</router-link>
      <router-view />
    </div>
    <p class="auth-foot"><router-link to="/">返回首页</router-link></p>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useSessionStore } from "../stores/session";
const session = useSessionStore();
const name = computed(() => session.site?.name || "火花");
</script>
