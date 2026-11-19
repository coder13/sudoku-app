import type { VariantRule } from '../sudoku/engine'
import { Crown } from 'lucide-react'
import { jigsawLayout, variantSeeds } from '../sudoku/variant-generation'
import { regionMembership, WINDOKU_REGIONS, type VariantId } from '../sudoku/variants'
import { VariantClues } from './VariantClues'
import { generationRuleset, type GenerationRulesetId } from '../sudoku/variant-rulesets'

const previews: Record<VariantId, readonly VariantRule[]> = {
  classic: [],
  'killer-cages': [{ type: 'killer-cages', cages: [{ cells: [10, 11, 20], sum: 12 }, { cells: [33, 34, 43, 52], sum: 23 }, { cells: [49, 58, 59], sum: 18 }] }],
  windoku: WINDOKU_REGIONS.map(cells => ({ type: 'extra-house', cells })),
  diagonal: [{ type: 'diagonal', diagonal: 'main' }, { type: 'diagonal', diagonal: 'anti' }],
  jigsaw: [],
  'anti-knight': [],
  'anti-king': [],
  'non-consecutive': [],
  parity: [{ type: 'parity', cells: [20, 48], parity: 'odd' }, { type: 'parity', cells: [24, 60], parity: 'even' }],
  whispers: [],
  'global-entropy': [],
  entropic: [{ type: 'entropic', cells: [2, 1, 0, 9, 18, 19] }, { type: 'entropic', cells: [58, 59, 68, 77, 76, 75, 66] }],
  modular: [{ type: 'modular', cells: [2, 1, 0, 9, 18, 19] }, { type: 'modular', cells: [58, 59, 68, 77, 76, 75, 66] }],
  renban: [{ type: 'renban', cells: [18, 27, 36] }, { type: 'renban', cells: [13, 14, 15] }],
  palindrome: [{ type: 'palindrome', cells: [0, 10, 20, 30, 31, 32] }, { type: 'palindrome', cells: [48, 49, 50, 60, 70, 80] }],
  between: [{ type: 'between', cells: [10, 19, 28, 29, 30] }, { type: 'between', cells: [52, 61, 70, 69] }],
  'region-sum': [{ type: 'region-sum', cells: [10, 20, 12, 22, 32, 40, 48, 58] }],
  'little-killer': [],
  sandwich: [],
  'x-sum': [],
  skyscrapers: [],
  clone: [{ type: 'clone', groups: [[10, 50], [11, 51], [19, 59], [20, 60]] }],
  thermometer: [{ type: 'thermometer', cells: [10, 19, 29, 30] }, { type: 'thermometer', cells: [68, 58, 49, 48] }],
  arrow: [{ type: 'arrow', circle: 28, cells: [29, 39, 40] }, { type: 'arrow', circle: 61, cells: [52, 43] }],
  kropki: [{ type: 'kropki', consecutive: { pairs: [[20, 21], [48, 57], [31, 40]] }, ratioTwo: { pairs: [[10, 19], [50, 51], [57, 58]] } }],
}

const previewRegions = regionMembership(jigsawLayout(variantSeeds.jigsaw.easy![0].regions!).regions)
const previewRegionEdges = previewRegions.flatMap((region, cell) => {
  const x = cell % 9
  const y = Math.floor(cell / 9)
  const edges = []
  if (x < 8 && region !== previewRegions[cell + 1]) edges.push(`M${x + 1},${y}v1`)
  if (y < 8 && region !== previewRegions[cell + 9]) edges.push(`M${x},${y + 1}h1`)
  return edges
}).join(' ')

/** Show a compact example of a generatable variant's grid markings alongside its name. */
export function VariantPreview({ variant, ruleset }: { variant: VariantId; ruleset?: GenerationRulesetId }) {
  const rules: readonly VariantRule[] = variant === 'whispers'
    ? [{ type: 'whispers', cells: [11, 21, 31, 39, 47, 57], minDifference: generationRuleset(variant, ruleset)!.minDifference }]
    : previews[variant]
  return <span className="variant-preview" data-variant={variant} aria-hidden="true">
    {rules.length > 0 && <VariantClues rules={rules} />}
    {variant === 'modular' && <svg className="variant-clues variant-modular-preview" viewBox="0 0 9 9" focusable="false">
      {([[2, 2], [1, 6], [0, 4], [9, 8], [18, 3], [19, 7]] as const).map(([cell, digit]) => <g key={cell}>
        <circle cx={cell % 9 + .5} cy={Math.floor(cell / 9) + .5} r=".34" />
        <text x={cell % 9 + .5} y={Math.floor(cell / 9) + .5}>{digit}</text>
      </g>)}
    </svg>}
    {variant === 'jigsaw' && <svg className="variant-clues" viewBox="0 0 9 9" focusable="false">
      <path className="variant-preview-regions" d={previewRegionEdges} />
    </svg>}
    {variant === 'little-killer' && <svg className="variant-clues variant-little-killer-preview" viewBox="0 0 9 9"><text x="1.8" y="2.2">12</text><path d="M3 3L6.7 6.7M5.2 6.7H6.7V5.2" /></svg>}
    {variant === 'sandwich' && <span className="variant-sandwich-preview"><span>10</span><span>1 · 2 3 5 · 9</span></span>}
    {variant === 'x-sum' && <span className="variant-x-sum-preview"><span>10</span><span>3 + 2 + 5</span></span>}
    {variant === 'skyscrapers' && <svg className="variant-clues variant-skyscrapers-preview" viewBox="0 0 9 9" focusable="false"><text x=".4" y="5.2">3</text><path d="M2 7V5H3V7M4 7V2H5V7M6 7V3H7V7M7.5 7V1H8.5V7" /></svg>}
    {variant === 'global-entropy' && <svg className="variant-clues variant-entropy-preview" viewBox="0 0 9 9" focusable="false">
      <rect x="1.5" y="1.5" width="6" height="6" rx=".2" />
      <path d="M4.5 1.5v6M1.5 4.5h6" />
      <text x="3" y="3.7">2</text><text x="6" y="3.7">5</text>
      <text x="3" y="6.7">8</text><text x="6" y="6.7">1</text>
    </svg>}
    {variant === 'anti-knight' && <span className="variant-knight">♞</span>}
    {variant === 'anti-king' && <Crown className="variant-king" size="1em" aria-hidden="true" focusable="false" />}
    {variant === 'non-consecutive' && <svg className="variant-clues variant-non-consecutive-preview" viewBox="0 0 9 9" focusable="false">
      <path d="M.75 3h7.5v2.5H.75zM3.25 3v2.5M5.75 3v2.5" />
      <text x="2" y="4.85">4</text><text x="4.5" y="4.85">8</text><text x="7" y="4.85">2</text>
      <text className="variant-preview-caption" x="4.5" y="7.1">No ±1 neighbors</text>
    </svg>}
  </span>
}
