import { revalidatePath } from 'next/cache';

const g = globalThis as unknown as { __counter?: { value: number } };
function getCounter() {
  if (!g.__counter) g.__counter = { value: 0 };
  return g.__counter;
}

async function increment() {
  'use server';
  getCounter().value++;
  revalidatePath('/server-action');
}

async function reset() {
  'use server';
  getCounter().value = 0;
  revalidatePath('/server-action');
}

export const dynamic = 'force-dynamic';

export default function ServerActionPage() {
  const c = getCounter();
  return (
    <main>
      <h2>Server Action + revalidatePath</h2>
      <p>
        Form-action posts to a server function. Counter is in-memory per Lambda instance — refreshing on a cold start
        resets it. Click <code>+1</code>, then <code>reset</code>.
      </p>
      <p style={{ fontSize: 22 }}>
        Counter: <strong data-testid="counter-value">{c.value}</strong>
      </p>
      <form action={increment} style={{ display: 'inline' }}>
        <button style={{ padding: '6px 14px', marginRight: 8 }}>+1</button>
      </form>
      <form action={reset} style={{ display: 'inline' }}>
        <button style={{ padding: '6px 14px' }}>reset</button>
      </form>
      <p style={{ marginTop: 16, fontSize: 13, color: '#666' }}>Source: <code>app/server-action/page.tsx</code></p>
    </main>
  );
}
