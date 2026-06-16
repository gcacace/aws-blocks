<script setup lang="ts">
throw createError({ statusCode: 500, statusMessage: 'intentional from /error-boundary' });
</script>

<template>
  <p>Should never render.</p>
</template>
