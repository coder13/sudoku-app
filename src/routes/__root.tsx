import type { ReactNode } from 'react'
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import '@fontsource-variable/dm-sans/wght.css'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#f6f5fa' },
      { name: 'description', content: 'Play, create and share classic Sudoku puzzles.' },
      { title: 'Sudoku' },
    ],
    links: [
      { rel: 'icon', href: '/icon-192.png', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/icon-192.png' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  )
}
