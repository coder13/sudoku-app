import { Button, IconButton } from './Button'
import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { createEngineSession, type TechniqueCatalog } from '../sudoku/engine'
import { completeCandidateMasks, hintEliminations, isSolved, valuesOf, type Game } from '../sudoku/game'
import { sizedRuleHintChoices, SIZED_RULE_TECHNIQUES } from '../sudoku/sized-rule-play'
import { MINI_TECHNIQUES, miniHintChoices } from '../sudoku/mini-play'
import { ALGEBRAIC_CAGE_TECHNIQUE, algebraicHintChoices } from '../sudoku/algebraic-play'
import { ALGEBRAIC_CAGES_NAME, MINI_NAME, sizedGridName } from '../sudoku/new-puzzle'
import { HINT_CANDIDATES_ERROR, HINT_ERROR, techniqueLabel } from '../sudoku/hints'
import { addAnalysisAssistance } from '../sudoku/player-rating'
import { roomStore } from '../sudoku/storage'
import { analysisGroupsForCatalog, classicBasicTechniqueCounts, filterAnalysisGroups, TECHNIQUE_FINDER_TITLE, type AnalysisCount, type AnalysisGroup } from '../sudoku/puzzle-analysis'
import { cachedTechniqueCounts, watchTechniqueScan, techniqueScanKey } from '../sudoku/technique-scan'
import { puzzleTechniqueCatalog, variantHintProblem } from '../sudoku/puzzle-help'
import { variantPosition } from '../sudoku/variant-play'
import { Modal } from './Modal'
import { HIDE_ZERO_TECHNIQUES_KEY } from '../sudoku/preferences'
import { notifySettingsEdit } from '../sudoku/settings-events'

const SCAN_DEBOUNCE_MS = 1000

