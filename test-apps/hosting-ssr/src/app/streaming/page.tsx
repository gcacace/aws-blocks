import { Suspense } from 'react';

async function Slow({ ms, label }: { ms: number; label: string }) {
  await new Promise((r) => setTimeout(r, ms));
  return (
    <div style={{ padding: 8, border: '1px solid #ccc', marginBottom: 8 }}>
      <strong>{label}</strong> resolved at {new Date().toISOString()} (after {ms}ms)
    </div>
  );
}

export const dynamic = 'force-dynamic';

export default function StreamingPage() {
  return (
    <main>
      <h2>React Streaming Suspense</h2>
      <p>
        Three deferred async children flush independently. TTFB should be much smaller than the total render time.
        Open DevTools → Network → reload, expand the document row to see chunk timings.
      </p>
      <p>Page started rendering at {new Date().toISOString()}</p>
      <Suspense fallback={<div>fast (1s) loading…</div>}>
        <Slow ms={1000} label="fast (1s)" />
      </Suspense>
      <Suspense fallback={<div>medium (2s) loading…</div>}>
        <Slow ms={2000} label="medium (2s)" />
      </Suspense>
      <Suspense fallback={<div>slow (3s) loading…</div>}>
        <Slow ms={3000} label="slow (3s)" />
      </Suspense>
      <p style={{ marginTop: 16, fontSize: 13, color: '#666' }}>Source: <code>app/streaming/page.tsx</code></p>
    </main>
  );
}
