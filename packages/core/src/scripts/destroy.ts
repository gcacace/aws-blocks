// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import { trackCommand } from '../telemetry/trackCommand.js';
import { getCdkTelemetryEnv } from './cdk-telemetry-env.js';

export interface DestroyOptions {
  cdkAppPath: string;
  projectRoot: string;
}

export async function destroy(options: DestroyOptions) {
  return trackCommand('destroy', async () => {
    console.log('🗑️  Destroying production stack...');

    try {
      execFileSync(
        "npx",
        [
          "cdk", "destroy",
          "--force",
          "--context", `projectRoot=${options.projectRoot}`,
        ],
        {
          stdio: 'inherit',
          cwd: options.projectRoot,
          env: {
            ...process.env,
            NODE_OPTIONS: '--conditions=cdk',
            ...getCdkTelemetryEnv('production')
          }
        }
      );
    } catch (error) {
      console.error('\n❌ Destroy failed.');
      throw error;
    }

    console.log('\n✅ Production stack destroyed!');
  });
}
