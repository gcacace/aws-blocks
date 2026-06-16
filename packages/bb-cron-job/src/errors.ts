// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Error name constants for CronJob operations.
 */
export const CronJobErrors = {
	/** Thrown when the schedule expression is not a valid cron or rate format. */
	InvalidSchedule: 'InvalidScheduleExpression',
	/** Thrown when the timezone string is not a valid IANA timezone. */
	InvalidTimezone: 'InvalidTimezoneExpression',
} as const;
