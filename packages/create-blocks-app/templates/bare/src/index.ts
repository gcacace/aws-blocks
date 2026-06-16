// Import backend APIs directly - fully type-safe
import { api } from 'aws-blocks';
import { html, render } from 'lit-html';

// Backend APIs are defined in aws-blocks/index.ts
// Full docs: node_modules/@aws-blocks/blocks/README.md

async function main() {
  const result = await api.greet("World");
  
  render(html`
    <div>
      <h1>Blocks App</h1>
      <p>${result.message}</p>
      <p>Timestamp: ${new Date(result.timestamp).toLocaleString()}</p>
    </div>
  `, document.getElementById('app')!);
}

main();
