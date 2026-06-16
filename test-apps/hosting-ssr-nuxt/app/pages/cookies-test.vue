<script setup lang="ts">
import { ref, onMounted } from 'vue';

const all = ref<string>('(loading)');

async function refresh() {
  const r = await fetch('/api/probe/cookies-readback');
  all.value = await r.text();
}

async function set3() {
  await fetch('/api/probe/cookies', { credentials: 'include' });
  await refresh();
}

async function clearAll() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
  });
  all.value = document.cookie || '(none)';
}

onMounted(() => {
  all.value = document.cookie || '(none)';
});
</script>

<template>
  <main>
    <h2>Cookies — useCookie / setCookie</h2>
    <p>
      Server sets 3 cookies via <code>setCookie(event, ...)</code> in <code>/api/probe/cookies</code>.
      Verifies multi <code>Set-Cookie</code> integrity through CloudFront and APIGW.
    </p>
    <p>Current cookies: <code>{{ all }}</code></p>
    <button :style="{ padding: '6px 14px', marginRight: '8px' }" @click="set3">Set 3 cookies</button>
    <button :style="{ padding: '6px 14px' }" @click="clearAll">Clear cookies</button>
    <p :style="{ marginTop: '16px', fontSize: '13px', color: '#666' }">Source: <code>app/pages/cookies-test.vue</code></p>
  </main>
</template>
