export default function RedirectedPage() {
  return (
    <main>
      <h2>If you can read this, the redirect is broken.</h2>
      <p>
        <code>/redirected</code> should 302 to <code>/</code> via <code>next.config.ts → redirects()</code>.
      </p>
    </main>
  );
}
