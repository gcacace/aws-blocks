# Realtime — Use Cases & Scaling Guide

A practical guide to common real-time use cases and how they map to the Realtime Building Block's scaling characteristics.

## Use Cases by Scale

### Ideal Fit (tens to hundreds of subscribers per channel)

These are the bread-and-butter use cases where Realtime shines with minimal configuration.

| Use Case | Typical Subscribers/Channel | Publish Frequency | Example |
|---|---|---|---|
| Collaborative cursors & selections | 2–50 | High (every pointer move) | Figma-style multi-user editing |
| Chat rooms | 5–200 | Moderate | Team channels, in-app support |
| Per-user notifications | 1 | Low | Alerts, badges, inbox updates |
| Typing indicators & presence | 2–50 | High (debounced) | "Alice is typing…" |
| Live form/dashboard updates | 1–10 | Moderate | Admin panels, CRM live views |
| Multiplayer game state | 2–100 | High | Lobbies, turn-based, casual games |
| Collaborative whiteboard | 2–30 | High | Shared canvas, sticky notes |
| IoT device status | 1–10 | Low–moderate | Smart home dashboards |

**Publish latency:** < 10ms for most of these (single wave of parallel delivery).

### Good Fit with Consideration (hundreds to low-thousands)

These work well but publish latency becomes noticeable. Consider whether the API response should block on delivery.

| Use Case | Typical Subscribers/Channel | Publish Frequency | Guidance |
|---|---|---|---|
| Live comments on content | 10–500 | Moderate | Inline publish is fine up to ~500 |
| Live auction / bidding | 50–5,000 | Bursty | Use `AsyncJob` for the publish if response time matters |
| Live sports scores | 5,000–50,000 | High during key moments | Offload to `AsyncJob`; consider sharding |
| Stock / crypto tickers | 1,000–50,000 | Very high | Sharded `AsyncJob` fan-out |
| Live event reactions | 5,000–100,000 | Bursty | Sharded fan-out required |

**Publish latency at scale:**
- 500 subscribers: ~50–100ms
- 1,000 subscribers: ~100–200ms
- 5,000 subscribers: offload to `AsyncJob` (don't block the API response)

### Beyond Scope (dedicated infrastructure recommended)

These use cases have requirements that go beyond pub/sub message delivery.

| Use Case | Why It's Different |
|---|---|
| Live video/audio signaling (WebRTC) | Requires STUN/TURN servers and media negotiation, not just data messages |
| MMO real-time physics | Needs < 16ms tick rate, UDP transport, authoritative game server |
| Global broadcast (millions of recipients) | Requires CDN-level fan-out (e.g., SNS to millions of endpoints) |
| Financial trading (order books, HFT) | Requires sub-millisecond latency and co-located infrastructure |
| Collaborative code editing (OT/CRDT) | Needs conflict resolution algorithms on top of the transport layer |
| Screen sharing / remote desktop | Requires binary frame streaming, not JSON messages |

For these, Realtime can still serve as the signaling/coordination layer (e.g., WebRTC offer/answer exchange), but the primary data flow needs dedicated infrastructure.

## Scaling Patterns

### Inline Publish (default)

```typescript
await rt.publish('chat', roomId, message);
```

Best for: < 1,000 subscribers. Publish completes when all deliveries finish. Adds ~5–200ms to API response depending on subscriber count.

### AsyncJob Offload

```typescript
const broadcast = new AsyncJob(scope, 'broadcast', {
  schema: z.object({ channel: z.string(), data: messageSchema }),
  handler: async ({ channel, data }) => { await rt.publish('chat', channel, data); },
});

// In your API method — returns immediately
await broadcast.submit({ channel: roomId, data: message });
```

Best for: 1,000–10,000 subscribers. Decouples publish latency from API response time.

### Sharded Fan-Out

For 10,000+ subscribers, a single Lambda invocation will hit API Gateway's connection pool limits. Shard the work across multiple jobs:

```typescript
const shardedBroadcast = new AsyncJob(scope, 'shard-broadcast', {
  schema: z.object({ channel: z.string(), data: messageSchema, shard: z.number() }),
  handler: async ({ channel, data, shard }) => {
    // Each shard handles a slice of subscribers
    // Implementation depends on your sharding strategy
  },
});
```

Best for: 10,000–100,000 subscribers. Bridges the gap while evaluating dedicated WebSocket infrastructure.

## Common Patterns by Industry

| Industry | Primary Use Case | Channels | Scale |
|---|---|---|---|
| SaaS / Productivity | Collaboration, presence | Per-document | 2–50/channel |
| E-commerce | Live inventory, auctions | Per-product/auction | 10–5,000/channel |
| Social / Community | Chat, reactions, notifications | Per-room, per-user | 5–500/channel |
| Gaming | Lobbies, match state | Per-match | 2–100/channel |
| Fintech | Price feeds, portfolio updates | Per-symbol, per-user | 1–50,000/channel |
| Healthcare | Patient monitoring dashboards | Per-patient | 1–5/channel |
| Media / Entertainment | Live comments, polls | Per-stream | 100–100,000/channel |

## Key Takeaway

Most real-world applications operate in the 1–100 subscribers/channel range, where Realtime delivers messages in under 10ms with zero configuration. The 80/20 rule applies: optimize for the common case (small channels, many of them) and use explicit fan-out patterns for the rare large-audience channels.
