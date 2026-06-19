// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export { OtelMetrics, OtelMetricsErrors } from './index.aws.js';
export type {
	OtelMetricsOptions,
	EmitOptions,
	MetricDatum,
	MetricUnit,
	OtelMetricsEmitter,
	Counter,
	Histogram,
	UpDownCounter,
	ObservableGauge,
	Meter,
} from './types.js';
