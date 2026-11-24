import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, buttonClassName, iconButtonClassName } from '../components/Button'
import { Board } from '../components/Board'
import { detectPuzzle, MAX_IMPORT_LENGTH, type ImportedPuzzle } from '../sudoku/puzzle-import'
import { decodeSudokuCoachPayload } from '../sudoku/puzzle-import/sudoku-coach'
import { prepareDetectedPuzzle, type PuzzlePreview } from '../sudoku/puzzle-preview'
import { DIFFICULTY_LABELS } from '../sudoku/difficulty'
import { sizedRuleDescriptions } from '../sudoku/sized-rule-game'
import { variantName, variantRuleDescriptions } from '../sudoku/variants'
import { sizedGridName } from '../sudoku/new-puzzle'

type ImportError = { stage: 'Format and parsing' | 'Puzzle validation'; message: string }
type Inspection = { imported?: ImportedPuzzle; payload?: unknown; preview?: PuzzlePreview; errors: ImportError[]; format?: string }

export const Route = createFileRoute('/decode')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Inspect puzzle import | Sudoku' }] }),
  component: DecodePage,
})

function jsonText(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function HighlightedJson({ value }: { value: string }) {
  const parts = value.split(/("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b)/g)
  return <pre className="decode-output" aria-label="Formatted JSON payload">{parts.map((part, index) => {
    const kind = /^"/.test(part) ? /^\s*:/.test(parts[index + 1] ?? '') ? 'key' : 'string'
      : /^(?:true|false|null)$/.test(part) ? 'literal' : /^-?\d/.test(part) ? 'number' : ''
    return kind ? <span className={`decode-json-${kind}`} key={index}>{part}</span> : part
  })}</pre>
}

function sizeLabel(puzzle: ImportedPuzzle) {
  if (puzzle.grid) return `${sizedGridName(puzzle.grid)} · ${puzzle.grid.size} × ${puzzle.grid.size}`
  return 'Classic 9 × 9'
}

function payloadSizeLabel(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('gridSize' in payload) || typeof payload.gridSize !== 'number') return 'Unknown'
  return payload.gridSize === 9 ? 'Classic 9 × 9' : `${payload.gridSize} × ${payload.gridSize}`
}

function rulesets(puzzle: ImportedPuzzle) {
  const descriptions = puzzle.variant
    ? variantRuleDescriptions(puzzle.variant.puzzle, puzzle.variant.fog)
    : puzzle.sizedRules && puzzle.grid ? sizedRuleDescriptions(puzzle.grid, puzzle.sizedRules)
      : puzzle.algebraic ? ['Algebraic cages'] : []
  if (puzzle.variant) return [variantName(puzzle.variant), ...descriptions]
  if (!descriptions.length) return ['Classic rows, columns, and boxes']
  return descriptions
}

function difficultyLabel(preview?: PuzzlePreview, busy = false) {
  if (preview?.ratingPending || busy && !preview) return 'Calculating…'
  if (preview?.game.difficulty) return DIFFICULTY_LABELS[preview.game.difficulty]
  if (preview?.game.difficulty === null) return 'Not rated for this puzzle type'
  return preview ? 'Rating unavailable' : 'Unavailable until import validates'
}

function issueLink(input: string, inspection: Inspection | null) {
  if (!inspection) return
  const puzzle = inspection.imported
  const summary = [
    `Import result: ${inspection.errors.length ? 'failed' : 'successful'}`,
    `Detected format: ${inspection.format ?? puzzle?.format ?? 'Unknown'}`,
    `Grid size: ${puzzle ? sizeLabel(puzzle) : 'Unknown'}`,
    `Detected rulesets: ${puzzle ? rulesets(puzzle).join('; ') : 'Unknown'}`,
    `Difficulty: ${difficultyLabel(inspection.preview)}`,
    `Errors:\n${inspection.errors.length ? inspection.errors.map(error => `- ${error.stage}: ${error.message}`).join('\n') : '- None'}`,
  ].join('\n')
  const maxInputChars = 800
  const source = input.length > maxInputChars
    ? `${input.slice(0, maxInputChars)}\n\n[Input truncated to fit the GitHub issue link; original length: ${input.length} characters.]`
    : input
  const decodedPayload = inspection.payload !== undefined ? jsonText(inspection.payload) : puzzle ? jsonText(puzzle) : ''
  const payloadExcerpt = decodedPayload.length > 900
    ? `${decodedPayload.slice(0, 900)}\n[Decoded payload truncated to fit the GitHub issue link; full length: ${decodedPayload.length} characters.]`
    : decodedPayload || '[No puzzle payload could be decoded.]'
  const body = [
    '## Import triage', '', summary, '',
    '## Puzzle input', '', '```text', source, '```', '',
    '## Decoded payload', '', '```json', payloadExcerpt, '```',
  ].join('\n')
  const title = `Import issue: ${inspection.format ?? puzzle?.format ?? 'unknown format'} puzzle`
  return `https://github.com/coder13/sudoku-app/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}

function DecodePage() {
  const heading = useRef<HTMLHeadingElement>(null)
  const [input, setInput] = useState('')
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setInspection(null)
    try {
      const imported = await detectPuzzle(input)
      setInspection({ imported, errors: [], format: imported.format })
      try {
        const preview = await prepareDetectedPuzzle(imported)
        setInspection({ imported, preview, errors: [], format: imported.format })
      } catch (cause) {
        setInspection({ imported, errors: [{
          stage: 'Puzzle validation',
          message: cause instanceof Error ? cause.message : 'The decoded puzzle could not be validated.',
        }], format: imported.format })
      }
    } catch (cause) {
      const text = input.trim()
      const payload = /^SCv7_32_/i.test(text)
        ? await decodeSudokuCoachPayload(text).catch(() => undefined)
        : undefined
      setInspection({ errors: [{
        stage: 'Format and parsing',
        message: cause instanceof Error ? cause.message : 'The input could not be parsed as a supported puzzle.',
      }], ...(payload !== undefined && { payload, format: 'Sudoku Coach' }) })
    } finally {
      setBusy(false)
    }
  }

  const imported = inspection?.imported
  let payload: unknown = inspection?.payload ?? imported ?? input
  let payloadIsJson = inspection?.payload !== undefined || Boolean(imported)
  const inputText = input.trim()
  if (!/^\d{81}$/.test(inputText)) {
    try {
      const parsed = JSON.parse(inputText)
      payload = parsed
      payloadIsJson = true
    } catch { /* The normalized imported puzzle is still shown when available. */ }
  }
  const formattedPayload = payloadIsJson ? jsonText(payload) : String(payload ?? '')
  const reportUrl = issueLink(input, inspection)
  const previewGrid = imported && <Board grid={imported.grid} label="Imported puzzle preview" givens={imported.givens} values={imported.givens}
    givenCellColors={imported.givenCellColors} authoredArtwork={imported.authoredArtwork}
    candidateLayout="center-corner" variantPuzzle={imported.variant?.puzzle} showGuides={false} />

  return <main className="puzzles-page puzzles-subscreen decode-page">
    <div className="puzzles-layout decode-layout">
      <header className="puzzles-page-heading">
        <Link to="/puzzles/browse" className={iconButtonClassName()} aria-label="Back to puzzles">
          <ChevronLeft size={21} aria-hidden="true" />
        </Link>
        <h1 ref={heading} tabIndex={-1}>Inspect puzzle import</h1>
      </header>
      <section className="main-menu-panel decode-content">
        <div className="decode-inspector">
          <div className="decode-left-column">
            <form className="decode-form" onSubmit={event => { void inspect(event) }}>
              <label htmlFor="puzzle-payload">Puzzle code or link</label>
              <textarea id="puzzle-payload" value={input} spellCheck={false} autoCapitalize="off" autoCorrect="off"
                maxLength={MAX_IMPORT_LENGTH} onChange={event => { setInput(event.currentTarget.value); setInspection(null) }}
                placeholder="Paste a Sudoku Coach or SudokuPad code, puzzle link, or JSON" />
              <div className="dialog-actions">
                <Button type="button" disabled={!input} onClick={() => { setInput(''); setInspection(null) }}>Clear</Button>
                <Button type="submit" variant="primary" disabled={!input.trim() || busy}>{busy ? 'Inspecting…' : 'Inspect import'}</Button>
              </div>
            </form>

            {inspection && <section className="decode-triage" aria-live="polite">
              <h2>Import details</h2>
              {imported ? <dl className="decode-properties">
                <div><dt>Format</dt><dd>{imported.format}</dd></div>
                <div><dt>Grid size</dt><dd>{sizeLabel(imported)}</dd></div>
                <div><dt>Difficulty</dt><dd>{difficultyLabel(inspection.preview, busy)}</dd></div>
              </dl> : inspection.format ? <dl className="decode-properties">
                <div><dt>Format</dt><dd>{inspection.format}</dd></div>
                <div><dt>Grid size</dt><dd>{payloadSizeLabel(inspection.payload)}</dd></div>
                <div><dt>Difficulty</dt><dd>Unavailable until import validates</dd></div>
              </dl> : <p className="decode-format-unknown">Format could not be identified.</p>}
              {imported && <div className="decode-rulesets"><h3>Detected rulesets</h3><ul>
                {rulesets(imported).map((rule, index) => <li key={`${index}-${rule}`}>{rule}</li>)}
              </ul></div>}

              {inspection.errors.length > 0 && <section className="decode-errors" role="alert">
                <h3>Import errors</h3><ul>{inspection.errors.map((error, index) =>
                  <li key={`${error.stage}-${index}`}><strong>{error.stage}:</strong> {error.message}</li>)}</ul>
              </section>}
              {imported && <section className="decode-puzzle-preview">
                <h3>Puzzle preview</h3>{previewGrid}
                {inspection.preview && <p className="decode-validation-success">Puzzle parsed and passed import validation.</p>}
              </section>}
              {reportUrl && <a className={buttonClassName('secondary', 'decode-file-issue')} href={reportUrl} target="_blank" rel="noreferrer">
                File issue <ExternalLink size={16} aria-hidden="true" />
              </a>}
            </section>}
          </div>

          <section className="decode-payload" aria-label="Formatted source payload">
            <div className="decode-result-heading"><h2>Payload</h2>
              <span>{payloadIsJson ? 'JSON · syntax highlighted' : 'Text input'}</span></div>
            {payloadIsJson ? <HighlightedJson value={formattedPayload} />
              : <pre className="decode-output">{formattedPayload || 'The decoded payload will appear here.'}</pre>}
          </section>
        </div>
      </section>
    </div>
  </main>
}
