export const dynamic = 'force-dynamic';

export default function HeadersTestPage() {
  return (
    <main>
      <h2>next.config headers()</h2>
      <p>
        <code>next.config.ts</code> applies <code>x-stress-test: on</code> + custom <code>Cache-Control</code> to{' '}
        <code>/headers-test</code>. Open DevTools → Network → reload to verify.
      </p>
      <p style={{ marginTop: 16, fontSize: 13, color: '#666' }}>Source: <code>next.config.ts → headers()</code></p>
    </main>
  );
}
