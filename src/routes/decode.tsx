import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, iconButtonClassName } from '../components/Button'
import { decodeSudokuCoachPayload } from '../sudoku/puzzle-import/sudoku-coach'
import { decodeDigitRunGrid } from '../sudoku/puzzle-import/digit-runs'
import { decodeFPuzzlesPayload, FP_CODE } from '../sudoku/puzzle-import/f-puzzles'
import { fetchPublishedExport } from '../sudoku/puzzle-import/published-link'
import { decodeSudokuPadPayload } from '../sudoku/sized-sudoku-pad'

type DecodedPayload = { format: string; payload: unknown; isJson: boolean }

const EMBEDDED_FORMAT = /^(?:SCv[3-7]_(?:[0-9]+_)?|scf|scl|ctc|fpuz(?:zles)?)/i
const COACH_URL_CODE = /^SCv[3-7]_/i
const GRID_TEXT = /^[0-9.]{81}$/
const URL_INPUT = /^(?:https?:\/\/|sudokupad:\/\/|www\.|(?:[a-z0-9-]+\.)*(?:sudoku\.coach|sudokupad\.app|sudokupad\.svencodes\.com|app\.crackingthecryptic\.com)\/)/i
const SUDOKUPAD_HOSTS = new Set(['sudokupad.app', 'beta.sudokupad.app', 'sudokupad.svencodes.com', 'app.crackingthecryptic.com'])
const SUDOKU_COACH_HOSTS = new Set(['sudoku.coach', 'www.sudoku.coach'])

type ExtractedInput = { code: string } | { published: { source: 'sudoku-coach' | 'sudokupad'; path: string } }

export const Route = createFileRoute('/decode')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Decode puzzle data | Sudoku' }] }),
  component: DecodePage,
})

function inputCode(input: string): ExtractedInput {
  const text = input.trim()
  if (!text) throw new Error('Paste a puzzle code or link first.')
  if (URL_INPUT.test(text)) {
    let url: URL
    try { url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`) }
    catch { throw new Error('This link is not valid.') }
    let path = ''
    try { path = decodeURIComponent(url.pathname) }
    catch { throw new Error('This link contains invalid URL encoding.') }
    const segments = path.split('/').filter(Boolean)
    const formatIndex = segments.findIndex(segment => EMBEDDED_FORMAT.test(segment))
    if (formatIndex >= 0) return { code: segments.slice(formatIndex).join('/') }
    const grid = segments.find(segment => GRID_TEXT.test(segment))
    if (grid) return { code: grid }
    const host = url.hostname.toLowerCase()
    if (SUDOKU_COACH_HOSTS.has(host)) {
      const lowerSegments = segments.map(segment => segment.toLowerCase())
      const collectionIndex = lowerSegments.indexOf('collections')
      const shareIndex = lowerSegments.lastIndexOf('s')
      if (collectionIndex >= 0 && shareIndex > collectionIndex + 1 && segments[shareIndex + 1]) {
        return { published: { source: 'sudoku-coach', path: `collections/${segments.slice(collectionIndex + 1, shareIndex).join('/')}/${segments[shareIndex + 1]}` } }
      }
      if (shareIndex >= 0 && segments[shareIndex + 1]) {
        return { published: { source: 'sudoku-coach', path: segments[shareIndex + 1] } }
      }
    }
    if (SUDOKUPAD_HOSTS.has(host)) {
      const id = url.searchParams.get('puzzleid') || (segments.length === 1 ? segments[0] : '')
      if (id) return { published: { source: 'sudokupad', path: id } }
    }
    throw new Error('This link does not contain a supported puzzle payload.')
  }
  return { code: text }
}

async function decodeInput(input: string): Promise<DecodedPayload> {
  const extracted = inputCode(input)
  const code = 'published' in extracted
    ? (await fetchPublishedExport(extracted.published.source, extracted.published.path)).code
    : extracted.code
  if (COACH_URL_CODE.test(code)) {
    return { format: 'Sudoku Coach', payload: await decodeSudokuCoachPayload(code), isJson: true }
  }
  if (/^scf/i.test(code)) {
    return { format: 'SudokuPad SCF', payload: decodeDigitRunGrid(code.slice(3), 'SudokuPad'), isJson: false }
  }
  if (/^(?:scl|ctc)/i.test(code)) {
    return { format: `SudokuPad ${code.slice(0, 3).toUpperCase()}`, payload: decodeSudokuPadPayload(code), isJson: true }
  }
  if (FP_CODE.test(code)) {
    return { format: 'F-Puzzles', payload: decodeFPuzzlesPayload(code.replace(FP_CODE, ''), 'SudokuPad'), isJson: true }
  }
  if (GRID_TEXT.test(code)) return { format: '81-character grid', payload: code, isJson: false }
  if (code.startsWith('{') || code.startsWith('[')) {
    try { return { format: 'JSON', payload: JSON.parse(code), isJson: true } }
    catch { throw new Error('This JSON payload is not valid.') }
  }
  throw new Error('Supported inputs: Sudoku Coach SCv codes, SudokuPad SCF/SCL/CTC codes, F-Puzzles codes, JSON, or an 81-character grid.')
}

function DecodePage() {
  const heading = useRef<HTMLHeadingElement>(null)
  const [input, setInput] = useState('')
  const [decoded, setDecoded] = useState<DecodedPayload | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setDecoded(null)
    try { setDecoded(await decodeInput(input)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This payload could not be decoded.') }
    finally { setBusy(false) }
  }

  const output = decoded && (decoded.isJson ? JSON.stringify(decoded.payload, null, 2) : String(decoded.payload))

  return <main className="puzzles-page puzzles-subscreen decode-page">
    <div className="puzzles-layout decode-layout">
      <header className="puzzles-page-heading">
        <Link to="/puzzles/browse" className={iconButtonClassName()} aria-label="Back to puzzles">
          <ChevronLeft size={21} aria-hidden="true" />
        </Link>
        <h1 ref={heading} tabIndex={-1}>Decode puzzle data</h1>
      </header>
      <section className="main-menu-panel decode-content">
        <form className="decode-form" onSubmit={event => { void submit(event) }}>
          <label htmlFor="puzzle-payload">Puzzle code or link</label>
          <textarea id="puzzle-payload" value={input} spellCheck={false} autoCapitalize="off"
            autoCorrect="off" onChange={event => { setInput(event.currentTarget.value); setDecoded(null); setError('') }}
            placeholder="Paste a Sudoku Coach or SudokuPad code, a puzzle link, or JSON" />
          <p className="decode-note">Published Sudoku Coach and SudokuPad links are looked up before their payload is decoded.</p>
          <div className="dialog-actions">
            <Button type="button" disabled={!input} onClick={() => { setInput(''); setDecoded(null); setError('') }}>Clear</Button>
            <Button type="submit" variant="primary" disabled={!input.trim() || busy}>{busy ? 'Decoding…' : 'Decode'}</Button>
          </div>
        </form>
        {error && <p className="decode-error" role="alert">{error}</p>}
        {decoded && output !== undefined && <section className="decode-result" aria-live="polite">
          <div className="decode-result-heading"><h2>Decoded payload</h2><span>{decoded.format} · {decoded.isJson ? 'JSON' : 'text'}</span></div>
          <pre className="decode-output">{output}</pre>
        </section>}
      </section>
    </div>
  </main>
}
