import { useEffect, useMemo, useState } from 'react'
import type { Candidate } from '../sudoku/engine'
import {
  chainColor, initialChainSketch, MAX_CHAIN_HISTORY, newChainSketch, nextChainId, removeUnavailableChains, savePrunedChains, undoChainEdit, updateChainEdges,
  type ChainColor, type ChainColorPair, type ChainSketch, type ChainSketchState,
} from '../sudoku/chain-sketch'
import {
  candidateId, chainCandidate, chainComponents, chainGroup, chainNodeCandidates, chainNodeDigit, chainPoint, completeChainLoop, completeMedusa, sameEdge, weakLinkRun,
  type ChainAnalysis, type ChainEdge, type ChainGraph, type ChainGroup, type ChainNode, type LinkStrength,
} from '../sudoku/chains'
import type { Game } from '../sudoku/game'
import { cellName } from '../sudoku/lesson-diagram'
import { applicableChainActions, analyzeChainSketches, drawnChainEdges, visibleChainActions, type ChainProof } from '../sudoku/chain-sketch-analysis'
import { roomStore } from '../sudoku/storage'
import type { BoardLink } from './BoardAnnotations'
import { usePlayPreference } from './usePlayPreference'
import { buildChainSketchAnnotations } from './play/chain-sketch-annotations'

type ChainRedo = {
  gameId: string
  position: Game['position']
  sketches: ChainSketchState['sketches']
  activeId: number
  future: ChainSketchState[]
}
const weakLinkStatus = 'A path can have at most two weak links in a row.'
const EMPTY_GROUP_SELECTION: number[] = []

