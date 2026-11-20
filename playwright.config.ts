import { defineConfig } from '@playwright/test'

const storybookUrl = 'http://127.0.0.1:6006'

export default defineConfig({
  testDir: './tests/visual',
  use: {
    baseURL: storybookUrl,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'npm run storybook -- --ci',
    url: `${storybookUrl}/index.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
