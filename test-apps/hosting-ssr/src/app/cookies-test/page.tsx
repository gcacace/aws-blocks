import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

async function setMany() {
  'use server';
  const c = await cookies();
  c.set('a', '1', { path: '/' });
  c.set('b', '2', { path: '/', httpOnly: true });
  c.set('c', '3', { path: '/', sameSite: 'lax', secure: true });
  revalidatePath('/cookies-test');
}

async function clearAll() {
  'use server';
  const c = await cookies();
  for (const ck of c.getAll()) c.delete(ck.name);
  revalidatePath('/cookies-test');
}

export const dynamic = 'force-dynamic';

export default async function CookiesPage() {
  const all = (await cookies()).getAll();
  return (
    <main>
      <h2>cookies() — server reads + writes</h2>
      <p>
        Server reads + sets cookies via <code>cookies()</code>. Verifies multi <code>Set-Cookie</code> integrity
        through CloudFront and APIGW.
      </p>
      <p>
        Current cookies ({all.length}): <code>{all.map((c) => `${c.name}=${c.value}`).join('; ') || '(none)'}</code>
      </p>
      <form action={setMany} style={{ display: 'inline' }}>
        <button style={{ padding: '6px 14px', marginRight: 8 }}>Set 3 cookies</button>
      </form>
      <form action={clearAll} style={{ display: 'inline' }}>
        <button style={{ padding: '6px 14px' }}>Clear cookies</button>
      </form>
      <p style={{ marginTop: 16, fontSize: 13, color: '#666' }}>Source: <code>app/cookies-test/page.tsx</code></p>
    </main>
  );
}
