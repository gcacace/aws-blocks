'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <h2 style={{ color: '#cf222e' }}>Caught by error boundary</h2>
      <p>
        Message: <code>{error.message}</code>
      </p>
      <button onClick={reset} style={{ padding: '6px 14px' }}>Try again</button>
    </main>
  );
}
