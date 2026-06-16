import assert from 'node:assert';

// Basic e2e test for the Next.js template
// Run with: npm run test:e2e

async function test() {
  const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
  
  console.log(`Testing ${baseUrl}...`);
  
  // Test home page loads
  const res = await fetch(baseUrl);
  assert.strictEqual(res.status, 200, 'Home page should return 200');
  
  const html = await res.text();
  assert.ok(html.includes('AWS Blocks + Next.js'), 'Page should contain title');
  
  console.log('✓ All tests passed');
}

test().catch((err) => {
  console.error('✗ Test failed:', err.message);
  process.exit(1);
});
