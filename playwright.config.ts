import { defineConfig } from '@playwright/test'

const port = 61173
const storybookUrl = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/visual',
  timeout: 60_000,
  use: {
    baseURL: storybookUrl,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: `npm run storybook -- --ci --port ${port}`,
    url: `${storybookUrl}/index.json`,
    timeout: 180_000,
  },
})
