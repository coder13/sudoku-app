import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { runEngine, type TechniqueCatalog } from '../sudoku/engine'
import { completeCandidateMasks, hintEliminations, isSolved, valuesOf, type Game } from '../sudoku/game'
import { techniqueLabel } from '../sudoku/hints'
import { addAnalysisAssistance } from '../sudoku/player-rating'
import { roomStore } from '../sudoku/storage'
import { analysisGroupsForCatalog, filterAnalysisGroups, techniqueTargetCount, type AnalysisGroup } from '../sudoku/puzzle-analysis'
import { Modal } from './Modal'

const SCAN_DELAY_MS = 180

type ScanResult = { count: number } | { error: string }
type ScanProgress = { key: string; results: Record<string, ScanResult> }

let catalogRequest: Promise<TechniqueCatalog> | undefined
function loadCatalog() {
  return catalogRequest ??= runEngine({ type: 'techniques' }).catch((error: unknown) => {
    catalogRequest = undefined
    throw error
  })
}

function AnalysisTable({
  groups, results, solved, onSelectTechnique,
}: { groups: readonly AnalysisGroup[]; results: Readonly<Record<string, ScanResult>>; solved: boolean; onSelectTechnique?: (technique: string) => void }) {
  return (
    <table className="analysis-table" aria-label="Available candidates by technique">
      <thead>
        <tr><th scope="col">Technique</th><th scope="col">Candidates</th></tr>
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
                        {techniqueLabel(technique)}
                      </button>
                    : techniqueLabel(technique)}
                </th>
                <td className={count === 0 ? 'analysis-zero' : undefined}>
                  {count !== null ? count
                    : result && 'error' in result
                      ? <span className="analysis-failed" title={result.error} aria-label={`${techniqueLabel(technique)} scan failed`}>Unavailable</span>
                      : <span className="analysis-pending" aria-label={`Scanning ${techniqueLabel(technique)}`}>
                          <LoaderCircle size={15} className="analysis-spinner" aria-hidden="true" />
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

/** Scan one technique at a time on the dedicated technique worker. Each
 * result appears immediately, and obsolete positions never queue 72 jobs.
 * The game worker stays free for input, hints, and candidate updates.
 */
export function PuzzleAnalysisContents({ game, active = true, onSelectTechnique }: {
  game: Game; active?: boolean; onSelectTechnique?: (technique: string) => void
}) {
  const values = valuesOf(game)
  const solved = isSolved(game)
  const eliminationMasks = useMemo(() => hintEliminations(values, completeCandidateMasks(game), game.position.eliminations),
    [values, game.position.center, game.position.corner, game.position.eliminations])
  const eliminationKey = eliminationMasks?.join(',') ?? ''
  const snapshotKey = `${game.id}:${values}:${eliminationKey}`
  const [catalog, setCatalog] = useState<TechniqueCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [scan, setScan] = useState<ScanProgress | null>(null)
  const [retry, setRetry] = useState(0)
  const [hideZero, setHideZero] = useState(false)

  useEffect(() => {
    if (!active) return
    let current = true
    setCatalogError(null)
    void loadCatalog().then((found) => {
      if (current) setCatalog(found)
    }).catch((reason: unknown) => {
      if (current) setCatalogError(reason instanceof Error ? reason.message : 'Could not load techniques.')
    })
    return () => { current = false }
  }, [active, retry])

  const groups = useMemo(() => analysisGroupsForCatalog(catalog?.techniques ?? []), [catalog])

  useEffect(() => {
    if (!active || solved || !catalog) return
    let current = true
    const timer = window.setTimeout(() => {
      // Prefer inexpensive deductions first so long-running forcing and Kraken
      // searches never delay the basic counts.
      const techniques = [...catalog.techniques].sort((left, right) => left.cost - right.cost)
        .map(({ id }) => id)
      setScan({ key: snapshotKey, results: {} })
      let recorded = false
      void (async () => {
        for (const technique of techniques) {
          if (!current) return
          try {
            const matches = await runEngine({
              type: 'deductions', values, eliminations: eliminationMasks, techniqueOrder: [technique],
            })
            if (!current) return
            setScan((previous) => previous?.key === snapshotKey
              ? { key: snapshotKey, results: { ...previous.results, [technique]: { count: techniqueTargetCount(matches, technique) } } }
              : previous)
            if (!recorded) {
              recorded = true
              // Reading any scan result makes this an assisted puzzle. Do not
              // mark a different position if the user moved while scanning.
              roomStore.update(game.id, (latest) => {
                if (latest.source === 'draft' || latest.variant || isSolved(latest) || valuesOf(latest) !== values) return latest
                const masks = hintEliminations(values, completeCandidateMasks(latest), latest.position.eliminations)
                if ((masks?.join(',') ?? '') !== eliminationKey) return latest
                const attempt = latest.ratingAttempt
                const ratingAttempt = attempt && addAnalysisAssistance(attempt)
                return latest.analysisUsed && ratingAttempt === attempt ? latest
                  : { ...latest, analysisUsed: true, ratingAttempt }
              })
            }
          } catch (reason) {
            if (!current) return
            const error = reason instanceof Error ? reason.message : 'This technique could not be scanned.'
            setScan((previous) => previous?.key === snapshotKey
              ? { key: snapshotKey, results: { ...previous.results, [technique]: { error } } }
              : previous)
          }
        }
      })()
    }, SCAN_DELAY_MS)
    return () => { current = false; window.clearTimeout(timer) }
  }, [active, solved, catalog, groups, snapshotKey, values, eliminationKey, retry])

  const results = scan?.key === snapshotKey ? scan.results : {}
  const completed = Object.keys(results).length
  const total = groups.reduce((count, group) => count + group.techniques.length, 0)
  const visibleGroups = filterAnalysisGroups(groups, results, hideZero, solved)

  return (
    <div className="puzzle-analysis-content">
      {catalogError && <div role="alert" className="analysis-error">
        <p>{catalogError}</p>
        <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>Try again</button>
      </div>}
      {catalog && <>
        <label className="analysis-zero-filter">
          <input type="checkbox" checked={hideZero} onChange={(event) => setHideZero(event.target.checked)} />
          Hide techniques with 0 candidates
        </label>
        {visibleGroups.length
          ? <AnalysisTable groups={visibleGroups} results={results} solved={solved} onSelectTechnique={onSelectTechnique} />
          : <p className="analysis-empty" role="status">No techniques with candidates.</p>}
        {!solved && completed === total && Object.values(results).some((result) => 'error' in result) &&
          <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>Retry failed scans</button>}
      </>}
    </div>
  )
}

export function PuzzleAnalysisCard({ game, close, onSelectTechnique }: {
  game: Game; close: () => void; onSelectTechnique?: (technique: string) => void
}) {
  return (
    <section className="surface puzzle-analysis-card" aria-label="Available techniques">
      <div className="puzzle-analysis-card-heading">
        <h2>Available techniques</h2>
        <button type="button" className="icon-button borderless" onClick={close} aria-label="Close available techniques card"
          title="Close card"><X size={18} /></button>
      </div>
      <div className="puzzle-analysis-card-body">
        <PuzzleAnalysisContents game={game} onSelectTechnique={onSelectTechnique} />
      </div>
    </section>
  )
}

export function PuzzleAnalysis({ game, close, onSelectTechnique }: {
  game: Game; close: () => void; onSelectTechnique?: (technique: string) => void
}) {
  return (
    <Modal title="Available techniques" onClose={close} className="puzzle-analysis-dialog">
      <PuzzleAnalysisContents game={game} onSelectTechnique={onSelectTechnique} />
    </Modal>
  )
}
