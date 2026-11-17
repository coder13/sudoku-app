import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { isDifficulty } from './src/sudoku/difficulty.ts'
import { lessonCatalog, type LearnContent } from './src/sudoku/lesson-content.ts'

function prerenderPages() {
  const content: LearnContent = JSON.parse(readFileSync(new URL('./src/sudoku/learn-content.json', import.meta.url), 'utf8'))
  const { articles, lessonExampleIds, lessonRoutes, lessons } = lessonCatalog(content)
  const lessonExamples = JSON.parse(readFileSync(new URL('./src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8'))
  const lessonDifficulties = JSON.parse(readFileSync(new URL('./src/sudoku/generated/lesson-difficulties.json', import.meta.url), 'utf8'))
  const lessonIds = new Set(articles.map(({ id }) => id))
  if (lessonIds.size !== articles.length || lessonRoutes.get(content.fundamentals.id) !== content.fundamentals ||
    [...lessonExampleIds].some((id) => !lessonExamples[id]?.practice)) {
    throw new Error('Lesson slugs must be unique and every diagram or practice puzzle needs a verified engine example.')
  }
  for (const lesson of lessons) {
    const drills = lesson.blocks.flatMap((block) => block.type === 'practice' ? block.drills : [])
    if (!drills.length || drills.some(({ example }) => !isDifficulty(lessonDifficulties[example]))) {
      throw new Error(`Every lesson needs a practice variant with an engine difficulty. Check ${lesson.id}.`)
    }
  }
  return [
    '/',
    '/puzzles',
    '/import',
    '/puzzles/browse',
    '/puzzles/new',
    '/puzzles/statistics',
    '/settings',
    '/settings/appearance',
    '/settings/input',
    '/settings/highlighting',
    '/settings/solving',
    '/settings/hints',
    '/learn',
    ...[...lessonRoutes.keys()].map((id) => `/learn/${id}`),
  ].map((path) => ({ path }))
}

export default defineConfig(({ command }) => ({
  plugins: [
    tanstackStart({
      pages: command === 'build' ? prerenderPages() : [],
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
      },
    }),
    react(),
  ],
  server: {
    host: '0.0.0.0',
    port: 8766,
    strictPort: true,
    allowedHosts: ['twilight'],
  },
  build: { assetsInlineLimit: 0 },
}))
