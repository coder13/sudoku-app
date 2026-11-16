import { useSyncExternalStore } from 'react'

// Keep this query in sync with the mobile styles in styles.css.
export const MOBILE_LAYOUT_QUERY = '(max-width: 900px), (max-width: 1440px) and (pointer: coarse)'

function subscribeToMobileLayout(onChange: () => void) {
  const query = window.matchMedia(MOBILE_LAYOUT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useMobileLayout() {
  return useSyncExternalStore(subscribeToMobileLayout, () => window.matchMedia(MOBILE_LAYOUT_QUERY).matches, () => false)
}
