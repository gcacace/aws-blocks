'use client';

export const dynamic = 'force-dynamic';

export default function MiddlewareLogin() {
  function setSession() {
    document.cookie = 'mw-session=ok; path=/';
    location.href = '/middleware-protected';
  }
  function clearSession() {
    document.cookie = 'mw-session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
    location.reload();
  }
  return (
    <main>
      <h2>Middleware login</h2>
      <p>
        The Next.js <code>middleware.ts</code> protects <code>/middleware-protected</code>. If no <code>mw-session</code>{' '}
        cookie is present, it 302s to this page. Click <em>Sign in</em> to set the cookie and try again.
      </p>
      <button style={{ padding: '6px 14px', marginRight: 8 }} onClick={setSession}>Sign in</button>
      <button style={{ padding: '6px 14px' }} onClick={clearSession}>Clear cookie</button>
    </main>
  );
}
