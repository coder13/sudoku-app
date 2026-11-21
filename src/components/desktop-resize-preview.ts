export function rememberInlineStyles(element: HTMLElement, names: string[]) {
  const properties = names.map(name => ({
    name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name),
  }))
  return () => {
    for (const { name, value, priority } of properties) {
      if (value) element.style.setProperty(name, value, priority)
      else element.style.removeProperty(name)
    }
  }
}

// Keep the dense cell/annotation surface fixed while the frame, coordinate
// guides, outside-clue gutters, mode badge and input panel use their real sizes.
export function previewDesktopBoards(workspace: HTMLElement) {
  const boards = [...workspace.querySelectorAll<HTMLElement>('.standard-puzzle-stack .board-grid-surface')]
    .flatMap(surface => {
      const body = surface.parentElement
      const grid = surface.querySelector<HTMLElement>(':scope > .sudoku-grid')
      if (!body?.classList.contains('board-body') || !grid) return []
      const style = getComputedStyle(surface)
      const width = parseFloat(style.width), height = parseFloat(style.height)
      if (!(width > 0 && height > 0)) return []
      const metric = body.querySelector<HTMLElement>(':scope > .board-resize-font-metric')
      return [{
        body, surface, width, height, metric,
        restoreBody: rememberInlineStyles(body, ['aspect-ratio']),
        restoreSurface: rememberInlineStyles(surface, ['position', 'inset', 'width', 'height', 'scale', 'transform-origin', 'will-change']),
        glyphStyles: new Map<HTMLElement, () => void>(),
      }]
    })
  let active = true
  const observer = new ResizeObserver(entries => {
    if (!active) return
    for (const entry of entries) {
      const board = boards.find(board => board.body === entry.target)
      if (!board || !board.surface.isConnected) continue
      const x = entry.contentRect.width / board.width
      const y = entry.contentRect.height / board.height
      if (!(x > 0 && y > 0)) continue
      const glyphs = board.surface.querySelectorAll<HTMLElement>('.cell-value')
      // Pen digits have minimum and maximum font sizes. Read one live metric,
      // then compensate those few glyphs without laying out all the candidates.
      const fontRatio = glyphs.length && board.metric
        ? parseFloat(getComputedStyle(board.metric).fontSize) / parseFloat(getComputedStyle(glyphs[0]).fontSize) : 1
      board.surface.style.scale = `${x} ${y}`
      if (Number.isFinite(fontRatio)) for (const glyph of glyphs) {
        if (!board.glyphStyles.has(glyph)) board.glyphStyles.set(glyph, rememberInlineStyles(glyph, ['scale']))
        glyph.style.scale = `${fontRatio / x} ${fontRatio / y}`
      }
    }
  })
  // All geometry reads precede writes, including when more than one board is visible.
  for (const { body, surface, width, height } of boards) {
    body.style.aspectRatio = `${width} / ${height}`
    surface.style.position = 'absolute'
    surface.style.inset = '0'
    surface.style.width = `${width}px`
    surface.style.height = `${height}px`
    surface.style.transformOrigin = 'top left'
    surface.style.willChange = 'scale'
    observer.observe(body)
  }
  return () => {
    active = false
    observer.disconnect()
    for (const board of boards) {
      for (const restore of board.glyphStyles.values()) restore()
      board.restoreBody()
      board.restoreSurface()
    }
  }
}
