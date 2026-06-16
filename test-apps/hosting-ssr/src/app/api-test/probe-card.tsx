'use client';

import { useState } from 'react';

type Status = 'IDLE' | 'PENDING' | 'PASS' | 'FAIL';

export type ProbeCardProps = {
  feature: string;
  description: string;
  source: string;
  buttons: {
    label: string;
    run: () => Promise<{ pass: boolean; observed: unknown }>;
  }[];
};

export default function ProbeCard({ feature, description, source, buttons }: ProbeCardProps) {
  const [status, setStatus] = useState<Status>('IDLE');
  const [observed, setObserved] = useState<unknown>(null);

  return (
    <aside
      style={{
        border: '1px solid #d0d7de',
        background: '#f6f8fa',
        borderRadius: 8,
        padding: '14px 18px',
        margin: '0 0 18px 0',
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span
          style={{
            background: '#0969da',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            padding: '3px 8px',
            borderRadius: 999,
          }}
        >
          {feature}
        </span>
        {status !== 'IDLE' && (
          <span
            style={{
              marginLeft: 'auto',
              background: status === 'PASS' ? '#1a7f37' : status === 'FAIL' ? '#cf222e' : '#9a6700',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 999,
            }}
          >
            {status}
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 10px 0' }}>{description}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {buttons.map(({ label, run }) => (
          <button
            key={label}
            disabled={status === 'PENDING'}
            onClick={async () => {
              setStatus('PENDING');
              setObserved(null);
              try {
                const result = await run();
                setObserved(result.observed);
                setStatus(result.pass ? 'PASS' : 'FAIL');
              } catch (err) {
                setObserved({ error: err instanceof Error ? err.message : String(err) });
                setStatus('FAIL');
              }
            }}
            style={{
              background: '#24292f',
              color: '#fff',
              border: 0,
              padding: '6px 12px',
              borderRadius: 6,
              cursor: status === 'PENDING' ? 'wait' : 'pointer',
              fontSize: 13,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {observed != null && (
        <details open style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Observed</summary>
          <pre
            style={{
              background: '#0d1117',
              color: '#c9d1d9',
              padding: 10,
              borderRadius: 6,
              fontSize: 12,
              overflowX: 'auto',
              maxHeight: 240,
              margin: '6px 0 0 0',
            }}
          >
            {typeof observed === 'string' ? observed : JSON.stringify(observed, null, 2)}
          </pre>
        </details>
      )}
      <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
        Source: <code>{source}</code>
      </div>
    </aside>
  );
}