function useHideZeroTechniques() {
  const [hideZero, setHideZero] = useState(true)
  useEffect(() => {
    function refresh(event?: StorageEvent) {
      if (event && (event.storageArea !== localStorage || (event.key !== null && event.key !== HIDE_ZERO_TECHNIQUES_KEY))) return
      try { setHideZero(localStorage.getItem(HIDE_ZERO_TECHNIQUES_KEY) !== 'false') }
      catch { /* The filter still works when storage is unavailable. */ }
    }
    refresh()
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  function changeHideZero(checked: boolean) {
    setHideZero(checked)
    try { localStorage.setItem(HIDE_ZERO_TECHNIQUES_KEY, String(checked)); notifySettingsEdit() }
    catch { /* Keep the preference for this session. */ }
  }
  return [hideZero, changeHideZero] as const
}

type ScanResults = Readonly<Record<string, AnalysisCount>>
type ScanProgress = { key: string; results: ScanResults }

function AnalysisTable({
  groups, results, solved, onSelectTechnique, unit = 'Candidates', label = techniqueLabel,
}: {
  groups: readonly AnalysisGroup[]; results: ScanResults; solved: boolean
  onSelectTechnique?: (technique: string) => void; unit?: string; label?: (technique: string) => string
}) {
  return (
    <table className="analysis-table" aria-label={`Available ${unit.toLowerCase()} by technique`}>
      <thead>
        <tr><th scope="col">Technique</th><th scope="col">{unit}</th></tr>
      </thead>
      {groups.map((group) => (
        <tbody key={group.title}>
          <tr className="analysis-section-row">
            <th scope="rowgroup" colSpan={2}>{group.title}</th>
          </tr>
          {group.techniques.map((technique) => {
            const result = results[technique]
            const count = solved ? 0 : result && 'count' in result ? result.count : null
            return (
              <tr key={technique} className="analysis-data-row">
                <th scope="row">
                  {onSelectTechnique && !solved
                    ? <button type="button" className="analysis-technique-link"
                        onClick={() => onSelectTechnique(technique)}
                        disabled={count === 0 || Boolean(result && 'error' in result)}>
                        {label(technique)}
                      </button>
                    : label(technique)}
                </th>
                <td className={count === 0 ? 'analysis-zero' : undefined}>
                  {count !== null ? count
                    : result && 'error' in result
                      ? <span className="analysis-failed" title={result.error} aria-label={`${label(technique)} scan failed`}>Unavailable</span>
                      : <span className="analysis-pending" aria-label={`Scanning ${label(technique)}`}>
                          <LoaderCircle size="1em" className="loading-spinner" aria-hidden="true" />
                        </span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      ))}
    </table>
  )
}

type ContentsProps = { game: Game; active?: boolean; onSelectTechnique?: (technique: string) => void }
const algebraicTechniques = [...MINI_TECHNIQUES, ALGEBRAIC_CAGE_TECHNIQUE]

export function PuzzleAnalysisContents(props: ContentsProps) {
  return props.game.grid ? <SizedAnalysis {...props} /> : <StandardAnalysis {...props} />
}

function SizedAnalysis({ game, active = true, onSelectTechnique }: ContentsProps) {
  const values = valuesOf(game)
  const { algebraic, grid, sized } = game
  const techniques = sized ? SIZED_RULE_TECHNIQUES : algebraic ? algebraicTechniques : MINI_TECHNIQUES
  const size = grid!.size
  const eliminations = useMemo(() => hintEliminations(values, completeCandidateMasks(game), game.position.eliminations, size),
    [values, game.position, size])
  const solved = isSolved(game)
  const key = `${game.id}:${values}:${eliminations?.join(',') ?? ''}`
  const [scan, setScan] = useState<ScanProgress | null>(null)
  const [hideZero, setHideZero] = useHideZeroTechniques()
  const [failedKey, setFailedKey] = useState<string>()
  useEffect(() => {
    if (!active || solved) return
    let current = true
    let engine: ReturnType<typeof createEngineSession> | null = null
    const timer = window.setTimeout(() => {
      // Keep finder work off the shared play worker so candidate input stays
      // responsive while this position is being analyzed.
      const session = createEngineSession()
      engine = session
      const request = sized && grid ? sizedRuleHintChoices(sized, grid, values, eliminations, session.run)
        : algebraic ? algebraicHintChoices(algebraic, values, eliminations, session.run)
          : miniHintChoices(values, eliminations, session.run)
      void request.then(found => {
        if (!current) return
        if (!found) { setFailedKey(key); return }
        const counts = new Map<string, Set<string>>()
        for (const choice of found.choices) {
          const targets = counts.get(choice.technique) ?? new Set<string>()
          for (const action of choice.actions) {
            const { cell, digit } = 'place' in action ? action.place : action.eliminate
            targets.add(`${cell}:${digit}`)
          }
          counts.set(choice.technique, targets)
        }
        setFailedKey(undefined)
        setScan({ key, results: Object.fromEntries(techniques.map(id => [id, { count: counts.get(id)?.size ?? 0 }])) })
      }, () => { if (current) setFailedKey(key) })
    }, SCAN_DEBOUNCE_MS)
    return () => { current = false; window.clearTimeout(timer); engine?.close() }
  }, [active, algebraic, grid, sized, solved, values, eliminations, key, techniques])

  const results = scan?.key === key ? scan.results : {}
  const groups = filterAnalysisGroups([{ title: algebraic ? ALGEBRAIC_CAGES_NAME : grid ? sizedGridName(grid) : MINI_NAME, techniques: [...techniques] }], results, hideZero, solved)
  return <div className="puzzle-analysis-content">
    {failedKey === key ? <p role="alert" className="analysis-error">Check the placed digits and candidates, then try again.</p> : <>
      <label className="analysis-zero-filter">
        <input type="checkbox" checked={hideZero} onChange={event => setHideZero(event.target.checked)} />
        Hide techniques with 0 candidates
      </label>
      {groups.length ? <AnalysisTable groups={groups} results={results} solved={solved} onSelectTechnique={onSelectTechnique} />
        : <p className="analysis-empty" role="status">No techniques with candidates.</p>}
    </>}
  </div>
}

/** Scan one technique at a time on the dedicated technique worker. Each
 * result appears immediately, and obsolete positions never queue 72 jobs.
 * The game worker stays free for input, hints, and candidate updates.
 */
function StandardAnalysis({ game, active = true, onSelectTechnique }: ContentsProps) {
  const values = valuesOf(game)
  const solved = isSolved(game)
  const eliminationMasks = useMemo(() => hintEliminations(values, completeCandidateMasks(game), game.position.eliminations),
    [values, game.position.center, game.position.corner, game.position.eliminations])
  const variant = Boolean(game.variant)
  const position = game.variant && variantPosition(game.variant, game.position)
  const snapshotKey = techniqueScanKey(values, eliminationMasks, position?.puzzle)
  const positionProblem = variantHintProblem(game, values, eliminationMasks)
  // These six techniques are normal Sudoku techniques, even on variant boards.
  // Count them only from row, column, and box rules, independent of variant rules
  // and player candidate marks.
  const immediateCounts = useMemo(() => classicBasicTechniqueCounts(values), [values])
  const [catalog, setCatalog] = useState<TechniqueCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [scan, setScan] = useState<ScanProgress | null>(null)
  const [retry, setRetry] = useState(0)
  const [hideZero, changeHideZero] = useHideZeroTechniques()

  useEffect(() => {
    if (!active) return
    let current = true
    setCatalogError(null)
    setCatalog(null)
    void puzzleTechniqueCatalog(variant).then((found) => {
      if (current) setCatalog(found)
    }).catch((reason: unknown) => {
      if (current) setCatalogError(reason instanceof Error ? reason.message : 'Could not load techniques.')
    })
    return () => { current = false }
  }, [active, variant, retry])

  const groups = useMemo(() => analysisGroupsForCatalog(catalog?.techniques ?? []), [catalog])
  const techniques = useMemo(() => [...(catalog?.techniques ?? [])]
    .sort((left, right) => left.cost - right.cost).map(({ id }) => id), [catalog])

  useEffect(() => {
    if (!active || solved || !catalog) return
    const cached = { ...cachedTechniqueCounts(snapshotKey), ...immediateCounts }
    const missing = techniques.filter((technique) => !cached[technique])
    setScan({ key: snapshotKey, results: cached })
    let current = true
    let recorded = false

    function recordAssistance() {
      if (recorded) return
      recorded = true
      roomStore.update(game.id, (latest) => {
        if (latest.source === 'draft' || isSolved(latest)) return latest
        const latestValues = valuesOf(latest)
        if (latestValues !== values) return latest
        const masks = hintEliminations(latestValues, completeCandidateMasks(latest), latest.position.eliminations)
        if (techniqueScanKey(latestValues, masks, latest.variant && variantPosition(latest.variant, latest.position).puzzle) !== snapshotKey) return latest
        const attempt = latest.ratingAttempt
        const ratingAttempt = attempt && addAnalysisAssistance(attempt)
        return latest.analysisUsed && ratingAttempt === attempt ? latest
          : { ...latest, analysisUsed: true, ratingAttempt }
      })
    }

    if (missing.length < techniques.length) recordAssistance()
    // Variant errors block variant-aware scans, but not the classic results above.
    if (positionProblem || missing.length === 0) return

    let scan: ReturnType<typeof watchTechniqueScan> | null = null

    function showResult(technique: string, result: AnalysisCount) {
      setScan((previous) => previous?.key === snapshotKey
        ? { key: snapshotKey, results: { ...previous.results, [technique]: result } }
        : previous)
    }

    const timer = window.setTimeout(() => {
      scan = watchTechniqueScan(values, eliminationMasks, position)
      void (async () => {
        for (const technique of missing) {
          if (!current) return
          try {
            const count = await scan!.count(technique)
            if (!current) return
            showResult(technique, { count })
            recordAssistance()
          } catch (reason) {
            if (!current) return
            const error = reason instanceof Error ? reason.message : 'This technique could not be scanned.'
            showResult(technique, { error })
          }
        }
      })()
    }, SCAN_DEBOUNCE_MS)
    return () => { current = false; window.clearTimeout(timer); scan?.close() }
  }, [active, solved, catalog, techniques, snapshotKey, values, game.id, retry, positionProblem, immediateCounts])

  const workerResults = scan?.key === snapshotKey ? scan.results : cachedTechniqueCounts(snapshotKey)
  const results = { ...workerResults, ...immediateCounts }
  const completed = Object.keys(results).length
  const total = groups.reduce((count, group) => count + group.techniques.length, 0)
  const visibleGroups = filterAnalysisGroups(groups, results, hideZero, solved)

  return (
    <div className="puzzle-analysis-content">
      {positionProblem && <div role="alert" className="analysis-error">
        <p>{(positionProblem === 'invalid-eliminations' ? HINT_CANDIDATES_ERROR : HINT_ERROR).text}</p>
      </div>}
      {catalogError && <div role="alert" className="analysis-error">
        <p>{catalogError}</p>
        <Button onClick={() => setRetry((value) => value + 1)}>Try again</Button>
      </div>}
      {catalog && !positionProblem && <>
        <label className="analysis-zero-filter">
          <input type="checkbox" checked={hideZero} onChange={(event) => changeHideZero(event.target.checked)} />
          Hide techniques with 0 candidates
        </label>
        {visibleGroups.length
          ? <AnalysisTable groups={visibleGroups} results={results} solved={solved} onSelectTechnique={onSelectTechnique} />
          : <p className="analysis-empty" role="status">No techniques with candidates.</p>}
        {!solved && completed === total && Object.values(results).some((result) => 'error' in result) &&
          <Button onClick={() => setRetry((value) => value + 1)}>Retry failed scans</Button>}
      </>}
    </div>
  )
}

export function PuzzleAnalysisCard({ game, close, onSelectTechnique }: {
  game: Game; close: () => void; onSelectTechnique?: (technique: string) => void
}) {
  return (
    <section className="surface puzzle-analysis-card" aria-label={TECHNIQUE_FINDER_TITLE}>
      <div className="puzzle-analysis-card-heading">
        <h2>{TECHNIQUE_FINDER_TITLE}</h2>
        <IconButton type="button" variant="quiet" onClick={close} aria-label={`Close ${TECHNIQUE_FINDER_TITLE.toLowerCase()}`}
          title="Close card"><X size={18} /></IconButton>
      </div>
      <div className="puzzle-analysis-card-body">
        <PuzzleAnalysisContents game={game} onSelectTechnique={onSelectTechnique} />
      </div>
    </section>
  )
}

type PlacementAnalysisProps = {
  title: string
  techniques: readonly string[]
  counts: ReadonlyMap<string, number>
  solved: boolean
  unit?: string
  problem?: string
  onSelectTechnique: (technique: string) => void
}

export function PlacementAnalysis({ title, techniques, counts, solved, unit = 'Placements', problem, onSelectTechnique }: PlacementAnalysisProps) {
  const [hideZero, setHideZero] = useHideZeroTechniques()
  const results = Object.fromEntries(techniques.map(technique => [technique, { count: counts.get(technique) ?? 0 }]))
  const groups = filterAnalysisGroups([{ title, techniques: [...techniques] }], results, hideZero, solved)
  return <div className="puzzle-analysis-content">
    {problem ? <p className="analysis-error" role="alert">{problem}</p> : <>
      <label className="analysis-zero-filter">
        <input type="checkbox" checked={hideZero} onChange={event => setHideZero(event.target.checked)} />
        Hide techniques with 0 {unit.toLowerCase()}
      </label>
      {groups.length ? <AnalysisTable groups={groups} results={results} solved={solved} unit={unit}
        label={technique => technique} onSelectTechnique={onSelectTechnique} />
        : <p className="analysis-empty" role="status">No techniques with {unit.toLowerCase()}.</p>}
    </>}
  </div>
}

export function PuzzleAnalysis(props: (ContentsProps | PlacementAnalysisProps) & { close: () => void }) {
  return (
    <Modal title={TECHNIQUE_FINDER_TITLE} onClose={props.close} className="puzzle-analysis-dialog">
      {'game' in props ? <PuzzleAnalysisContents {...props} /> : <PlacementAnalysis {...props} />}
    </Modal>
  )
}
