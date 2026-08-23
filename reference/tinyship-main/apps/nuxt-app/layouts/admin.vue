<template>
  <SidebarProvider>
    <AppSidebar />
    <main class="flex-grow">
      <SidebarTrigger />
      <slot />
    </main>
  </SidebarProvider>
</template>

<script setup lang="ts">
// Admin layout with sidebar navigation
// Uses SidebarProvider for responsive sidebar behavior
</script> 