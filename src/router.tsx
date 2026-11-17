import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const supportsNavigationMotion = typeof window !== 'undefined' && window.CSS?.supports('selector(:active-view-transition-type(navigation))')
  return createRouter({
    routeTree,
    defaultViewTransition: supportsNavigationMotion ? {
      types: ({ fromLocation, pathChanged }) => fromLocation && pathChanged && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? ['navigation'] : false,
    } : false,
  })
}
