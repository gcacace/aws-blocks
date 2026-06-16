import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { addBlocksStackMetadata } from './stack-metadata.js';
import { CORE_VERSION } from '../version.js';

describe('addBlocksStackMetadata', () => {
  test('adds AWS::Blocks::Platform metadata with correct version', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    addBlocksStackMetadata(stack);

    const template = Template.fromStack(stack);
    const metadata = template.toJSON().Metadata;
    assert.deepStrictEqual(metadata['AWS::Blocks::Platform'], {
      version: CORE_VERSION,
    });
  });

  test('preserves existing template metadata', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'ExistingMetaStack');
    stack.templateOptions.metadata = {
      'Custom::Existing': { key: 'value' },
    };

    addBlocksStackMetadata(stack);

    const template = Template.fromStack(stack);
    const metadata = template.toJSON().Metadata;
    assert.deepStrictEqual(metadata['Custom::Existing'], { key: 'value' });
    assert.deepStrictEqual(metadata['AWS::Blocks::Platform'], {
      version: CORE_VERSION,
    });
  });

  test('tags deployment-type as production when sandboxMode context is absent', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'ProdStack');

    addBlocksStackMetadata(stack);

    const assembly = app.synth();
    const stackArtifact = assembly.getStackByName(stack.stackName);
    assert.strictEqual(stackArtifact.tags['blocks:deployment-type'], 'production');
  });

  test('tags deployment-type as sandbox when sandboxMode context is boolean true', () => {
    const app = new cdk.App({ context: { sandboxMode: true } });
    const stack = new cdk.Stack(app, 'SandboxBoolStack');

    addBlocksStackMetadata(stack);

    const assembly = app.synth();
    const stackArtifact = assembly.getStackByName(stack.stackName);
    assert.strictEqual(stackArtifact.tags['blocks:deployment-type'], 'sandbox');
  });

  test('tags deployment-type as sandbox when sandboxMode context is string "true"', () => {
    const app = new cdk.App({ context: { sandboxMode: 'true' } });
    const stack = new cdk.Stack(app, 'SandboxStringStack');

    addBlocksStackMetadata(stack);

    const assembly = app.synth();
    const stackArtifact = assembly.getStackByName(stack.stackName);
    assert.strictEqual(stackArtifact.tags['blocks:deployment-type'], 'sandbox');
  });
});
