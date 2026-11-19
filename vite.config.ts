import { readFileSync, realpathSync } from 'node:fs'
import type { ClientRequest, IncomingMessage } from 'node:http'
import { defineConfig, type ProxyOptions } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { ocrAssetFileNames } from './scripts/ocr-assets.ts'
import { calcudokuCatalog } from './src/calcudoku/catalog.ts'
import { kakuroCatalog } from './src/kakuro/catalog.ts'
import { isDifficulty } from './src/sudoku/difficulty.ts'
import { syncPageTitles } from './src/sudoku/sync-pages.ts'
import { PRODUCTION_SYNC_ORIGIN } from './src/sudoku/pairing-link.ts'
import { lessonCatalog, type LearnContent } from './src/sudoku/lesson-content.ts'

const productionDevHost = '127.0.0.1'
const productionDevPort = 8768
const productionDevAuthorities = new Set([productionDevHost, 'localhost'].map(host => `${host}:${productionDevPort}`))
const productionSyncProxy: ProxyOptions = {
  target: PRODUCTION_SYNC_ORIGIN,
  changeOrigin: true,
  ws: true,
  bypass(request) {
    // Preserve the upstream origin check for browser writes from the local UI.
    const { host, origin } = request.headers
    const read = request.method === 'GET' || request.method === 'HEAD'
    if (!host || !productionDevAuthorities.has(host) || (origin ? origin !== 'http://' + host : !read)) return false
  },
  configure(proxy) {
    function prepare(outgoing: ClientRequest, request: IncomingMessage) {
      if (request.headers.origin) outgoing.setHeader('Origin', PRODUCTION_SYNC_ORIGIN)
      outgoing.removeHeader('cookie')
    }
    proxy.on('proxyReq', prepare)
    proxy.on('proxyReqWs', prepare)
    proxy.on('proxyRes', (incoming) => { delete incoming.headers['set-cookie'] })
  },
}

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
  const missing = Object.keys(lessonDifficulties).filter((technique) => !lessonRoutes.has(technique))
  if (missing.length) throw new Error(`Add Learn articles for these hint techniques: ${missing.join(', ')}`)
  for (const lesson of lessons) {
    const drills = lesson.blocks.flatMap((block) => block.type === 'practice' ? block.drills : [])
    const conceptPractice = lesson.kind === 'foundation' && lesson.blocks.some((block) =>
      block.type === 'concept-check' && block.questions.length >= 2)
    if ((!drills.length && !conceptPractice) || drills.some(({ example }) => !isDifficulty(lessonDifficulties[example]))) {
      throw new Error(`Each lesson needs rated puzzle practice or foundation questions. Check ${lesson.id}.`)
    }
  }
  return [
    '/',
    '/puzzles',
    '/import',
    '/sync',
    ...Object.keys(syncPageTitles).map(step => '/sync/' + step),
    '/shortcuts',
    '/puzzles/browse',
    '/puzzles/new',
    '/puzzles/new/difficulty',
    '/puzzles/games',
    '/puzzles/calcudoku',
    '/puzzles/calcudoku/generated',
    ...calcudokuCatalog.map(({ id }) => `/puzzles/calcudoku/${id}`),
    '/puzzles/kakuro',
    '/puzzles/kakuro/generated',
    ...kakuroCatalog.map(({ id }) => `/puzzles/kakuro/${id}`),
    '/puzzles/solved',
    '/puzzles/collections',
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

export default defineConfig(({ command, mode, isPreview }) => {
  const productionSync = command === 'serve' && !isPreview && mode === 'prod-sync'
  return {
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
    cacheDir: productionSync ? 'node_modules/.vite-prod-sync' : undefined,
    define: { 'import.meta.env.SUDOKU_PRODUCTION_SYNC': JSON.stringify(productionSync) },
    server: {
      host: productionSync ? productionDevHost : '0.0.0.0',
      port: productionSync ? productionDevPort : 8766,
      proxy: {
        // Preserve the browser's Host so the local Worker can verify the request origin.
        [productionSync ? '/api/v1/' : '/api/v1']: productionSync
          ? productionSyncProxy
          : { target: 'http://127.0.0.1:8788', changeOrigin: false, ws: true },
      },
      strictPort: true,
      fs: { allow: [process.cwd(), realpathSync('node_modules')] },
      allowedHosts: ['twilight'],
    },
    build: { assetsInlineLimit: 0, rolldownOptions: { output: { assetFileNames: ocrAssetFileNames } } },
  }
})
