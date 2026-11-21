export function rememberInlineStyles(element: HTMLElement, names: string[]) {
  const hadStyle = element.hasAttribute('style')
  const properties = names.map(name => ({
    name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name),
  }))
  return () => {
    for (const { name, value, priority } of properties) {
      if (value) element.style.setProperty(name, value, priority)
      else element.style.removeProperty(name)
    }
    // Flush lazy CSSOM serialization before removing an originally absent
    // attribute, so a later attribute read cannot recreate an empty one.
    if (!hadStyle && !element.style.length && element.hasAttribute('style')) element.removeAttribute('style')
  }
}

const CANDIDATE_PREVIEW_ATTRIBUTE = 'data-desktop-candidate-preview'

// Keep the nine notes in each cell fixed while the board, borders, pen digits,
// center notes and clues use their real sizes. The live cell supplies the exact
// space inside its borders, including the wider box and jigsaw boundaries.
export function previewDesktopBoards(workspace: HTMLElement) {
  const boards = [...workspace.querySelectorAll<HTMLElement>('.standard-puzzle-stack .puzzle .board-body')]
    // Marked candidates can paint above a link outside their parent. A group
    // transform creates a stacking context, so these boards stay fully live.
    .filter(body => !body.querySelector('.board-links'))
  const groups = boards.flatMap(body => [...body.querySelectorAll<HTMLElement>('.candidate-marks')]
    .flatMap(group => {
      const cell = group.parentElement
      const firstCandidate = group.firstElementChild
      if (!cell?.classList.contains('cell') || !firstCandidate) return []
      const style = getComputedStyle(group)
      if (style.containerType !== 'size') return []
      const cellStyle = getComputedStyle(cell)
      const paddingX = parseFloat(cellStyle.paddingLeft) + parseFloat(cellStyle.paddingRight)
      const paddingY = parseFloat(cellStyle.paddingTop) + parseFloat(cellStyle.paddingBottom)
      const cellWidth = parseFloat(cellStyle.width) + (cellStyle.boxSizing === 'border-box'
        ? -parseFloat(cellStyle.borderLeftWidth) - parseFloat(cellStyle.borderRightWidth) : paddingX)
      const cellHeight = parseFloat(cellStyle.height) + (cellStyle.boxSizing === 'border-box'
        ? -parseFloat(cellStyle.borderTopWidth) - parseFloat(cellStyle.borderBottomWidth) : paddingY)
      const width = parseFloat(style.width), height = parseFloat(style.height)
      const fontSize = parseFloat(getComputedStyle(firstCandidate).fontSize)
      if (![cellWidth, cellHeight, width, height, fontSize].every(value => Number.isFinite(value) && value > 0)) return []
      const fraction = (value: string, length: number) => parseFloat(value) / (value.endsWith('%') ? 100 : length)
      const left = fraction(style.left, cellWidth), right = fraction(style.right, cellWidth)
      const top = fraction(style.top, cellHeight), bottom = fraction(style.bottom, cellHeight)
      if (![left, right, top, bottom].every(Number.isFinite) || left + right >= 1 || top + bottom >= 1) return []
      const attribute = group.getAttribute(CANDIDATE_PREVIEW_ATTRIBUTE)
      const restoreStyle = rememberInlineStyles(group, [
        'position', 'top', 'right', 'bottom', 'left', 'width', 'height', 'font-size',
        'container-type', '--candidate-shape-size', 'translate', 'scale', 'transform-origin', 'will-change',
      ])
      let restored = false
      return [{
        body, group, cell, width, height, cellWidth, cellHeight, paddingX, paddingY,
        left, right, top, bottom, fontSize,
        restore() {
          if (restored) return
          restored = true
          restoreStyle()
          if (attribute === null) group.removeAttribute(CANDIDATE_PREVIEW_ATTRIBUTE)
          else group.setAttribute(CANDIDATE_PREVIEW_ATTRIBUTE, attribute)
        },
      }]
    }))
  const cells = new Map(groups.map(group => [group.cell, group]))
  let active = true
  const observer = new ResizeObserver(entries => {
    if (!active) return
    // A hint can add a link while a drag is in progress. Return that board to
    // native rendering instead of changing the order of its marks and links.
    for (const body of boards) {
      if (!body.querySelector('.board-links')) continue
      for (const group of groups) {
        if (group.body !== body || !cells.delete(group.cell)) continue
        observer.unobserve(group.cell)
        group.restore()
      }
    }
    for (const entry of entries) {
      const preview = cells.get(entry.target as HTMLElement)
      if (!preview || !preview.group.isConnected) continue
      const width = entry.contentRect.width + preview.paddingX
      const height = entry.contentRect.height + preview.paddingY
      const x = width * (1 - preview.left - preview.right) / preview.width
      const y = height * (1 - preview.top - preview.bottom) / preview.height
      if (!(x > 0 && y > 0)) continue
      preview.group.style.translate = `${width * preview.left}px ${height * preview.top}px`
      preview.group.style.scale = `${x} ${y}`
    }
  })
  // Read all groups before freezing any of them. New groups that arrive during
  // the gesture stay native; new notes in an existing group inherit its size.
  for (const preview of groups) {
    const { group, cell, width, height, fontSize } = preview
    group.setAttribute(CANDIDATE_PREVIEW_ATTRIBUTE, '')
    group.style.position = 'absolute'
    group.style.top = '0'
    group.style.left = '0'
    group.style.right = 'auto'
    group.style.bottom = 'auto'
    group.style.width = `${width}px`
    group.style.height = `${height}px`
    group.style.fontSize = `${fontSize}px`
    group.style.containerType = 'normal'
    group.style.setProperty('--candidate-shape-size', `min(1.35em, ${Math.min(width, height) / 3}px)`)
    group.style.translate = `${preview.cellWidth * preview.left}px ${preview.cellHeight * preview.top}px`
    group.style.scale = '1 1'
    group.style.transformOrigin = 'top left'
    group.style.willChange = 'scale, translate'
    observer.observe(cell)
  }
  return () => {
    active = false
    observer.disconnect()
    for (const group of groups) group.restore()
  }
}
