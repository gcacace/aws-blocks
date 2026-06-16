// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/** Generate the vendorized package.json with exports remapped from dist/ to src/. */
export function generatePackageJson(original: any): object {
  const pkg: any = {
    name: original.name,
    version: original.version,
    type: 'module',
    private: true,
    exports: remapExports(original.exports),
  };
  if (original.dependencies) pkg.dependencies = original.dependencies;
  if (original.peerDependencies) pkg.peerDependencies = original.peerDependencies;
  return pkg;
}

/** Generate a tsconfig for building the vendorized source. */
export function generateTsconfig(): object {
  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ['src/**/*'],
  };
}

function remapExports(exports: any): any {
  if (!exports) return exports;
  if (typeof exports === 'string') return remapPath(exports);
  if (Array.isArray(exports)) return exports.map(remapExports);

  const result: any = {};
  for (const [key, value] of Object.entries(exports)) {
    if (typeof value === 'string') {
      result[key] = remapPath(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = remapExports(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function remapPath(p: string): string {
  if (p.startsWith('./dist/')) {
    const rest = p.slice('./dist/'.length);
    return `./src/${rest.replace(/\.d\.ts$/, '.ts').replace(/\.js$/, '.ts')}`;
  }
  return p;
}
