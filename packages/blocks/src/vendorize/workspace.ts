// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJson } from './fs.js';

/** Add a workspace entry to the project's package.json. */
export function addToWorkspaces(projectRoot: string, workspacePath: string): void {
  const pkgPath = join(projectRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  if (!pkg.workspaces) pkg.workspaces = [];
  if (!pkg.workspaces.includes(workspacePath)) {
    pkg.workspaces.push(workspacePath);
    writeJson(pkgPath, pkg);
  }
}
