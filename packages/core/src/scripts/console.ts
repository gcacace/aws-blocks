// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { trackCommand } from '../telemetry/trackCommand.js';

export interface ConsoleOptions {
  stackId?: string;
  outputsFile?: string;
}

export async function openConsole(options: ConsoleOptions) {
  return trackCommand('console', async () => {
    let stackName: string;

    if (options.stackId) {
      stackName = options.stackId;
    } else if (options.outputsFile) {
      const outputs = JSON.parse(readFileSync(options.outputsFile, 'utf-8'));
      stackName = Object.keys(outputs)[0];
    } else {
      throw new Error('Must provide either stackId or outputsFile');
    }

    const region = execFileSync('aws', ['configure', 'get', 'region'], { encoding: 'utf-8' }).trim() || 'us-east-1';
    const stackUrl = `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks?filteringText=${encodeURIComponent(stackName)}`;

    console.log('Opening AWS Console...');
    console.log(stackUrl);

    execFileSync('open', [stackUrl], { stdio: 'inherit' });
  });
}
