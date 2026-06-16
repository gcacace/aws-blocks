#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * CLI entry point for the vendorize command.
 *
 * Usage: blocks-vendorize <package-name> [--force]
 * Example: blocks-vendorize @aws-blocks/bb-kv-store
 */
import { vendorize } from './vendorize/index.js';
import { trackCommand } from '@aws-blocks/core/scripts';

const args = process.argv.slice(2);
const force = args.includes('--force');
const packageName = args.find(a => !a.startsWith('--'));

if (!packageName) {
  console.error('Usage: blocks-vendorize <package-name> [--force]');
  console.error('Example: blocks-vendorize @aws-blocks/bb-kv-store');
  process.exit(1);
}

trackCommand('vendorize', async () => {
  vendorize(packageName, { force });
});
