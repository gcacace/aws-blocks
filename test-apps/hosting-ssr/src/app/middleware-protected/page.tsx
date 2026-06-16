import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function MiddlewareProtectedPage() {
  const session = (await cookies()).get('mw-session')?.value;
  return (
    <main>
      <h2>Middleware-protected route</h2>
      <p>
        Reaching this page proves middleware allowed the request. Cookie <code>mw-session</code> = <code>{session}</code>.
      </p>
      <p style={{ marginTop: 16, fontSize: 13, color: '#666' }}>
        Source: <code>middleware.ts</code> + <code>app/middleware-protected/page.tsx</code>
      </p>
    </main>
  );
}
