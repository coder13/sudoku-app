import type { ReactNode } from 'react'
import type { LatinKropki } from '../latin/kropki'

export type LatinKropkiDot = {
  relation: 'consecutive' | 'ratioTwo' | 'difference' | 'ratio'
  value?: number
  side: 'right' | 'bottom' | 'left' | 'top'
  otherCell: number
  edgeOffset: number
  edgeKey: string
  anchor?: boolean
}

export function latinKropkiDotsByCell(kropki: LatinKropki | undefined, size: number, avoidLeadingCageLabel = false) {
  const dots = new Map<number, LatinKropkiDot[]>()
  const edges = new Map<string, { relation: LatinKropkiDot['relation']; first: number; second: number; value?: number }[]>()
  const add = (relation: LatinKropkiDot['relation'], first: number, second: number, value?: number) => {
    const a = Math.min(first, second)
    const b = Math.max(first, second)
    const key = `${a}:${b}`
    const marks = edges.get(key) ?? []
    marks.push({ relation, first: a, second: b, ...(value !== undefined && { value }) })
    edges.set(key, marks)
  }
  for (const relation of ['consecutive', 'ratioTwo'] as const) {
    for (const [first, second] of (kropki?.[relation]?.pairs ?? [])) add(relation, first, second)
  }
  for (const relation of ['difference', 'ratio'] as const) {
    for (const { cells: [first, second], value } of (kropki?.[relation]?.pairs ?? [])) add(relation, first, second, value)
  }
  for (const layer of kropki?.layers ?? []) {
    if (layer.relation === 'consecutive' || layer.relation === 'ratioTwo') {
      for (const [first, second] of layer.pairs ?? []) add(layer.relation, first, second)
    } else {
      for (const { cells: [first, second], value } of layer.pairs ?? []) add(layer.relation, first, second, value)
    }
  }

  for (const marks of edges.values()) {
    const cell = marks[0]!.first
    const otherCell = marks[0]!.second
    const side = otherCell === cell + 1 ? 'right' : 'bottom'
    const baseOffset = avoidLeadingCageLabel && side === 'bottom' ? .22 : 0
    const step = marks.length > 1 ? Math.min(.28, .36 / (marks.length - 1)) : 0
    marks.forEach(({ relation, value }, index) => {
      // Keep coincident clue families legible along the shared edge.
      const edgeOffset = baseOffset + (index - (marks.length - 1) / 2) * step
      const atCell = dots.get(cell) ?? []
      const edgeKey = `${cell}:${otherCell}`
      atCell.push({ relation, side, otherCell, edgeOffset, edgeKey, anchor: true, ...(value !== undefined && { value }) })
      dots.set(cell, atCell)
      const neighbor = dots.get(otherCell) ?? []
      neighbor.push({ relation, side: side === 'right' ? 'left' : 'top', otherCell: cell, edgeOffset, edgeKey, ...(value !== undefined && { value }) })
      dots.set(otherCell, neighbor)
    })
  }
  return dots
}

export function latinKropkiRuleDescription(kropki: LatinKropki | undefined) {
  const descriptions = new Set<string>()
  const addDescription = (description: string) => descriptions.add(description)
  for (const relation of ['consecutive', 'ratioTwo'] as const) {
    const marks = kropki?.[relation]
    if (!marks) continue
    const relationName = relation === 'consecutive' ? 'consecutive' : 'in a 1:2 ratio'
    const dot = relation === 'consecutive' ? 'white' : 'black'
    if ((marks.pairs?.length ?? 0) > 0) addDescription(`A ${dot} Kropki dot marks neighboring digits that are ${relationName}.`)
    if (marks.negative) addDescription(`Without a ${dot} Kropki dot, neighboring digits are not ${relationName}.`)
  }
  for (const relation of ['difference', 'ratio'] as const) {
    const marks = kropki?.[relation]
    if (!marks) continue
    const values = [...new Set((marks.pairs ?? []).map(mark => mark.value))]
    if (values.length) addDescription(`A numbered ${relation === 'difference' ? 'Difference' : 'Ratio'} mark requires neighboring digits ${relation === 'difference'
      ? `to differ by exactly ${values.join(' or ')}` : `to be in ${values.map(value => `1:${value}`).join(' or ')} ratio${values.length > 1 ? 's' : ''}`}.`)
    if (marks.negative) addDescription(`Without a ${relation === 'difference' ? 'white' : 'black'} dot, neighboring digits ${relation === 'difference'
      ? 'cannot differ by 1' : 'cannot be in a 1:2 ratio'}.`)
  }
  for (const layer of kropki?.layers ?? []) {
    if (layer.relation === 'consecutive' || layer.relation === 'ratioTwo') {
      const relationName = layer.relation === 'consecutive' ? 'consecutive' : 'in a 1:2 ratio'
      const dot = layer.relation === 'consecutive' ? 'white' : 'black'
      if ((layer.pairs?.length ?? 0) > 0) addDescription(`A ${dot} Kropki dot marks neighboring digits that are ${relationName}.`)
      if (layer.negative) addDescription(`Without a ${dot} Kropki dot, neighboring digits are not ${relationName}.`)
    } else {
      const values = [...new Set((layer.pairs ?? []).map(mark => mark.value))]
      if (values.length) addDescription(`A numbered ${layer.relation === 'difference' ? 'Difference' : 'Ratio'} mark requires neighboring digits ${layer.relation === 'difference'
        ? `to differ by exactly ${values.join(' or ')}` : `to be in ${values.map(value => `1:${value}`).join(' or ')} ratio${values.length > 1 ? 's' : ''}`}.`)
      if (layer.negative) addDescription(`Without a ${layer.relation === 'difference' ? 'white' : 'black'} dot, neighboring digits ${layer.relation === 'difference'
        ? 'cannot differ by 1' : 'cannot be in a 1:2 ratio'}.`)
    }
  }
  return descriptions.size ? [...descriptions].join(' ') : undefined
}

export function LatinKropkiDots({ dots }: { dots: readonly LatinKropkiDot[] }): ReactNode {
  return dots.map(({ relation, value, side, otherCell, edgeOffset, edgeKey }) => {
    const horizontalEdge = side === 'top' || side === 'bottom'
    const x = horizontalEdge ? .5 + edgeOffset : side === 'right' ? 1 : 0
    const y = horizontalEdge ? side === 'bottom' ? 1 : 0 : .5 + edgeOffset
    return <svg key={`${relation}-${value ?? ''}-${side}-${otherCell}`}
      className="number-puzzle-kropki" data-edge-key={edgeKey} data-edge-offset={edgeOffset}
      viewBox="0 0 1 1" aria-hidden="true" focusable="false">
    {value === undefined ? <circle className={`variant-dot ${relation === 'consecutive' ? 'variant-dot-white' : 'variant-dot-black'}`}
      cx={x} cy={y} r=".105" />
      : <g className="number-puzzle-kropki-number">
        <circle cx={x} cy={y} r=".15" />
        <text x={x} y={y}>{value}</text>
      </g>}
    </svg>
  })
}

export function latinKropkiClueLabel({ relation, value, side }: LatinKropkiDot) {
  if (relation === 'consecutive') return `White dot on the ${side} edge requires consecutive digits`
  if (relation === 'ratioTwo') return `Black dot on the ${side} edge requires digits in a 1:2 ratio`
  return `${relation === 'difference' ? `Difference ${value}` : `Ratio 1:${value}`} on the ${side} edge requires ${relation === 'difference' ? `digits separated by ${value}` : `digits in a 1:${value} ratio`}`
}
