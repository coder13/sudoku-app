import { useEffect, useMemo, useState } from 'react'
import { runEngine, type Candidate } from '../sudoku/engine'
import { completeCandidateMasks, hintEliminations, isSolved, valuesOf, type Game } from '../sudoku/game'
import { techniqueLabel } from '../sudoku/hints'
import { addAnalysisAssistance } from '../sudoku/player-rating'
import { roomStore } from '../sudoku/storage'
import { ANALYSIS_GROUPS, ANALYSIS_TECHNIQUES, summarizeDeductions, summarizeGroup, type TechniqueSummary } from '../sudoku/puzzle-analysis'
import { Modal } from './Modal'

function candidateLocation({ cell, digit }: Candidate, placement: boolean) {
  const address = `r${Math.floor(cell / 9) + 1}c${cell % 9 + 1}`
  return placement ? `${address} = ${digit}` : `${address}: remove ${digit}`
}

function Targets({ label, targets, placement }: { label: string; targets: readonly Candidate[]; placement: boolean }) {
  if (targets.length === 0) return null
  return (
    <div className="analysis-targets">
      <h4>{label}</h4>
      <ul>{targets.slice(0, 24).map((target) =>
        <li key={`${target.cell}:${target.digit}`}>{candidateLocation(target, placement)}</li>)}</ul>
      {targets.length > 24 && <p>And {targets.length - 24} more.</p>}
    </div>
  )
}

function countLabel(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

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
        <p className="analysis-intro">These are the placements and candidate removals available in the current grid, without making any moves.</p>
        <p className="analysis-rating-notice">Using this scan counts as assisted play. This puzzle has one-quarter the normal weight in your player rating and cannot increase your rating or advance Auto difficulty.</p>
        {findings === null && !error && <p className="dialog-status" role="status">Checking {ANALYSIS_TECHNIQUES.length} techniques…</p>}
        {error && <div role="alert" className="analysis-error">
          <p>{error}</p>
          <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>Try again</button>
        </div>}
        {findings !== null && <>
          {ANALYSIS_GROUPS.map((group) => {
            const rows = group.techniques.flatMap((technique) => {
              const row = findings.find((finding) => finding.technique === technique)
              return row ? [row] : []
            })
            const totals = summarizeGroup(rows)
            return <section key={group.title} className="analysis-group">
              <div className="analysis-group-heading">
                <h3>{group.title}</h3>
                <span>{countLabel(totals.placements, 'placement')} · {countLabel(totals.removals, 'removal')}</span>
              </div>
              {rows.length === 0
                ? <p className="analysis-empty">No moves found.</p>
                : <div className="analysis-techniques">{rows.map((row) => (
                  <details key={row.technique} className="analysis-technique">
                    <summary>
                      <strong>{techniqueLabel(row.technique)}</strong>
                      <span>{countLabel(row.placements.length, 'placement')} · {countLabel(row.removals.length, 'removal')}</span>
                    </summary>
                    <div className="analysis-technique-details">
                      <Targets label="Place digits" targets={row.placements} placement />
                      <Targets label="Remove candidates" targets={row.removals} placement={false} />
                    </div>
                  </details>
                ))}</div>}
            </section>
          })}
          <p className="analysis-footnote">Counts are distinct targets within each technique or group. The same target can appear in more than one group. This quick scan does not include deep chains or forcing nets.</p>
        </>}
      </div>
    </Modal>
  )
}
