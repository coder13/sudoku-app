import { realpathSync } from 'node:fs'
import type { StorybookConfig } from '@storybook/react-vite'
import { ocrAssetFileNames } from '../scripts/ocr-assets.ts'

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: { builder: { viteConfigPath: '.storybook/vite.config.ts' } },
  },
  stories: ['../stories/Welcome.mdx', '../stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  core: { disableTelemetry: true },
  async viteFinal(config) {
    const { mergeConfig } = await import('vite')
    return mergeConfig(config, {
      server: { fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
      build: { rolldownOptions: { output: { assetFileNames: ocrAssetFileNames } } },
    })
  },
}

export default config
