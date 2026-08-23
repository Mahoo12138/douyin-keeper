<template>
  <div class="page">
    <h1>{{ title }}</h1>
    <p class="muted">这一页的业务还在后续里程碑，菜单先留着以免信息架构改来改去。</p>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
const route = useRoute();
const title = computed(() => (typeof route.meta.title === "string" ? route.meta.title : "即将开放"));
</script>
