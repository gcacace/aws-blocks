// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { writeFileSync } from 'node:fs';

export function writeJson(path: string, data: object): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
