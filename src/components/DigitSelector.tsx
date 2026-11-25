import { useMemo, type CSSProperties, type MouseEvent } from 'react'
import { candidateCount, COLORS, DIGITS, hasCandidate, placedDigitCounts } from '../sudoku/game'
import { colorCursor } from './color-cursor'
import { colorTone, colorToneStyle } from './color-tone'
import { PuzzleKeypad } from './PuzzleKeypad'
import { ColorKeypad } from './ColorKeypad'
import { useTouchHold } from './useTouchHold'
import type { ControlsProps } from './ControlsTypes'

export type DigitSelectorProps = {
  digits: ControlsProps['digits']
  tools: Pick<ControlsProps['tools'], 'colorTarget' | 'setColorTarget' | 'onSwitchShade' | 'chainDrawing' | 'eraseMode'>
  layout: Pick<ControlsProps['layout'], 'advancedModes' | 'disabled' | 'draft' | 'compact'>
}

/** Select digits and matching groups, or delegate color selection to its focused keypad. */
export function DigitSelector(props: DigitSelectorProps) {
  const colors = !props.tools.chainDrawing && props.digits.mode === 'color'
  const toggleDigitHighlight = !props.layout.disabled && !colors ? props.digits.onToggleDigitHighlight : undefined
  const canHighlightDigits = Boolean(toggleDigitHighlight)
  const highlightedDigitMask = props.digits.highlightedDigitMask ?? 0
  const digitHighlightMatch = props.digits.digitHighlightMatch ?? 'all'
  const digitHold = useTouchHold(canHighlightDigits)
  const gridSize = props.digits.gridSize ?? 9
  const counts = useMemo(() => placedDigitCounts(props.digits.values), [props.digits.values])
  const digitPaintCursor = props.digits.digitPaintColor ? colorCursor(props.digits.digitPaintColor) : undefined

  function clickDigit(event: MouseEvent<HTMLButtonElement>, digit: number) {
    if (digitHold.suppressClick(event)) return
    if (toggleDigitHighlight && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      digitHold.rememberClick(event.currentTarget)
      toggleDigitHighlight(digit, event.shiftKey ? 'any' : 'all')
    } else props.digits.input(digit)
  }

  function digitContextMenu(event: MouseEvent<HTMLButtonElement>, digit: number) {
    if (!toggleDigitHighlight || digitHold.suppressContextMenu(event)) return
    if (event.ctrlKey) {
      // macOS can route Control-click through the context menu event.
      event.preventDefault()
      digitHold.rememberClick(event.currentTarget)
      toggleDigitHighlight(digit, event.shiftKey ? 'any' : 'all')
    }
  }

  if (colors) {
    return (
      <ColorKeypad
        selectedColor={props.digits.selectedDigit}
        target={props.tools.colorTarget}
        disabled={props.layout.disabled}
        onSelectColor={props.digits.input}
        onSwitchShade={props.tools.onSwitchShade}
        onTarget={props.tools.setColorTarget}
        onErase={() => props.digits.input(0)}
      />
    )
  }

  return (
    <div className="keypad-stack">
      {!props.layout.draft && props.digits.pencil && props.layout.advancedModes.candidateLayout === 'center-corner' && (
        <div className="input-switch" role="group" aria-label="Candidate position">
          <button
            aria-pressed={props.digits.candidateKind === 'center'}
            disabled={props.layout.disabled || props.tools.chainDrawing}
            onClick={() => props.digits.setCandidateKind('center')}
          >
            Center
          </button>
          <button
            aria-pressed={props.digits.candidateKind === 'corner'}
            disabled={props.layout.disabled || props.tools.chainDrawing}
            onClick={() => props.digits.setCandidateKind('corner')}
          >
            Corner
          </button>
        </div>
      )}
      <PuzzleKeypad variant={gridSize === 4 ? 'mini' : gridSize === 6 ? 'six' : undefined} label="Digit pad">
        {DIGITS.slice(0, gridSize).map((digit) => {
          const highlighted = hasCandidate(highlightedDigitMask, digit)
          const singleHighlight = highlightedDigitMask === 1 << (digit - 1)
          const armed = props.digits.selectedDigit === digit || (props.tools.chainDrawing ? highlighted : canHighlightDigits && singleHighlight)
          const pressed = armed || (canHighlightDigits && highlighted)
          const progress = props.layout.draft ? 'off' : props.layout.advancedModes.keypadProgress
          const remaining = Math.max(0, gridSize - counts[digit])
          const candidateColorSummary = props.digits.candidateDigitColors?.[digit - 1]
          const candidateColor = candidateColorSummary?.colors.length === 1 ? candidateColorSummary.colors[0].color : null
          const mixedCandidateColors = candidateColorSummary && candidateColorSummary.colors.length > 1 ? candidateColorSummary.colors : undefined
          const paintedCandidateCount = candidateColorSummary?.colors.reduce((sum, shade) => sum + shade.count, 0) ?? 0
          const unpaintedCandidateCount = Math.max(0, (candidateColorSummary?.candidateCount ?? 0) - paintedCandidateCount)
          const candidateColorLabel = mixedCandidateColors?.length
            ? `, candidates colored ${mixedCandidateColors.map(({ color, count }) => `${count} ${COLORS[color - 1].toLowerCase()}`).join(' and ')}${unpaintedCandidateCount ? `; ${unpaintedCandidateCount} uncolored` : ''} of ${candidateColorSummary!.candidateCount}`
            : ''
          const digitLabel = props.tools.chainDrawing
            ? `${armed ? 'Clear highlight for' : 'Highlight'} ${digit}`
            : `${props.digits.hasCellSelection ? 'Enter' : armed ? 'Deselect' : 'Select'} ${digit}`
          return (
            <button
              type="button"
              key={digit}
              className={`key ${candidateColor ? 'tone-key candidate-color-key' : mixedCandidateColors ? 'candidate-multi-color-key' : ''} ${progress === 'dim' && counts[digit] === gridSize ? 'all-placed' : ''} ${pressed ? 'selected-key' : ''}`}
              style={{ ...colorToneStyle(candidateColor ?? undefined), cursor: digitPaintCursor }}
              aria-label={`${progress === 'count' ? `${digitLabel}, ${remaining} remaining` : digitLabel}${candidateColor ? `, candidates colored ${COLORS[candidateColor - 1].toLowerCase()}` : candidateColorLabel}`}
              aria-keyshortcuts={[props.tools.chainDrawing && digit, `Shift+${digit}`, `F${digit}`, canHighlightDigits && !props.tools.eraseMode && `Control+${digit} Meta+${digit}`]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={pressed}
              disabled={props.layout.disabled}
              data-no-panel-hold={canHighlightDigits || undefined}
              onPointerDown={(event) => digitHold.start(event, toggleDigitHighlight && (() => toggleDigitHighlight(digit, props.layout.compact ? digitHighlightMatch : 'all')))}
              onPointerMove={digitHold.move}
              onContextMenu={(event) => digitContextMenu(event, digit)}
              onClick={(event) => clickDigit(event, digit)}
            >
              <span>{digit}</span>
              {mixedCandidateColors && (
                <span className="key-color-summary" aria-hidden="true">
                  {mixedCandidateColors.map(({ color, count }) => (
                    <i key={color} style={{ '--key-color-tone': colorTone(color), '--key-color-coverage': count } as CSSProperties} />
                  ))}
                  {unpaintedCandidateCount > 0 && <i className="unpainted" style={{ '--key-color-coverage': unpaintedCandidateCount } as CSSProperties} />}
                </span>
              )}
              {progress === 'count' && <span className="key-remaining" aria-hidden="true">{remaining}</span>}
            </button>
          )
        })}
      </PuzzleKeypad>
    </div>
  )
}
