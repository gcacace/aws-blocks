<script setup lang="ts">
const buildTimestamp = new Date().toISOString();
</script>

<template>
  <main>
    <h2>About</h2>
    <p data-testid="about-marker">Prerendered (SSG)</p>
    <p>Build timestamp: <code data-testid="about-build-ts">{{ buildTimestamp }}</code></p>
    <p>
      This page was rendered at build time and served from S3. If you see
      a fresh timestamp on every reload, the bare-path SSG behavior is
      not configured and the SSR Lambda is re-rendering.
    </p>
  </main>
</template>
