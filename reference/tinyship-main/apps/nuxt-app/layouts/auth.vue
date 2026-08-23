<template>
  <main class="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
    <div class="flex w-full max-w-sm flex-col gap-6">
      <NuxtLink :to="localePath('/')" class="self-center">
        <AppLogo size="md" />
      </NuxtLink>
      <slot />
    </div>
  </main>
</template>

<script setup lang="ts">
// Import internationalization
const localePath = useLocalePath()
</script> 