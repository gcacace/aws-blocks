// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ThrowingProvider — extends CannedProvider but throws mid-stream.
 * Used in unit tests to verify block buffer flush on error.
 */
import { CannedProvider } from './canned.js';
import type { Message, ModelStreamEvent, StreamOptions } from '@strands-agents/sdk';

export class ThrowingProvider extends CannedProvider {
	async *stream(_messages: Message[], _options?: StreamOptions): AsyncIterable<ModelStreamEvent> {
		yield { type: 'modelMessageStartEvent', role: 'assistant' };
		yield { type: 'modelContentBlockStartEvent' };
		yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: 'partial ' } };
		yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: 'text' } };
		throw new Error('simulated mid-stream failure');
	}
}
