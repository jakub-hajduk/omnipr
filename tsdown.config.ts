import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: './src/index.ts',
    omnipr: './src/omnipr.ts',
    github: './src/providers/github.ts',
    gitlab: './src/providers/gitlab.ts',
    bitbucket: './src/providers/bitbucket.ts',
  },
  format: ['esm', 'cjs'],
  exports: true,
  dts: true,
});
