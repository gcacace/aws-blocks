// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface TelemetryConfig {
  enabled?: boolean;
  projectId?: string;
  [key: string]: unknown;
}

interface BlocksConfig {
  telemetry?: TelemetryConfig;
  [key: string]: unknown;
}

/**
 * Read an existing config file, merge the telemetry.enabled setting, and write it back.
 * Creates the file and parent directories if they don't exist.
 * Preserves all other keys in the config file and in the telemetry object
 * (e.g., projectId).
 *
 * Config format:
 * ```json
 * { "telemetry": { "enabled": true, "projectId": "..." } }
 * ```
 *
 * @param configPath - Absolute path to the config file
 * @param telemetryEnabled - Whether telemetry should be enabled
 */
export function writeConfigTelemetry(configPath: string, telemetryEnabled: boolean): void {
  let existing: BlocksConfig = {};

  try {
    const content = readFileSync(configPath, 'utf-8');
    existing = JSON.parse(content) as BlocksConfig;
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  const telemetry: TelemetryConfig = (existing.telemetry && typeof existing.telemetry === 'object')
    ? { ...existing.telemetry }
    : {};

  telemetry.enabled = telemetryEnabled;
  existing.telemetry = telemetry;

  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
}
