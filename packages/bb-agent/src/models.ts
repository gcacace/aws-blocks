// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { ModelConfig } from './types.js';

/**
 * Pre-configured Bedrock model presets using cross-region inference profiles.
 * Names are capability-based so the underlying model can be upgraded without breaking user code.
 */
export const BedrockModels = {
	/** Highest capability and best performance. Recommended default. Currently: Claude Opus 4.8. */
	DEFAULT: {
		provider: 'bedrock',
		modelId: 'us.anthropic.claude-opus-4-8-20250610-v1:0',
	},
	/** Strong quality/cost balance. Currently: Claude Sonnet 4. */
	BALANCED: {
		provider: 'bedrock',
		modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
	},
	/** Fastest and lowest latency. Currently: Claude Haiku 4.5. */
	FAST: {
		provider: 'bedrock',
		modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
	},
	/** Low cost per token with acceptable quality. Currently: Amazon Nova Pro. */
	BUDGET: {
		provider: 'bedrock',
		modelId: 'us.amazon.nova-pro-v1:0',
	},
	/** Ultra-cheap for simple tasks. Currently: Amazon Nova Lite. */
	MICRO: {
		provider: 'bedrock',
		modelId: 'us.amazon.nova-lite-v1:0',
	},
} as const satisfies Record<string, ModelConfig>;

/**
 * Pre-configured Ollama model presets for local development.
 * These are convenience shortcuts that use the `openai-api` provider under the hood.
 *
 * **Requirements:**
 * - Ollama must be installed and running (`ollama serve`)
 * - The model must be pulled first (`ollama pull <modelId>`)
 * - Assumes the default Ollama endpoint: `http://localhost:11434/v1`
 *
 * If your Ollama runs on a different port or host, use the `openai-api` provider directly:
 * ```ts
 * { provider: 'openai-api', modelId: 'llama3.1:8b', endpoint: 'http://custom-host:11434/v1', apiKey: 'ollama' }
 * ```
 */
export const OllamaModels = {
	/** Fast and lightweight for quick iteration. Currently: Llama 3.2 3B (~2 GB, needs 4 GB VRAM). */
	XSMALL: {
		provider: 'openai-api',
		modelId: 'llama3.2:3b',
		endpoint: 'http://localhost:11434/v1',
		apiKey: 'ollama',
	},
	/** Good balance of speed and capability. Currently: Llama 3.1 8B (~4.7 GB, needs 8 GB VRAM). */
	SMALL: {
		provider: 'openai-api',
		modelId: 'llama3.1:8b',
		endpoint: 'http://localhost:11434/v1',
		apiKey: 'ollama',
	},
	/** Strong reasoning at moderate size. Currently: DeepSeek R1 14B (~9 GB, needs 16 GB VRAM). */
	MEDIUM: {
		provider: 'openai-api',
		modelId: 'deepseek-r1:14b',
		endpoint: 'http://localhost:11434/v1',
		apiKey: 'ollama',
	},
	/** High quality for complex tasks. Currently: Llama 3.3 70B (~43 GB, needs 48 GB+ VRAM). */
	LARGE: {
		provider: 'openai-api',
		modelId: 'llama3.3:70b',
		endpoint: 'http://localhost:11434/v1',
		apiKey: 'ollama',
	},
	/** Largest local model. Currently: Llama 4 Scout (~67 GB, needs 80 GB+ VRAM). */
	XLARGE: {
		provider: 'openai-api',
		modelId: 'llama4:16x17b',
		endpoint: 'http://localhost:11434/v1',
		apiKey: 'ollama',
	},
} as const satisfies Record<string, ModelConfig>;
