<script setup lang="ts">
import { ref } from 'vue';

type Status = 'IDLE' | 'PENDING' | 'PASS' | 'FAIL';

defineProps<{
  feature: string;
  description: string;
  source: string;
  buttons: { label: string; run: () => Promise<{ pass: boolean; observed: unknown }> }[];
}>();

const status = ref<Status>('IDLE');
const observed = ref<unknown>(null);

async function execute(run: () => Promise<{ pass: boolean; observed: unknown }>) {
  status.value = 'PENDING';
  observed.value = null;
  try {
    const result = await run();
    observed.value = result.observed;
    status.value = result.pass ? 'PASS' : 'FAIL';
  } catch (err) {
    observed.value = { error: err instanceof Error ? err.message : String(err) };
    status.value = 'FAIL';
  }
}

function statusColor(s: Status) {
  return s === 'PASS' ? '#1a7f37' : s === 'FAIL' ? '#cf222e' : '#9a6700';
}
</script>

<template>
  <aside
    :style="{
      border: '1px solid #d0d7de',
      background: '#f6f8fa',
      borderRadius: '8px',
      padding: '14px 18px',
      margin: '0 0 18px 0',
      fontSize: '14px',
      lineHeight: 1.5,
    }"
  >
    <div :style="{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }">
      <span
        :style="{
          background: '#0969da',
          color: '#fff',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          padding: '3px 8px',
          borderRadius: '999px',
        }"
      >{{ feature }}</span>
      <span
        v-if="status !== 'IDLE'"
        :style="{
          marginLeft: 'auto',
          background: statusColor(status),
          color: '#fff',
          fontSize: '11px',
          fontWeight: 700,
          padding: '3px 8px',
          borderRadius: '999px',
        }"
      >{{ status }}</span>
    </div>
    <p :style="{ margin: '0 0 10px 0' }">{{ description }}</p>
    <div :style="{ display: 'flex', gap: '8px', flexWrap: 'wrap' }">
      <button
        v-for="b in buttons"
        :key="b.label"
        :disabled="status === 'PENDING'"
        :style="{
          background: '#24292f',
          color: '#fff',
          border: 0,
          padding: '6px 12px',
          borderRadius: '6px',
          cursor: status === 'PENDING' ? 'wait' : 'pointer',
          fontSize: '13px',
        }"
        @click="execute(b.run)"
      >{{ b.label }}</button>
    </div>
    <details v-if="observed != null" open :style="{ marginTop: '10px' }">
      <summary :style="{ cursor: 'pointer', fontWeight: 600, fontSize: '13px' }">Observed</summary>
      <pre
        :style="{
          background: '#0d1117',
          color: '#c9d1d9',
          padding: '10px',
          borderRadius: '6px',
          fontSize: '12px',
          overflowX: 'auto',
          maxHeight: '240px',
          margin: '6px 0 0 0',
        }"
      >{{ typeof observed === 'string' ? observed : JSON.stringify(observed, null, 2) }}</pre>
    </details>
    <div :style="{ marginTop: '8px', fontSize: '12px', color: '#666' }">
      Source: <code>{{ source }}</code>
    </div>
  </aside>
</template>
