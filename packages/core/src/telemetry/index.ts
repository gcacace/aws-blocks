export { trackCommand, classifyError } from './trackCommand.js';
export { buildAndSendEvent, buildEvent } from './client.js';
export type { CommandName, CommandState, BuildAndSendEventOptions } from './types.js';
export {
  isTelemetryEnabled,
  getTelemetryStatus,
  getGlobalConfigPath,
  getProjectConfigPath,
  type TelemetryStatus,
} from './consent.js';
export { writeConfigTelemetry } from './config-writer.js';
