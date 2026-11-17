import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { runEngine } from '../sudoku/engine'
import { completeCandidateMasks, hintEliminations, isSolved, valuesOf, type Game } from '../sudoku/game'
import { techniqueLabel } from '../sudoku/hints'
import { addAnalysisAssistance } from '../sudoku/player-rating'
import { roomStore } from '../sudoku/storage'
import { ANALYSIS_GROUPS, ANALYSIS_TECHNIQUES, summarizeDeductions, type TechniqueSummary } from '../sudoku/puzzle-analysis'
import { Modal } from './Modal'

const SCAN_DELAY_MS = 180

function AnalysisTable({ findings }: { findings: readonly TechniqueSummary[] }) {
  const counts = new Map(findings.map((finding) => [finding.technique, finding]))
  return (
    <table className="analysis-table" aria-label="Available candidates by technique">
      <thead>
        <tr><th scope="col">Technique</th><th scope="col">Candidates</th></tr>
      </thead>
      {ANALYSIS_GROUPS.map((group) => (
        <tbody key={group.title}>
          <tr className="analysis-section-row">
            <th scope="rowgroup" colSpan={2}>
              {group.title}<span className="analysis-section-kind"> · {group.kind === 'placements' ? 'placements' : 'removals'}</span>
            </th>
          </tr>
          {group.techniques.map((technique) => {
            const count = counts.get(technique)?.[group.kind].length ?? 0
            return (
              <tr key={technique} className="analysis-data-row">
                <th scope="row">{techniqueLabel(technique)}</th>
                <td className={count === 0 ? 'analysis-zero' : undefined}>{count}</td>
              </tr>
            )
          })}
        </tbody>
      ))}
    </table>
  )
}

/** Scans are only requested while the view is visible. Older results cannot
 * overwrite a newer position, and rapid edits are combined into one scan. */
export function PuzzleAnalysisContents({ game, active = true }: { game: Game; active?: boolean }) {
  const values = valuesOf(game)
  const solved = isSolved(game)
  const eliminationMasks = useMemo(() => hintEliminations(values, completeCandidateMasks(game), game.position.eliminations),
    [values, game.position.center, game.position.corner, game.position.eliminations])
  const eliminationKey = eliminationMasks?.join(',') ?? ''
  const snapshotKey = `${game.id}:${values}:${eliminationKey}`
  const [scan, setScan] = useState<{ key: string; findings: TechniqueSummary[] } | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!active || solved) return
    let current = true
    setError(null)
    const timer = window.setTimeout(() => {
      void runEngine({
        type: 'deductions', values, eliminations: eliminationMasks,
        techniqueOrder: ANALYSIS_TECHNIQUES,
      }).then((matches) => {
        if (!current) return
        setScan({ key: snapshotKey, findings: summarizeDeductions(matches) })
        // Viewing the counts is assistance. Record once, even when the
        // puzzle's difficulty rating has not finished loading.
        roomStore.update(game.id, (latest) => {
          if (latest.source === 'draft' || latest.variant || isSolved(latest) || valuesOf(latest) !== values) return latest
          const masks = hintEliminations(values, completeCandidateMasks(latest), latest.position.eliminations)
          if ((masks?.join(',') ?? '') !== eliminationKey) return latest
          const attempt = latest.ratingAttempt
          const ratingAttempt = attempt && addAnalysisAssistance(attempt)
          return latest.analysisUsed && ratingAttempt === attempt ? latest
            : { ...latest, analysisUsed: true, ratingAttempt }
        })
      }).catch((reason: unknown) => {
        if (current) setError({ key: snapshotKey, message: reason instanceof Error ? reason.message : 'The scan could not finish.' })
      })
    }, SCAN_DELAY_MS)
    return () => { current = false; window.clearTimeout(timer) }
  }, [active, solved, game.id, values, eliminationKey, snapshotKey, retry])

  if (solved) return <p className="analysis-empty">Puzzle solved.</p>
  const findings = active && scan?.key === snapshotKey ? scan.findings : null
  const failure = active && error?.key === snapshotKey ? error.message : null

  return (
    <div className="puzzle-analysis-content">
      {!findings && !failure && <p className="dialog-status" role="status">Updating candidate counts…</p>}
      {failure && <div role="alert" className="analysis-error">
        <p>{failure}</p>
        <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>Try again</button>
      </div>}
      {findings && <AnalysisTable findings={findings} />}
    </div>
  )
}

export function PuzzleAnalysisCard({ game, close }: { game: Game; close: () => void }) {
  return (
    <section className="surface puzzle-analysis-card" aria-label="Available techniques">
      <div className="puzzle-analysis-card-heading">
        <h2>Available techniques</h2>
        <button type="button" className="icon-button borderless" onClick={close} aria-label="Close available techniques card"
          title="Close card"><X size={18} /></button>
      </div>
      <div className="puzzle-analysis-card-body">
        <PuzzleAnalysisContents game={game} />
      </div>
    </section>
  )
}

export function PuzzleAnalysis({ game, close }: { game: Game; close: () => void }) {
  return (
    <Modal title="Available techniques" onClose={close} className="puzzle-analysis-dialog">
      <PuzzleAnalysisContents game={game} />
    </Modal>
  )
}
