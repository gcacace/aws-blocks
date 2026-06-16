<script setup lang="ts">
import { ref, onMounted } from 'vue';

const fast = ref('loading…');
const medium = ref('loading…');
const slow = ref('loading…');

onMounted(() => {
  setTimeout(() => (fast.value = `fast (1s) resolved at ${new Date().toISOString()}`), 1000);
  setTimeout(() => (medium.value = `medium (2s) resolved at ${new Date().toISOString()}`), 2000);
  setTimeout(() => (slow.value = `slow (3s) resolved at ${new Date().toISOString()}`), 3000);
});

const renderTime = new Date().toISOString();
</script>

<template>
  <main>
    <h2>Streaming / progressive hydration</h2>
    <p>
      Three deferred children (1s, 2s, 3s) hydrate progressively after first paint.
    </p>
    <p>Page first painted at {{ renderTime }}</p>
    <div :style="{ padding: '8px', border: '1px solid #ccc', marginBottom: '8px' }"><strong>Fast:</strong> {{ fast }}</div>
    <div :style="{ padding: '8px', border: '1px solid #ccc', marginBottom: '8px' }"><strong>Medium:</strong> {{ medium }}</div>
    <div :style="{ padding: '8px', border: '1px solid #ccc', marginBottom: '8px' }"><strong>Slow:</strong> {{ slow }}</div>
    <p :style="{ marginTop: '16px', fontSize: '13px', color: '#666' }">Source: <code>app/pages/streaming.vue</code></p>
  </main>
</template>
