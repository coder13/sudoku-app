import type { BoardGroup } from '../../../src/components/BoardAnnotations'
import { boardGroupKey, boardGroupOutline, boardPointCandidates } from '../../../src/sudoku/board-link-geometry'
import { cloneLayout } from '../../../src/sudoku/clone'
import type { BoardProps } from './fixtures'

function requireMatch(actual: unknown, expected: unknown, name: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Grouped Board ${name}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`)
  }
}

/** Check new group behavior before excluding its additions from historical DOM parity. */
export function checkedGroupAdditions(root: HTMLElement, props: BoardProps) {
  const ignored = new Set<Element>()
  const pressed = new Map<Element, string>()
  const expected = new Map<string, BoardGroup>()
  for (const link of props.annotations?.links ?? []) {
    for (const point of [link.from, link.to]) {
      const key = boardGroupKey(point)
      if (!key) continue
      const previous = expected.get(key)
      if (!previous || (link.opacity ?? 1) > (previous.opacity ?? 1)) {
        expected.set(key, { point, color: link.color, opacity: link.opacity })
      }
    }
  }
  for (const group of props.annotations?.groups ?? []) {
    const key = boardGroupKey(group.point)
    if (key) expected.set(key, group)
  }
  const insets: Map<number, { top: number; bottom: number }> = new Map()
  for (const set of cloneLayout(props.variantPuzzle?.rules).sets) {
    for (const cell of set.cells) insets.set(cell, { top: .07, bottom: .28 })
  }
  const cages = (props.variantPuzzle?.rules ?? props.sizedRules)?.flatMap(rule => rule.type === 'killer-cages' ? rule.cages : []) ?? []
  for (const cage of [...cages, ...(props.algebraicCages ?? [])]) {
    const cell = Math.min(...cage.cells)
    insets.set(cell, { top: .3, bottom: insets.get(cell)?.bottom ?? .07 })
  }
  const describe = (group: BoardGroup) => boardPointCandidates(group.point)
    .map(({ cell, digit }) => `${digit} in row ${Math.floor(cell / 9) + 1}, column ${cell % 9 + 1}`).join(' or ')
  const outlines = [...root.querySelectorAll<SVGElement>('.board-chain-group')]
    .filter(element => !element.closest('[data-board-fade="exit"]'))
  requireMatch(outlines.map(element => element.getAttribute('data-chain-group')), [...expected.keys()], 'group identities')
  for (const [index, [key, group]] of [...expected].entries()) {
    const element = outlines[index]
    const attributes = Object.fromEntries([...element.attributes].filter(attribute => attribute.name !== 'data-board-fade')
      .map(attribute => [attribute.name, attribute.value]).sort(([a], [b]) => a.localeCompare(b)))
    const expectedAttributes = Object.fromEntries(Object.entries({ class: 'board-chain-group', 'data-chain-group': key,
      ...(group.opacity === undefined ? {} : { opacity: String(group.opacity) }) }).sort(([a], [b]) => a.localeCompare(b)))
    requireMatch(attributes, expectedAttributes, `group ${key} attributes`)
    requireMatch([...element.children].map(child => child.tagName.toLowerCase()), ['title', 'polygon'], `group ${key} elements`)
    requireMatch(element.children[0].textContent, group.label ?? `Candidate group: ${describe(group)}`, `group ${key} label`)
    const polygon = element.children[1]
    const polygonAttributes = Object.fromEntries([...polygon.attributes].map(attribute => [attribute.name, attribute.value])
      .sort(([a], [b]) => a.localeCompare(b)))
    const expectedPolygon = Object.fromEntries(Object.entries({
      points: boardGroupOutline(group.point, insets).map(({ x, y }) => `${x},${y}`).join(' '),
      fill: group.color, 'fill-opacity': '.07', stroke: group.color, 'stroke-width': '.3', 'stroke-linejoin': 'round',
    }).sort(([a], [b]) => a.localeCompare(b)))
    requireMatch(polygonAttributes, expectedPolygon, `group ${key} outline`)
    ignored.add(element)
  }

  const descriptions = [...root.querySelectorAll<HTMLParagraphElement>('.board-frame > p.sr-only')]
  requireMatch(descriptions.length, expected.size ? 1 : 0, 'description count')
  const description = descriptions[0]
  const grid = root.querySelector<HTMLElement>('[role="grid"]')!
  requireMatch(grid.getAttribute('aria-describedby'), [props.descriptionId, description?.id].filter(Boolean).join(' ') || null, 'description reference')
  if (description) {
    if (!description.id) throw new Error('Grouped Board description has no ID.')
    requireMatch([...description.attributes].map(attribute => attribute.name).sort(), ['class', 'id'], 'description attributes')
    requireMatch(description.className, 'sr-only', 'description visibility')
    const references = [...expected.values()].map((group, index) => `${group.label ?? `Group ${index + 1}`}: ${describe(group)}.`)
    requireMatch(description.textContent?.replace(/\s+/g, ' ').trim(),
      `Each candidate group is one chain endpoint. The group is true if at least one member is true. ${references.join(' ')}`,
      'complete group description')
    ignored.add(description)
  }
  // A groups-only overlay has no historical SVG counterpart.
  for (const svg of root.querySelectorAll('svg.board-links')) {
    if (svg.children.length && [...svg.children].every(child => ignored.has(child))) {
      const region = props.region
      requireMatch([...svg.attributes].map(attribute => attribute.name).filter(name => !name.startsWith('data-board-')).sort(), ['aria-hidden', 'class', 'viewBox'], 'group overlay attributes')
      requireMatch(svg.getAttribute('class'), 'board-links', 'group overlay class')
      requireMatch(svg.getAttribute('viewBox'), region
        ? `${region.column * 10} ${region.row * 10} ${region.columns * 10} ${region.rows * 10}` : '0 0 90 90', 'group overlay viewBox')
      requireMatch(svg.getAttribute('aria-hidden'), 'true', 'group overlay accessibility')
      ignored.add(svg)
    }
  }
  if (props.selectedCandidates) {
    for (const button of root.querySelectorAll<HTMLButtonElement>('.candidate-button:not([data-board-fade="exit"])')) {
      const cell = Number(button.closest('[data-cell]')!.getAttribute('data-cell'))
      const digit = Number(button.textContent)
      const single = props.selectedCandidate?.cell === cell && props.selectedCandidate.digit === digit
      const selected = single || props.selectedCandidates.some(candidate => candidate.cell === cell && candidate.digit === digit)
      requireMatch(button.getAttribute('aria-pressed'), props.onCandidate ? String(selected) : null, `selection ${cell}:${digit}`)
      if (props.onCandidate) pressed.set(button, String(single))
    }
  }
  return { ignored, description, grid, pressed }
}
