import * as cdk from 'aws-cdk-lib';
import { CORE_VERSION } from '../version.js';

/**
 * Adds AWS Blocks identification metadata and a deployment-type tag to a CloudFormation stack.
 *
 * Sets `AWS::Blocks::Platform` template metadata with the current core version
 * and applies a `blocks:deployment-type` tag (`sandbox` or `production`) based on
 * the CDK context key `sandboxMode`.
 *
 * @param stack - The CDK stack to annotate.
 */
export function addBlocksStackMetadata(stack: cdk.Stack): void {
  stack.templateOptions.metadata = {
    ...stack.templateOptions.metadata,
    'AWS::Blocks::Platform': {
      version: CORE_VERSION,
    },
  };

  const isSandbox =
    stack.node.tryGetContext('sandboxMode') === 'true' ||
    stack.node.tryGetContext('sandboxMode') === true;

  cdk.Tags.of(stack).add(
    'blocks:deployment-type',
    isSandbox ? 'sandbox' : 'production',
  );
}
