import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const settingsPath = /^\/settings(?:\/|$)/

export function getRouter() {
  const supportsNavigationMotion = typeof window !== 'undefined' && window.CSS?.supports('selector(:active-view-transition-type(navigation))')
  return createRouter({
    routeTree,
    defaultViewTransition: supportsNavigationMotion ? {
      types: ({ fromLocation, toLocation, pathChanged }) => {
        if (!fromLocation || !pathChanged || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
        // Keep the live modal backdrop in place between settings sections.
        if (settingsPath.test(fromLocation.pathname) && settingsPath.test(toLocation.pathname)) return false
        return ['navigation']
      },
    } : false,
  })
}
