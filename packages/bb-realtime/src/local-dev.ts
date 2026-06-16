// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Internal local-dev plumbing for Realtime. Not part of the public API.
 * Shared between the mock entry and the WebSocket server.
 */
import type { EventEmitter } from 'events';

let broadcastBus: EventEmitter | null = null;

/** Called by the dev server to wire up WebSocket broadcasting. */
export function setBroadcastBus(bus: EventEmitter) {
	broadcastBus = bus;
}

export function getBroadcastBus(): EventEmitter | null {
	return broadcastBus;
}

/** Static secret for local dev token signing. Shared with ws-server. */
export const LOCAL_TOKEN_SECRET = '__blocks_local_dev_secret__';
