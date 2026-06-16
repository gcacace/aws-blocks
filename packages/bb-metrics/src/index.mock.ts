// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Mock (local development) runtime for Metrics.
 *
 * Behavior is identical to the AWS runtime — both write EMF-formatted JSON to
 * stdout. In local dev the output is visible in the terminal; in Lambda it is
 * captured by CloudWatch Logs. No separate mock implementation is needed.
 */
export { Metrics, MetricsErrors } from './index.aws.js';
export type {
	MetricsOptions,
	EmitOptions,
	MetricDatum,
	MetricUnit,
	MetricResolution,
	ExternalMetricsRef,
	MetricsEmitter,
} from './types.js';
