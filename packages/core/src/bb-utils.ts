// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Utilities for Building Block authors.
 *
 * Used by standard BBs and available to customers writing custom Building Blocks.
 * Not part of the main '.' export — import from '@aws-blocks/core/bb-utils'.
 */
export { getMockDataDir } from './common/mock-data.js';
export { API_NAMESPACE_MARKER } from './api.js';
export { EventSourceMapping } from './lambda-handler.js';
export { constantTimeEquals } from './common/crypto.js';
