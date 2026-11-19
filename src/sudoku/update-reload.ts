const key = 'sudoku-app:offline-update-reload'

export function markUpdateReload(href: string, storage?: Pick<Storage, 'setItem'>) {
  try { (storage ?? sessionStorage).setItem(key, href) }
  catch { /* The update can still load when session storage is unavailable. */ }
}

export function consumeUpdateReload(href: string, storage?: Pick<Storage, 'getItem' | 'removeItem'>) {
  try {
    const tab = storage ?? sessionStorage
    const update = tab.getItem(key)
    tab.removeItem(key)
    return update === href
  } catch { return false }
}
