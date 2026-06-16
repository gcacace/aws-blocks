<script setup lang="ts">
import { ref } from 'vue';

const counter = ref<number | null>(null);

async function fetchValue() {
  const r = await fetch('/api/probe/counter');
  const j = await r.json();
  counter.value = j.value;
}

async function increment() {
  const r = await fetch('/api/probe/counter', { method: 'POST' });
  const j = await r.json();
  counter.value = j.value;
}

async function reset() {
  const r = await fetch('/api/probe/counter', { method: 'DELETE' });
  const j = await r.json();
  counter.value = j.value;
}

fetchValue();
</script>

<template>
  <main>
    <h2>Server-side counter</h2>
    <p>
      An in-memory counter on the server. Each Lambda instance has its own copy — refresh on a cold start resets it.
    </p>
    <p :style="{ fontSize: '22px' }">Counter: <strong>{{ counter ?? '(loading)' }}</strong></p>
    <button :style="{ padding: '6px 14px', marginRight: '8px' }" @click="increment">+1</button>
    <button :style="{ padding: '6px 14px' }" @click="reset">reset</button>
    <p :style="{ marginTop: '16px', fontSize: '13px', color: '#666' }">Source: <code>app/pages/server-action.vue</code> + <code>server/api/probe/counter.*.ts</code></p>
  </main>
</template>
