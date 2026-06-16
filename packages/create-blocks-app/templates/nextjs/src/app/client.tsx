'use client';

import { useState } from 'react';
import { api } from 'aws-blocks';

// Client Component — runs in the browser
export function ClientGreeting() {
  const [name, setName] = useState('');
  const [greeting, setGreeting] = useState<{ message: string; timestamp: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGreet() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      // Blocks client auto-discovers the API URL from config.json
      const result = await api.greet(name);
      setGreeting(result);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGreet()}
          placeholder="Enter your name"
          style={{ padding: '0.5rem', flex: 1 }}
        />
        <button onClick={handleGreet} disabled={loading} style={{ padding: '0.5rem 1rem' }}>
          {loading ? '...' : 'Greet'}
        </button>
      </div>
      {greeting && (
        <pre style={{ margin: 0 }}>
          {JSON.stringify(greeting, null, 2)}
        </pre>
      )}
    </div>
  );
}
