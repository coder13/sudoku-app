import { useEffect, useMemo, useState } from 'react'
import { runEngine } from '../sudoku/engine'
import { completeCandidateMasks, hintEliminations, isSolved, valuesOf, type Game } from '../sudoku/game'
import { techniqueLabel } from '../sudoku/hints'
import { addAnalysisAssistance } from '../sudoku/player-rating'
import { roomStore } from '../sudoku/storage'
import { ANALYSIS_GROUPS, ANALYSIS_TECHNIQUES, summarizeDeductions, type TechniqueSummary } from '../sudoku/puzzle-analysis'
import { Modal } from './Modal'

export function PuzzleAnalysis({ game, close }: { game: Game; close: () => void }) {
  const values = valuesOf(game)
  const eliminationMasks = useMemo(() => hintEliminations(values, completeCandidateMasks(game), game.position.eliminations),
    [values, game.position.center, game.position.corner, game.position.eliminations])
  const eliminationKey = eliminationMasks?.join(',') ?? ''
  const [findings, setFindings] = useState<TechniqueSummary[] | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setFindings(null)
    setError('')
    void runEngine({
      type: 'deductions', values, eliminations: eliminationMasks,
      techniqueOrder: ANALYSIS_TECHNIQUES,
    }).then((matches) => {
      if (!active) return
      setFindings(summarizeDeductions(matches))
      // A successful scan is assistance, even when no placements or removals are found.
      // Record it once per puzzle and only if the position is still current.
      roomStore.update(game.id, (current) => {
        if (current.source === 'draft' || current.variant || isSolved(current) || valuesOf(current) !== values) return current
        const latestMasks = hintEliminations(values, completeCandidateMasks(current), current.position.eliminations)
        if ((latestMasks?.join(',') ?? '') !== eliminationKey) return current
        const attempt = current.ratingAttempt
        const ratingAttempt = attempt && addAnalysisAssistance(attempt)
        return current.analysisUsed && ratingAttempt === attempt ? current
          : { ...current, analysisUsed: true, ratingAttempt }
      })
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'The scan could not finish.')
    })
    return () => { active = false }
  }, [game.id, values, eliminationKey, retry])

  return (
    <Modal title="Available techniques" onClose={close} className="puzzle-analysis-dialog">
      <div className="puzzle-analysis-content">
        {findings === null && !error && <p className="dialog-status" role="status">Checking {ANALYSIS_TECHNIQUES.length} techniques…</p>}
        {error && <div role="alert" className="analysis-error">
          <p>{error}</p>
          <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>Try again</button>
        </div>}
        {findings !== null && (
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
                  const count = findings.find((row) => row.technique === technique)?.[group.kind].length ?? 0
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
        )}
      </div>
    </Modal>
  )
}
