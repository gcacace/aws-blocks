// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Mixin } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';
import type { IMixin } from 'constructs';

/**
 * Disables deletion protection on any construct that has a `deletionProtection`
 * property (e.g. RDS clusters, RDS instances). Uses duck-typing so it
 * automatically covers current and future resource types.
 *
 * Intended for sandbox teardown — use in the CDK layer alongside
 * `RemovalPolicies.of(stack).destroy()` to ensure `sandbox:destroy` can
 * delete the entire stack without manual cleanup.
 *
 * @example
 * ```ts
 * import { RemovalPolicies, Mixins } from 'aws-cdk-lib';
 * import { SandboxDisableDeletionProtection } from '@aws-blocks/blocks/cdk';
 *
 * if (sandboxMode) {
 *   RemovalPolicies.of(stack).destroy();
 *   Mixins.of(stack).apply(new SandboxDisableDeletionProtection());
 * }
 * ```
 */
export class SandboxDisableDeletionProtection extends Mixin implements IMixin {
  supports(construct: any): boolean {
    return 'deletionProtection' in construct;
  }
  applyTo(node: IConstruct): void {
    // Only flip explicitly-enabled protection. When undefined (the default),
    // deletion protection is already off — setting it to false would emit the
    // property in the CloudFormation template, which breaks Aurora DB instances
    // (RDS rejects DeletionProtection on cluster members).
    if ((node as any).deletionProtection === true) {
      (node as any).deletionProtection = false;
    }
  }
}
