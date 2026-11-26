import { useMemo, type CSSProperties, type MouseEvent } from 'react'
import { Pin } from 'lucide-react'
import { candidateCount, COLORS, DIGITS, hasCandidate, placedDigitCounts } from '../sudoku/game'
import { colorCursor } from './color-cursor'
import { colorTone, colorToneStyle } from './color-tone'
import { PuzzleKeypad } from './PuzzleKeypad'
import { useTouchHold } from './useTouchHold'
import type { ControlsProps } from './ControlsTypes'

export type DigitSelectorProps = {
  digits: ControlsProps['digits']
  tools: Pick<ControlsProps['tools'], 'chainDrawing' | 'eraseMode'>
  layout: Pick<ControlsProps['layout'], 'advancedModes' | 'disabled' | 'draft' | 'compact'>
}

/** Keep digit selection available in every mode, including candidate painting. */
export function DigitSelector(props: DigitSelectorProps) {
  const highlightEnabled = !props.layout.disabled && !props.tools.chainDrawing
  const togglePin = highlightEnabled ? props.digits.onTogglePinnedDigit : undefined
  const toggleDigitHighlight = togglePin ?? (highlightEnabled ? props.digits.onToggleDigitHighlight : undefined)
  const canHighlightDigits = Boolean(toggleDigitHighlight)
  const highlightedDigitMask = props.digits.highlightedDigitMask ?? 0
  const digitHold = useTouchHold(canHighlightDigits, Boolean(togglePin))
  const gridSize = props.digits.gridSize ?? 9
  const counts = useMemo(() => placedDigitCounts(props.digits.values), [props.digits.values])
  const digitPaintCursor = props.digits.digitPaintColor ? colorCursor(props.digits.digitPaintColor) : undefined

  function clickDigit(event: MouseEvent<HTMLButtonElement>, digit: number) {
    if (digitHold.suppressClick(event)) return
    if (toggleDigitHighlight && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      digitHold.rememberClick(event.currentTarget)
      toggleDigitHighlight(digit, event.shiftKey ? 'any' : 'all')
    } else if (!props.tools.chainDrawing && props.digits.digitPaintColor !== undefined) {
      props.digits.onPaintDigit?.(digit)
    } else if (!props.tools.chainDrawing && props.digits.mode === 'color') {
      props.digits.onSelectDigit?.(digit)
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
          const pinned = Boolean(togglePin && hasCandidate(props.digits.pinnedDigitMask ?? 0, digit))
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
            : props.digits.digitPaintColor === 0
              ? `Erase candidate colors for ${digit}`
              : props.digits.digitPaintColor !== undefined
                ? `Paint candidates for ${digit}`
                : props.digits.mode === 'color'
                  ? `${armed ? 'Deselect' : 'Select'} ${digit}`
                  : `${props.digits.hasCellSelection ? 'Enter' : armed && !pinned ? 'Deselect' : 'Select'} ${digit}`
          return (
            <button
              type="button"
              key={digit}
              className={`key ${candidateColor ? 'tone-key candidate-color-key' : mixedCandidateColors ? 'candidate-multi-color-key' : ''} ${progress === 'dim' && counts[digit] === gridSize ? 'all-placed' : ''} ${pressed ? 'selected-key' : ''}`}
              style={{ ...colorToneStyle(candidateColor ?? undefined), cursor: digitPaintCursor }}
              aria-label={`${progress === 'count' ? `${digitLabel}, ${remaining} remaining` : digitLabel}${pinned ? ', pinned' : ''}${candidateColor ? `, candidates colored ${COLORS[candidateColor - 1].toLowerCase()}` : candidateColorLabel}`}
              aria-keyshortcuts={[props.tools.chainDrawing && digit, `Shift+${digit}`, `F${digit}`, canHighlightDigits && !props.tools.eraseMode && `Control+${digit} Meta+${digit}`]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={pressed}
              disabled={props.layout.disabled}
              data-no-panel-hold={canHighlightDigits || undefined}
              data-pinned-digit={pinned || undefined}
              title={togglePin ? `Hold to ${pinned ? 'unpin' : 'pin'} ${digit}` : undefined}
              onPointerDown={(event) => digitHold.start(event, toggleDigitHighlight && (() => {
                if (togglePin) togglePin(digit)
                else toggleDigitHighlight(digit, props.layout.compact ? props.digits.digitHighlightMatch ?? 'all' : 'all')
              }))}
              onPointerMove={digitHold.move}
              onPointerLeave={(event) => { if (event.pointerType !== 'touch') digitHold.cancel() }}
              onContextMenu={(event) => digitContextMenu(event, digit)}
              onClick={(event) => clickDigit(event, digit)}
            >
              <span>{digit}</span>
              {pinned && <Pin className="key-pin" size="0.47em" aria-hidden="true" />}
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
