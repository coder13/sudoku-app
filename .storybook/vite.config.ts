import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The preview uses the real browser engine without mounting TanStack Start's server or writing app saves.
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: [
      { find: /^\.\.\/(?:\.\.\/)?sudoku\/storage(?:\.ts)?$/, replacement: fileURLToPath(new URL('../stories/support/story-room.ts', import.meta.url)) },
      { find: /^\.\.\/sudoku\/preferences(?:\.ts)?$/, replacement: fileURLToPath(new URL('../stories/support/story-preferences.ts', import.meta.url)) },
      { find: /^\.\/(?:solver-profile|hint-preferences)(?:\.ts)?$/, replacement: fileURLToPath(new URL('../stories/support/story-profile.ts', import.meta.url)) },
    ],
  },
})