export function useChainSketch(game: Game, graph: ChainGraph | null, { canDraw, graphCurrent, canAnalyze, startHighlightDigit, drawingIntent, setDrawingIntent, updateGame }: {
  canDraw: boolean; graphCurrent: boolean; canAnalyze: boolean; startHighlightDigit: number | null
  drawingIntent: boolean | null; setDrawingIntent: (intent: boolean) => void
  updateGame?: (change: (current: Game) => Game) => void
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [groupSelection, setGroupSelection] = useState<number[] | null>(null)
  const [previewedProof, setPreviewedProof] = useState<ChainProof | null>(null)
  const [redoHistory, setRedoHistory] = useState<ChainRedo | null>(null)
  const [eliminationVisibility, setEliminationVisibility] = useState<{ gameId: string; shown: boolean }>(() => ({ gameId: game.id, shown: false }))
  const showEliminations = eliminationVisibility.gameId === game.id && eliminationVisibility.shown
  useEffect(() => {
    setEliminationVisibility(current => current.gameId === game.id ? current : { gameId: game.id, shown: false })
  }, [game.id])
  const [colorPairs] = usePlayPreference('chainColorPairs')
  const emptySketch = useMemo(() => ({ ...initialChainSketch, sketches: [newChainSketch(1, colorPairs)] }), [colorPairs])
  const savedSketch = game.chainSketch ?? emptySketch
  const { sketches, activeId, pending } = savedSketch
  const active = sketches.find(({ id }) => id === activeId) ?? sketches[0]
  const edges = active.history.at(-1)!
  const enabled = canDraw && canAnalyze && Boolean(graph)
  const drawing = enabled && (drawingIntent ?? pending !== null)
  const allDrawnEdges = useMemo(() => drawnChainEdges(sketches, active.id), [sketches, active.id])
  const grouping = drawing && groupSelection !== null
  const selectedGroup = useMemo(() => {
    if (!grouping || groupSelection.length < 2 || !graph) return null
    const candidates = groupSelection.map(chainCandidate)
    const group = chainGroup(candidates[0].digit, candidates.map(({ cell }) => cell))
    return group && graph.available(group) ? group : null
  }, [grouping, groupSelection, graph])
  const groups = useMemo(() => [...new Set([...allDrawnEdges.flat(), ...(pending === null ? [] : [pending])])]
    .filter((node): node is ChainGroup => typeof node === 'string' && Boolean(graph?.available(node))), [allDrawnEdges, pending, graph])
  const exceedsWeakLinkLimit = useMemo(() => graph && weakLinkRun(graph, allDrawnEdges), [graph, allDrawnEdges])

  const analyzed = useMemo(() => graph ? analyzeChainSketches(graph, sketches) : [], [graph, sketches])
  const activeAnalysis = analyzed.find(({ id }) => id === active.id)
  const applicable = useMemo(() => applicableChainActions(analyzed, canAnalyze), [analyzed, canAnalyze])
  const visibleApplicable = useMemo(() => visibleChainActions(analyzed, applicable, showEliminations), [analyzed, applicable, showEliminations])
  const loopCompletions = useMemo(() => {
    const completions = new Map<ChainAnalysis, ChainEdge[]>()
    if (!graph || !canAnalyze || !activeAnalysis || activeAnalysis.hidden) return completions
    const drawnNodes = edges.flat()
    for (const chain of activeAnalysis.chains) {
      if (!chain.canComplete) continue
      const otherNodes = new Set(drawnNodes)
      for (const node of chain.nodes) otherNodes.delete(node)
      const result = completeChainLoop(graph, chain.nodes, otherNodes, groups)
      if (result.status === 'found' && !result.edges.some(weakLinkRun(graph, [...allDrawnEdges, ...result.edges]))) {
        completions.set(chain, result.edges)
      }
    }
    return completions
  }, [graph, canAnalyze, activeAnalysis, edges, allDrawnEdges, groups])
  const linkTargets = useMemo(() => {
    const targets = new Map<ChainNode, LinkStrength>()
    if (!graph || !drawing || active.hidden || pending === null) return targets
    for (const candidate of [...graph.candidates, ...groups]) {
      const edge: ChainEdge = [pending, candidate]
      if (edges.some((existing) => sameEdge(edge, existing))) continue
      const strength = graph.strength(...edge)
      if (strength && !exceedsWeakLinkLimit?.(edge)) targets.set(candidate, strength)
    }
    return targets
  }, [graph, drawing, pending, edges, active.hidden, exceedsWeakLinkLimit, groups])
  const strongExtension = useMemo(() => graph && drawing && !active.hidden && pending !== null
    ? completeMedusa(graph, edges, pending, groups) : [], [graph, drawing, active.hidden, pending, edges, groups])

  useEffect(() => {
    setHovered(null)
    setStatus('')
    setGroupSelection(null)
  }, [game.id])

  useEffect(() => {
    if (!drawing) {
      setHovered(null)
      setGroupSelection(null)
    }
  }, [drawing])

  useEffect(() => {
    const saved = game.chainSketch
    if (!graph || !graphCurrent || !saved) return
    const pruned = removeUnavailableChains(saved, (node) => !graph.available(node),
      edges => edges.some(edge => !edge.every(node => graph.available(node))))
    const next = pruned.pending !== null && !graph.available(pruned.pending) ? { ...pruned, pending: null } : pruned
    if (next === saved) return
    roomStore.update(game.id, (current) => current.chainSketch === saved &&
      current.givens === game.givens && current.position.entries === game.position.entries &&
      current.position.center === game.position.center && current.position.corner === game.position.corner &&
      current.position.eliminations === game.position.eliminations
      ? savePrunedChains(current, next, current.future.length === 0) : current)
  }, [game.id, game.chainSketch, game.givens, game.position, graph, graphCurrent])

  const committed = useMemo(() => buildChainSketchAnnotations({
    sketches: analyzed, activeId: active.id, activeHidden: active.hidden, activeAnalysis, canAnalyze,
    pending, colorPairs, previewedProof, showEliminations, grouping, groupSelection,
  }), [analyzed, active.id, active.hidden, activeAnalysis, canAnalyze, pending, colorPairs, previewedProof, showEliminations, grouping, groupSelection])

  const preview = useMemo<BoardLink | undefined>(() => {
    if (grouping || pending === null || hovered === null) return
    const strength = linkTargets.get(hovered)
    if (!strength) return
    return {
      from: chainPoint(pending), to: chainCandidate(hovered), color: 'var(--chain-neutral)', dashed: strength === 'weak',
    }
  }, [pending, hovered, linkTargets, grouping])

  function save(change: (state: ChainSketchState, current: Game) => ChainSketchState) {
    const update = (current: Game) => {
      const saved = current.chainSketch ?? emptySketch
      const chainSketch = change(saved, current)
      return chainSketch === saved ? current : { ...current, chainSketch }
    }
    if (updateGame) updateGame(update)
    else roomStore.update(game.id, update)
  }

  function redoFor(current: Game, state: ChainSketchState) {
    // A snapshot can restore links and merged sketches as long as the board and drawing still match.
    return redoHistory?.gameId === current.id && redoHistory.position === current.position &&
      redoHistory.sketches === state.sketches && redoHistory.activeId === state.activeId ? redoHistory : null
  }

  function updateActive(update: (sketch: ChainSketch) => ChainSketch, endpoint?: ChainNode | null,
    requireCurrentPath = false) {
    save((state) => {
      if (state.activeId !== active.id) return state
      const current = state.sketches.find(({ id }) => id === active.id)!
      if (requireCurrentPath && (current.history.at(-1) !== edges || state.pending !== pending)) return state
      const next = update(current)
      const nextPending = endpoint === undefined ? state.pending : endpoint
      if (next === current && nextPending === state.pending) return state
      return { ...state, pending: nextPending,
        sketches: next === current ? state.sketches : state.sketches.map(sketch => sketch === current ? next : sketch) }
    })
  }

  function setHighlightedDigit(digit: number | null) {
    save((state) => {
      const current = state.sketches.find(({ id }) => id === state.activeId)!
      if (current.highlightedDigit === digit) return state
      return { ...state, sketches: state.sketches.map(sketch => sketch === current ? { ...sketch, highlightedDigit: digit } : sketch) }
    })
  }

  function endPath() {
    setGroupSelection(null)
    save((state) => state.pending === null ? state : { ...state, pending: null })
    setHovered(null)
    setStatus('')
  }

  function switchSketch(id: number) {
    setGroupSelection(null)
    save((state) => id === state.activeId || !state.sketches.some(sketch => sketch.id === id)
      ? state : { ...state, activeId: id, pending: null })
    setHovered(null)
    setStatus('')
  }

  function changeEdges(next: ChainEdge[], endpoint: ChainNode | null = null, highlightedDigit?: number, reveal = false) {
    const weakAdditions = graph ? next.filter(edge => graph.strength(...edge) === 'weak' &&
      !edges.some(existing => sameEdge(edge, existing))) : []
    save((state) => {
      if (state.activeId !== active.id || state.pending !== pending ||
        state.sketches.find(sketch => sketch.id === state.activeId)?.history.at(-1) !== edges) return state
      if (graph && weakAdditions.length && weakAdditions.some(weakLinkRun(graph, [...drawnChainEdges(state.sketches, active.id), ...weakAdditions]))) {
        return state
      }
      return updateChainEdges(state, next, endpoint, highlightedDigit, reveal)
    })
    setHovered(null)
  }

  function beginAt(candidate: Candidate, component: readonly ChainEdge[] = []) {
    if (!enabled) return
    const node = candidateId(candidate)
    const additions = component.filter(edge => !edges.some(existing => sameEdge(edge, existing)))
    setDrawingIntent(true)
    setGroupSelection(null)
    setHovered(null)
    setStatus('')
    if (additions.length) changeEdges([...edges, ...additions], node, candidate.digit, true)
    else updateActive(sketch => ({ ...sketch, hidden: false, highlightedDigit: candidate.digit }), node, true)
  }

  function selectNode(id: ChainNode) {
    if (!enabled || !drawing || !graph || active.hidden || !graph.available(id)) return false
    if (pending === id) {
      const remaining = edges.filter(edge => !edge.includes(id))
      if (remaining.length === edges.length - 1) {
        changeEdges(remaining)
        setStatus('Branch tip removed.')
        return true
      }
    }
    const digit = chainNodeDigit(id)
    const mark = (sketch: ChainSketch) => sketch.highlightedDigit === digit ? sketch : { ...sketch, highlightedDigit: digit }
    const name = chainNodeCandidates(id).map(candidate => `${candidate.digit} in ${cellName(candidate.cell)}`).join(' or ')
    const alreadyLinked = edges.some(edge => edge.includes(id))
    const link: ChainEdge | undefined = pending === null ? undefined : [pending, id]
    const strength = link && graph.strength(...link)
    const canLink = strength && !edges.some(edge => sameEdge(edge, link!)) && !exceedsWeakLinkLimit?.(link!)
    if (pending === null || pending === id || (alreadyLinked && !canLink)) {
      updateActive(mark, pending === id ? null : id)
      setHovered(null)
      setStatus('')
      return true
    }
    if (canLink && link) {
      changeEdges([...edges, link], id, digit)
      setStatus('')
      return true
    }
    if (link && exceedsWeakLinkLimit?.(link)) setStatus(weakLinkStatus)
    else {
      setHighlightedDigit(digit)
      setStatus(`No link to ${name}. Every candidate at one end must conflict with every candidate at the other end.`)
    }
    return false
  }

  function select(candidate: Candidate) {
    if (!enabled || !drawing || !graph || active.hidden) return
    const id = candidateId(candidate)
    if (!graph.available(id)) return
    if (!grouping) { selectNode(id); return }
    if (groupSelection.includes(id)) {
      setGroupSelection(groupSelection.filter(node => node !== id))
      setStatus('')
      return
    }
    if (groupSelection.length && chainNodeDigit(groupSelection[0]) !== candidate.digit) {
      setStatus('All candidates in a group must have the same digit.')
      return
    }
    const next = [...groupSelection, id]
    const group = next.length > 1 ? chainGroup(candidate.digit, next.map(node => chainCandidate(node).cell)) : null
    if (next.length > 1 && (!group || !graph.available(group))) {
      setStatus('All candidates in a group must share a row, column, box, or extra house.')
      return
    }
    setHighlightedDigit(candidate.digit)
    setGroupSelection(next)
    setHovered(null)
    setStatus('')
  }

  function finishLoop(chain: ChainAnalysis) {
    const extension = loopCompletions.get(chain)
    if (!extension) return
    setDrawingIntent(true)
    changeEdges([...edges, ...extension], null, drawing ? undefined : startHighlightDigit ?? undefined)
    setStatus('')
  }

  function stop() {
    setDrawingIntent(false)
    endPath()
  }

  return {
    drawing, grouping, groupSelection: grouping ? groupSelection : EMPTY_GROUP_SELECTION, groups,
    canUseGroup: selectedGroup !== null,
    startGroup() {
      if (!enabled || active.hidden) return
      setDrawingIntent(true)
      setGroupSelection([])
      setHovered(null)
      setStatus('')
    },
    cancelGroup() { setGroupSelection(null); setStatus('') },
    useGroup() {
      if (selectedGroup && selectNode(selectedGroup)) setGroupSelection(null)
    },
    selectGroup(group: ChainGroup) {
      setGroupSelection(null)
      selectNode(group)
    },
    annotations: preview ? { ...committed.annotations, links: [preview, ...(committed.annotations.links ?? [])] } : committed.annotations,
    colorPairs, assignedColors: committed.assigned, usedColorPairs: committed.usedPairs,
    sketches: analyzed, active, status, pending, beginAt, select, finishLoop, stop, endPath, setHighlightedDigit,
    suspend: () => { setDrawingIntent(false); setGroupSelection(null) },
    setPreviewedProof,
    showEliminations,
    toggleEliminations() {
      setEliminationVisibility(current => ({ gameId: game.id, shown: !(current.gameId === game.id && current.shown) }))
    },
    chains: canAnalyze ? activeAnalysis?.chains ?? [] : [],
    medusas: canAnalyze ? activeAnalysis?.medusas ?? [] : [],
    allActions: visibleApplicable.actions, appliedChainIds: visibleApplicable.chainIds,
    hasLinks: edges.length > 0,
    contains: (candidate: Candidate) => edges.some(edge => edge.some(node => chainNodeCandidates(node).some(member => candidateId(member) === candidateId(candidate)))),
    canUndo: active.history.length > 1,
    canRedo: redoFor(game, savedSketch) !== null,
    canFinishLoop: (chain: ChainAnalysis) => loopCompletions.has(chain),
    canExtendStrongLinks: strongExtension.length > 0,
    extendStrongLinks() {
      if (!strongExtension.length) return
      changeEdges([...edges, ...strongExtension], pending)
      setStatus('')
    },
    isLinkTarget: (candidate: Candidate) => grouping ? groupSelection.includes(candidateId(candidate)) : linkTargets.has(candidateId(candidate)),
    hover(candidate: Candidate | null) {
      setHovered(candidate && candidateId(candidate))
    },
    toggle() {
      if (drawing) stop()
      else if (enabled) {
        if (startHighlightDigit !== null) setHighlightedDigit(startHighlightDigit)
        setDrawingIntent(true)
        setStatus('')
      }
    },
    switchSketch,
    addSketch() {
      setGroupSelection(null)
      save((state) => {
        const current = state.sketches.find(({ id }) => id === state.activeId)!
        if (!current.history.at(-1)?.length) return state
        const empty = state.sketches.find(({ history }) => !history.at(-1)?.length)
        if (empty) return { ...state, activeId: empty.id, pending: null }
        const sketch = newChainSketch(nextChainId(state.sketches), colorPairs)
        return { ...state, sketches: [...state.sketches, sketch], activeId: sketch.id, pending: null }
      })
      setHovered(null)
      setStatus('')
    },
    toggleVisibility(id: number) {
      setGroupSelection(null)
      save((state) => {
        const target = state.sketches.find(sketch => sketch.id === id)
        if (!target || (!target.hidden && !target.history.at(-1)?.length)) return state
        return { ...state, pending: id === state.activeId ? null : state.pending,
          sketches: state.sketches.map(sketch => sketch === target ? { ...sketch, hidden: !sketch.hidden } : sketch) }
      })
      setHovered(null)
      setStatus('')
    },
    deleteSketch(id: number) {
      setGroupSelection(null)
      save((state) => {
        const index = state.sketches.findIndex((sketch) => sketch.id === id)
        if (index === -1) return state
        const sketches = state.sketches.filter((sketch) => sketch.id !== id)
        if (!sketches.length) return emptySketch
        return id === state.activeId ? { ...state, sketches, activeId: sketches[Math.min(index, sketches.length - 1)].id, pending: null }
          : { ...state, sketches }
      })
      setHovered(null)
      setStatus('')
    },
    setColors(color: ChainColor, secondColor: ChainColor) {
      updateActive((sketch) => ({ ...sketch, color, secondColor }))
    },
    undo() {
      setGroupSelection(null)
      save((state, current) => {
        if (state.activeId !== active.id) return state
        const next = undoChainEdit(state, drawing)
        if (next.sketches !== state.sketches) {
          const future = [...(redoFor(current, state)?.future ?? []), state].slice(-MAX_CHAIN_HISTORY)
          setRedoHistory({ gameId: current.id, position: current.position, sketches: next.sketches, activeId: next.activeId, future })
        }
        return next
      })
      setHovered(null)
      setStatus('')
    },
    redo() {
      setGroupSelection(null)
      save((state, current) => {
        const history = redoFor(current, state)
        if (!history) return state
        const restored = history.future.at(-1)!
        const future = history.future.slice(0, -1)
        setRedoHistory(future.length ? { ...history, sketches: restored.sketches, activeId: restored.activeId, future } : null)
        return drawing ? restored : { ...restored, pending: null }
      })
      setHovered(null)
      setStatus('')
    },
    clear() {
      setGroupSelection(null)
      changeEdges([])
      setStatus('')
    },
  }
}
