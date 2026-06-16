import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { existsSync, readFileSync, mkdirSync, openSync, writeSync, closeSync, writeFileSync, constants } from 'node:fs';
import path from 'node:path';
import { debuglog } from 'node:util';
import { CORE_VERSION } from '../version.js';
import { Scope } from '../common/index.js';
import { isTelemetryEnabled } from './consent.js';
import { collectEnvironment } from './environment.js';
import { getInstallationId, getProjectId, generateEventId } from './identifiers.js';
import type { BlocksTelemetryEvent, BuildAndSendEventOptions } from './types.js';

// Debug log: writes to stderr via NODE_DEBUG=blocks-telemetry (developer-facing, for troubleshooting)
const debug = debuglog('blocks-telemetry');

const DEFAULT_ENDPOINT = 'https://blocks-telemetry.us-east-1.api.aws/metrics';
const TIMEOUT_MS = 500;
const TELEMETRY_VERSION = '1.0.0';

function getEndpoint(): string {
  return process.env.BLOCKS_TELEMETRY_ENDPOINT || DEFAULT_ENDPOINT;
}

/**
 * Parse `--telemetry-file=/path/to/file.json` from process.argv.
 *
 * Supports both `--telemetry-file=path` and `--telemetry-file path` forms.
 *
 * @returns The file path if the flag is present, undefined otherwise.
 *
 * @example
 * // Capture telemetry to file (also sends HTTP when enabled):
 * // npx tsx aws-blocks/scripts/server.ts --telemetry-file=/tmp/events.json
 *
 * // Capture WITHOUT sending (disable HTTP, file still writes):
 * // AWS_BLOCKS_DISABLE_TELEMETRY=1 npx tsx aws-blocks/scripts/server.ts --telemetry-file=/tmp/events.json
 */
export function getTelemetryFilePath(): string | undefined {
  const arg = process.argv.find(a => a.startsWith('--telemetry-file='));
  if (arg) {
    const p = arg.slice('--telemetry-file='.length);
    return p.trim() === '' ? undefined : p;
  }
  const idx = process.argv.indexOf('--telemetry-file');
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('-')) {
    return process.argv[idx + 1];
  }
  return undefined;
}

// File sink: writes to --telemetry-file path (user-facing, for debugging/testing)
function writeToTelemetryFile(event: BlocksTelemetryEvent): void {
  const filePath = getTelemetryFilePath();
  if (!filePath) return;  // getTelemetryFilePath already rejects empty/whitespace

  try {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // O_CREAT | O_EXCL: atomic create — fails with EEXIST if file already exists
    const fd = openSync(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644);
    const content = JSON.stringify([event], null, 2);
    writeSync(fd, content);
    closeSync(fd);
  } catch (err: any) {
    // EEXIST = file already existed → skip (protects user data)
    // All other errors silently ignored — telemetry must never affect commands
  }
}

/**
 * Constructs a telemetry event without sending it.
 * Useful for testing event structure without I/O side effects.
 * @internal
 */
export function buildEvent(opts: BuildAndSendEventOptions): BlocksTelemetryEvent {
  const { blocks, totalCount, customBlocksCount } = Scope.getRegisteredBlocks();

  let templateName: string | undefined = opts.product?.template;
  let templateVersion: string | undefined = opts.product?.templateVersion;
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.blocksTemplate) templateName = templateName || pkg.blocksTemplate;
      if (pkg.blocksTemplateVersion) templateVersion = templateVersion || pkg.blocksTemplateVersion;
    }
  } catch {
    // template info is best-effort
  }

  const buildingBlocks = blocks;

  return {
    telemetryVersion: TELEMETRY_VERSION,
    identifiers: {
      installationId: getInstallationId(),
      projectId: getProjectId(),
      eventId: generateEventId(),
      timestamp: new Date().toISOString(),
    },
    event: {
      command: opts.command,
      state: opts.state,
      duration: opts.duration,
      ...(opts.error && { error: opts.error }),
    },
    environment: collectEnvironment(),
    product: {
      blocksVersion: CORE_VERSION,
      ...(opts.product?.cdkVersion && { cdkVersion: opts.product.cdkVersion }),
      ...(opts.product?.framework && { framework: opts.product.framework }),
      ...(templateName && {
        template: {
          name: templateName,
          ...(templateVersion && { version: templateVersion }),
        },
      }),
      ...(buildingBlocks.length > 0 && { buildingBlocks }),
    },
    ...(opts.counters || totalCount > 0 || customBlocksCount > 0
      ? {
          counters: {
            blocksCount: opts.counters?.blocksCount ?? totalCount,
            ...(opts.counters?.customBuildingBlocks !== undefined
              ? { customBuildingBlocks: opts.counters.customBuildingBlocks }
              : customBlocksCount > 0 ? { customBuildingBlocks: customBlocksCount } : undefined),
          },
        }
      : undefined),
  };
}

/**
 * Build a complete telemetry event and send it to the collection endpoint.
 *
 * This is the single entry point for all telemetry emission. It handles:
 * 1. Early exit — if telemetry is disabled AND no `--telemetry-file` is set,
 *    returns immediately with no side effects (no IDs persisted, no notice)
 * 2. Full payload construction (identifiers, environment, product info)
 * 3. File sink — writes to the file specified by `--telemetry-file` (if set),
 *    regardless of opt-out status (inspired by CDK CLI's --telemetry-file)
 * 4. Privacy filtering — custom BB names are NEVER sent, only counted
 * 5. HTTP sink — fire-and-forget POST (only when telemetry is enabled)
 *
 * The file sink fires unconditionally when `--telemetry-file` is set.
 * The HTTP sink only fires when telemetry is enabled. Callers never need to
 * import consent, identifier, or environment utilities directly.
 *
 * @param opts - Event metadata (command, state, duration, optional error/product/counters)
 *
 * @example
 * ```ts
 * buildAndSendEvent({
 *   command: 'deploy',
 *   state: 'SUCCESS',
 *   duration: 4500,
 *   product: { cdkVersion: '2.150.0' },
 * });
 * ```
 */
export function buildAndSendEvent(opts: BuildAndSendEventOptions): void {
  try {
    const filePath = getTelemetryFilePath();
    const enabled = isTelemetryEnabled();
    if (!filePath && !enabled) return;

    const event = buildEvent(opts);

    if (filePath) writeToTelemetryFile(event);
    if (enabled) sendEvent(event);
  } catch {
    // Telemetry must never throw or affect the user's command
  }
}

/**
 * Send a pre-built telemetry event to the collection endpoint.
 *
 * Fire-and-forget: no retry, 500ms timeout, all errors silently swallowed.
 * Debug output available via `NODE_DEBUG=blocks-telemetry`.
 */
export function sendEvent(event: BlocksTelemetryEvent): void {
  try {
    const endpoint = getEndpoint();
    const payload = JSON.stringify(event);

    // E2E test sink: writes to BLOCKS_TELEMETRY_FILE env path (test-facing, for assertions)
    if (process.env.BLOCKS_TELEMETRY_FILE) {
      try { writeFileSync(process.env.BLOCKS_TELEMETRY_FILE, payload); } catch {}
    }

    debug('sending event to %s (%d bytes)', endpoint, Buffer.byteLength(payload));

    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const req = requestFn(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? '443' : '80'),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        debug('event sent (status=%d)', res.statusCode);
        res.resume();
      },
    );

    req.on('error', (err) => { debug('send failed: %s', err.message); });
    req.on('timeout', () => { debug('send timed out'); req.destroy(); });
    req.write(payload);
    req.end();
  } catch {
    // Telemetry must never throw or affect the user's command
  }
}
