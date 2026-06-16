// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Typed error constants for Dashboard. Use with `isBlocksError()` in catch blocks.
 *
 * @example
 * ```typescript
 * import { isBlocksError } from '@aws-blocks/core';
 * import { DashboardErrors } from '@aws-blocks/bb-dashboard';
 *
 * try {
 *   new Dashboard(scope, 'dash', {
 *     metricConfigs: [{ name: '', stat: 'Sum' }] // empty name triggers validation
 *   });
 * } catch (e) {
 *   if (isBlocksError(e, DashboardErrors.InvalidMetricConfig)) {
 *     console.error('Metric name cannot be empty');
 *   }
 * }
 * ```
 */
export const DashboardErrors = {
	InvalidMetricConfig: 'InvalidMetricConfigException',
} as const;
