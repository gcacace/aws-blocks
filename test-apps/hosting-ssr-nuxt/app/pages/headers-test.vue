<template>
  <main>
    <h2>Route rule headers</h2>
    <p>
      <code>nuxt.config.ts</code> applies <code>x-stress-test: on</code> + <code>cache-control: s-maxage=120, stale-while-revalidate=60</code>{' '}
      to <code>/headers-test</code>. Open DevTools → Network → reload to verify.
    </p>
    <p :style="{ marginTop: '16px', fontSize: '13px', color: '#666' }">Source: <code>nuxt.config.ts → routeRules</code></p>
  </main>
</template>
