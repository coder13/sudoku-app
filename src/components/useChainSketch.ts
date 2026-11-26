import { useEffect, useMemo, useState } from 'react'
import type { Candidate } from '../sudoku/engine'
import {
  chainColor, currentSubsetProof, hasChainContent, initialChainSketch, MAX_CHAIN_HISTORY, newChainSketch,
  removeUnavailableChains, savePrunedChains, selectEmptyChain, undoChainEdit, updateChainEdges, updateSubsetChain,
  type ChainColor, type ChainColorPair, type ChainSketch, type ChainSketchState,
} from '../sudoku/chain-sketch'
import {
  candidateId, chainAlsId, chainCandidate, chainComponents, chainGroup, chainNodeCandidates, chainNodeDigit, chainPoint, completeChainLoop, completeMedusa, isAlsChainNode, sameEdge, weakLinkRun,
  type ChainAnalysis, type ChainEdge, type ChainGraph, type ChainNode, type LinkStrength,
} from '../sudoku/chains'
import type { Game } from '../sudoku/game'
import { cellName } from '../sudoku/lesson-diagram'
import { applicableChainActions, analyzeChainSketches, drawnChainEdges, visibleChainActions, type ChainProof } from '../sudoku/chain-sketch-analysis'
import { expandAlsPath, subsetChainChoices, subsetEndpointChoices } from '../sudoku/subset-proofs'
import { describeSubsets, EMPTY_SUBSET_WORKSPACE, type SubsetContext, type SubsetProof } from '../sudoku/subsets'
import { roomStore } from '../sudoku/storage'
import { mergeBoardAnnotations, type BoardLink } from './BoardAnnotations'
import { usePlayPreference } from './usePlayPreference'
import { buildChainSketchAnnotations } from './play/chain-sketch-annotations'
import { buildSubsetChainAnnotations, type SubsetChainFocus } from './play/subset-chain-annotations'

export type ChainNotationPart = { sketchId: number; pathIndex: number; kind: 'node' | 'edge'; index: number }

export type ChainLinkChoice = {
  label: string
  kind: 'candidate' | 'group' | 'set'
  run: () => void
}

type ChainRedo = {
  gameId: string
  position: Game['position']
  sketches: ChainSketchState['sketches']
  activeId: number
  future: ChainSketchState[]
}
const weakLinkStatus = 'A path can have at most two weak links in a row.'
const groupDigitStatus = 'All candidates in a group must have the same digit.'
const groupHouseStatus = 'All candidates in a group must share a row, column, box, or extra house.'
const EMPTY_GROUP_SELECTION: number[] = []

function inferenceLinks(graph: ChainGraph, edges: readonly ChainEdge[], pending: ChainNode, target: ChainNode): ChainEdge[] | undefined {
  if (pending === target || edges.some(edge => sameEdge(edge, [pending, target]))) return
  if (graph.alsCellLink(pending, target) !== undefined) return [[pending, target]]
  const previous = edges.filter(edge => edge.includes(pending)).at(-1)
  const justUsedStrong = previous && graph.strength(...previous) === 'strong'
  if (!isAlsChainNode(pending) || justUsedStrong) return justUsedStrong && graph.conflicts(pending, target) ? [[pending, target]] : undefined
  const exit = graph.alsNodes.get(chainAlsId(pending))?.get(chainNodeDigit(target))
  if (!exit || exit === pending) return
  const inside = exit === target || (typeof target === 'number' && graph.members(exit).includes(target))
  if (inside) return [[pending, exit]]
  if (graph.conflicts(exit, target)) return [[pending, exit], [exit, target]]
}

export function useChainSketch(game: Game, graph: ChainGraph | null, { canDraw, canErase, graphCurrent, canAnalyze, startHighlightDigit, drawingIntent, setDrawingIntent, updateGame, subsetContext }: {
  canDraw: boolean; canErase: boolean; graphCurrent: boolean; canAnalyze: boolean; startHighlightDigit: number | null
  drawingIntent: boolean | null; setDrawingIntent: (intent: boolean) => void
  updateGame?: (change: (current: Game) => Game) => void
  subsetContext?: SubsetContext
}) {
  const [eraserOn, setEraserOn] = useState(false)
  const [finishedSubsetPath, setFinishedSubsetPath] = useState<SubsetProof | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [hoveredNotation, setHoveredNotation] = useState<ChainNotationPart | null>(null)
  const [subsetFocus, setSubsetFocus] = useState<SubsetChainFocus | null>(null)
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
  const subsetProof = currentSubsetProof(active)
  const subsetPathFinished = subsetProof !== null && subsetProof === finishedSubsetPath
  const hasFixedSubsetColors = subsetProof?.kind === 'blossom' || subsetProof?.kind === 'pattern'
  const canDrawActive = canDraw && canAnalyze && Boolean(graph)
  const enabled = canDrawActive && !subsetProof
  const mixed = edges.some(edge => edge.some(isAlsChainNode))
  const eraserAvailable = canErase && canAnalyze && Boolean(graph)
  const erasing = eraserAvailable && eraserOn
  const drawing = !erasing && canDrawActive && (drawingIntent ?? pending !== null)
  const eraseTargets = useMemo(() => {
    const targets = new Map<number, ChainNode>()
    if (!erasing || active.hidden) return targets
    const nodes = new Set(edges.flat())
    if (pending !== null) nodes.add(pending)
    for (const node of nodes) {
      for (const candidate of chainNodeCandidates(node)) {
        const id = candidateId(candidate)
        if (node === id || !targets.has(id)) targets.set(id, node)
      }
    }
    return targets
  }, [erasing, active.hidden, edges, pending])
  const allDrawnEdges = useMemo(() => drawnChainEdges(sketches, active.id), [sketches, active.id])
  const grouping = enabled && drawing && groupSelection !== null
  const selectedGroup = useMemo(() => {
    if (!grouping || groupSelection.length < 2 || !graph) return null
    const candidates = groupSelection.map(chainCandidate)
    const group = chainGroup(candidates[0].digit, candidates.map(({ cell }) => cell))
    return group && graph.available(group) ? group : null
  }, [grouping, groupSelection, graph])
  const groups = useMemo(() => [...new Set([...allDrawnEdges.flat(), ...(pending === null ? [] : [pending])])]
    .filter(node => typeof node === 'string' && !isAlsChainNode(node) && Boolean(graph?.available(node))), [allDrawnEdges, pending, graph])
  const exceedsWeakLinkLimit = useMemo(() => graph && weakLinkRun(graph, allDrawnEdges), [graph, allDrawnEdges])

  const savedSets = (game.subsetWorkspace ?? EMPTY_SUBSET_WORKSPACE).sets
  const subsetSets = useMemo(() => subsetContext ? describeSubsets(savedSets, subsetContext) : [], [savedSets, subsetContext])
  const analyzed = useMemo(() => graph ? analyzeChainSketches(graph, sketches, subsetContext && { sets: subsetSets, context: subsetContext })
    : [], [graph, sketches, subsetContext, subsetSets])
  const activeAnalysis = analyzed.find(({ id }) => id === active.id)
  const subsetChoices = useMemo(() => {
    if (!subsetContext || !graph || !canAnalyze) return []
    if (subsetPathFinished || active.hidden) return subsetChainChoices(null, subsetSets, subsetContext)
    if (!edges.length) return subsetChainChoices(subsetProof, subsetSets, subsetContext,
      typeof pending === 'number' ? chainCandidate(pending) : undefined)
    const starts = pending === null ? subsetChainChoices(null, subsetSets, subsetContext) : []
    const paths = activeAnalysis?.paths
    if (mixed || paths?.length !== 1 || paths[0].strengths.length !== edges.length) return starts
    const { nodes } = paths[0]
    const path = pending === nodes[0] ? [...nodes].reverse() : nodes
    return [...subsetEndpointChoices(path, subsetSets, subsetContext, graph), ...starts]
  }, [subsetContext, graph, canAnalyze, active.hidden, activeAnalysis, edges.length, mixed, subsetProof, subsetPathFinished, subsetSets, pending])
  const directSubsetTargets = useMemo(() => {
    const targets = new Map<number, { set: number; proof: SubsetProof }[]>()
    const atStart = pending === null && (!subsetProof || subsetPathFinished || active.hidden)
    const followingPath = subsetProof?.kind === 'path' || (edges.length > 0 && pending !== null)
    if (!drawing || grouping || !graph || (!atStart && !followingPath)) return targets
    const existingMembers = atStart && !active.hidden
      ? new Set(allDrawnEdges.flat().flatMap(graph.members)) : undefined
    const byId = new Map(subsetSets.map(set => [set.id, set]))
    for (const { target, proof } of subsetChoices) {
      const set = target && byId.get(target.set)
      if (!target || !set || (atStart && proof.kind !== 'path')) continue
      for (const cell of set.cells) for (const id of graph.cellCandidates[cell]) {
        if (existingMembers?.has(id) || (target.digit !== undefined && chainNodeDigit(id) !== target.digit)) continue
        const choices = targets.get(id) ?? []
        choices.push({ set: set.id, proof })
        targets.set(id, choices)
      }
    }
    return targets
  }, [drawing, grouping, graph, active.hidden, allDrawnEdges, edges.length, pending, subsetProof, subsetPathFinished, subsetChoices, subsetSets])
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
    const targets = new Map<ChainNode, { from: ChainNode; to: ChainNode; strength: LinkStrength }>()
    if (!graph || !drawing || active.hidden || pending === null) return targets
    for (const candidate of [...graph.candidates, ...groups]) {
      const edge = isAlsChainNode(pending) ? inferenceLinks(graph, edges, pending, candidate)?.at(-1) : [pending, candidate] as const
      if (!edge) continue
      if (edges.some((existing) => sameEdge(edge, existing))) continue
      const strength = graph.strength(...edge)
      if (strength && !exceedsWeakLinkLimit?.(edge)) targets.set(candidate, { from: edge[0], to: edge[1], strength })
    }
    return targets
  }, [graph, drawing, pending, edges, active.hidden, exceedsWeakLinkLimit, groups])
  const strongExtension = useMemo(() => graph && drawing && !active.hidden && pending !== null && !isAlsChainNode(pending)
    ? completeMedusa(graph, edges, pending, groups) : [], [graph, drawing, active.hidden, pending, edges, groups])

  useEffect(() => {
    setEraserOn(false)
    setFinishedSubsetPath(null)
    setHovered(null)
    setHoveredNotation(null)
    setSubsetFocus(null)
    setStatus('')
    setGroupSelection(null)
  }, [game.id])

  useEffect(() => {
    if (!eraserAvailable) setEraserOn(false)
  }, [eraserAvailable])

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
    pending, colorPairs, previewedProof, showEliminations, grouping, groupSelection, hoveredNotation, sets: subsetSets,
  }), [analyzed, active.id, active.hidden, activeAnalysis, canAnalyze, pending, colorPairs, previewedProof, showEliminations, grouping, groupSelection, hoveredNotation, subsetSets])
  const subsetAnnotations = useMemo(() => canAnalyze && subsetContext
    ? buildSubsetChainAnnotations(analyzed, subsetSets, subsetContext, activeId, showEliminations, subsetFocus)
    : undefined, [canAnalyze, subsetContext, analyzed, subsetSets, activeId, showEliminations, subsetFocus])
  const annotations = useMemo(() => mergeBoardAnnotations(committed.annotations, subsetAnnotations)!, [committed, subsetAnnotations])

  const preview = useMemo<BoardLink | undefined>(() => {
    if (grouping || pending === null || hovered === null) return
    const target = linkTargets.get(hovered)
    if (!target) return
    return {
      from: chainPoint(target.from), to: chainPoint(target.to), color: 'var(--chain-neutral)', dashed: target.strength === 'weak',
      hideGroupOutlines: isAlsChainNode(target.from) || isAlsChainNode(target.to),
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

  function finishPath() {
    setFinishedSubsetPath(subsetProof)
    endPath()
  }

  function switchSketch(id: number) {
    setFinishedSubsetPath(null)
    setGroupSelection(null)
    save((state) => id === state.activeId || !state.sketches.some(sketch => sketch.id === id)
      ? state : { ...state, activeId: id, pending: null })
    setHovered(null)
    setSubsetFocus(null)
    setStatus('')
  }

  function changeSubset(proof: SubsetProof | null) {
    save((state, current) => {
      if (state.activeId !== active.id || state.pending !== pending || current.position !== game.position ||
        current.subsetWorkspace !== game.subsetWorkspace || (current.chainSketch ?? emptySketch) !== savedSketch) return state
      const startsSubsetPath = proof?.kind === 'path' && proof.sets.length === 1 && hasChainContent(active)
      return updateSubsetChain(startsSubsetPath ? selectEmptyChain(state, colorPairs) : state, proof)
    })
    setHovered(null)
    setSubsetFocus(null)
  }

  function changeEdges(next: ChainEdge[], endpoint: ChainNode | null = null, highlightedDigit?: number, reveal = false) {
    const weakAdditions = graph ? next.filter(edge => graph.strength(...edge) === 'weak' &&
      !edges.some(existing => sameEdge(edge, existing))) : []
    save((state) => {
      if (state.activeId !== active.id || state.pending !== pending ||
        state.sketches.find(sketch => sketch.id === state.activeId)?.history.at(-1) !== edges) return state
      if (graph && weakAdditions.length) {
        const otherEdges = drawnChainEdges(state.sketches, active.id).filter(edge => !edges.includes(edge))
        if (weakAdditions.some(weakLinkRun(graph, [...otherEdges, ...next]))) return state
      }
      return updateChainEdges(state, next, endpoint, highlightedDigit, reveal, colorPairs)
    })
    setHovered(null)
  }

  function continueSavedSetPath(target: ChainNode) {
    if (!graph || !drawing || active.hidden || !subsetProof ||
      (subsetProof.kind !== 'path' && subsetProof.kind !== 'endpoint')) return false
    const problem = activeAnalysis?.subset?.analysis.problem
    if (problem && problem !== 'needs-sets') return false
    const digit = chainNodeDigit(target)
    const path = expandAlsPath(subsetProof, digit, graph)
    if (!path) return false
    const { exit } = path
    const chosenInside = typeof target === 'number' && graph.members(exit).includes(target)
    if (!chosenInside && !graph.strength(exit, target)) return false
    const next: ChainEdge[] = chosenInside ? path.edges : [...path.edges, [exit, target]]
    changeEdges(next, chosenInside ? exit : target, digit)
    return true
  }

  function advanceInference(target: ChainNode, links: ChainEdge[]) {
    const endpoint = links.at(-1)![1]
    if (links.some(edge => edges.some(existing => sameEdge(edge, existing)))) return false
    changeEdges([...edges, ...links], endpoint, chainNodeDigit(target))
    return true
  }

  function startDetached(candidate: Candidate, links: readonly ChainEdge[] = []) {
    const node = candidateId(candidate)
    save((state) => {
      if (state !== savedSketch) return state
      const next = selectEmptyChain(state, colorPairs)
      if (links.length) return updateChainEdges(next, [...links], node, candidate.digit, true, colorPairs)
      return { ...next, pending: node, sketches: next.sketches.map(sketch => sketch.id === next.activeId
        ? { ...sketch, hidden: false, highlightedDigit: candidate.digit } : sketch) }
    })
  }

  function beginAt(candidate: Candidate, component: readonly ChainEdge[] = []) {
    if (!canDrawActive) return
    const node = candidateId(candidate)
    const additions = component.filter(edge => !edges.some(existing => sameEdge(edge, existing)))
    setDrawingIntent(true)
    setGroupSelection(null)
    setHovered(null)
    setStatus('')
    if (subsetProof || active.hidden) startDetached(candidate, component)
    else if (additions.length) changeEdges([...edges, ...additions], node, candidate.digit, true)
    else updateActive(sketch => ({ ...sketch, hidden: false, highlightedDigit: candidate.digit }), node, true)
  }

  function selectNode(id: ChainNode) {
    if (!enabled || !drawing || !graph || active.hidden || !graph.available(id)) return false
    if (pending === id) {
      const remaining = edges.filter(edge => !edge.includes(id))
      if (remaining.length === edges.length - 1) {
        changeEdges(remaining)
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

  function eraseCandidate(candidate: Candidate) {
    const node = eraseTargets.get(candidateId(candidate))
    if (node === undefined) return
    const remaining = edges.filter(edge => !edge.includes(node))
    if (remaining.length < edges.length) changeEdges(remaining, pending === node ? null : pending)
    else if (pending === node) endPath()
  }

  function select(candidate: Candidate) {
    if (!drawing || !graph) return
    const id = candidateId(candidate)
    if (!graph.available(id)) return
    if (active.hidden || subsetPathFinished || hasFixedSubsetColors) { startDetached(candidate); return }
    if (subsetProof) { continueSavedSetPath(id); return }
    if (mixed && pending === null && !grouping) {
      const ports = [...new Set(edges.flat().filter(isAlsChainNode))].filter(node => graph.members(node).includes(id))
      if (ports.length === 1) { selectNode(ports[0]); return }
    }
    if (pending !== null && isAlsChainNode(pending)) {
      const links = inferenceLinks(graph, edges, pending, id)
      if (links) advanceInference(id, links)
      return
    }
    if (!grouping) { selectNode(id); return }
    if (groupSelection.includes(id)) {
      setGroupSelection(groupSelection.filter(node => node !== id))
      setStatus('')
      return
    }
    if (groupSelection.length && chainNodeDigit(groupSelection[0]) !== candidate.digit) {
      setStatus(groupDigitStatus)
      return
    }
    const next = [...groupSelection, id]
    const group = next.length > 1 ? chainGroup(candidate.digit, next.map(node => chainCandidate(node).cell)) : null
    if (next.length > 1 && (!group || !graph.available(group))) {
      setStatus(groupHouseStatus)
      return
    }
    setHighlightedDigit(candidate.digit)
    setGroupSelection(next)
    setHovered(null)
    setStatus('')
  }

  function groupCandidate(candidate: Candidate) {
    if (!enabled || !drawing || !graph || active.hidden || pending !== null && isAlsChainNode(pending)) return
    const id = candidateId(candidate)
    if (!graph.available(id)) return
    if (grouping || pending === null) {
      select(candidate)
      return
    }
    const members = chainNodeCandidates(pending)
    if (members.some(({ digit }) => digit !== candidate.digit)) {
      setStatus(groupDigitStatus)
      return
    }
    if (members.some(({ cell }) => cell === candidate.cell)) return
    const group = chainGroup(candidate.digit, [...members.map(({ cell }) => cell), candidate.cell])
    if (!group || !graph.available(group)) {
      setStatus(groupHouseStatus)
      return
    }
    const links = edges.filter(edge => edge.includes(pending))
    if (!links.length) {
      updateActive(sketch => sketch, group, true)
    } else {
      const promote = ([from, to]: ChainEdge): ChainEdge =>
        [from === pending ? group : from, to === pending ? group : to]
      const replacements = links.map(promote)
      if (replacements.some(edge => !graph.strength(...edge))) {
        setStatus('This group would break an existing link.')
        return
      }
      const next = edges.map(edge => edge.includes(pending) ? promote(edge) : edge)
        .filter((edge, index, all) => all.findIndex(other => sameEdge(edge, other)) === index)
      const otherEdges = allDrawnEdges.filter(edge => !edges.includes(edge))
      if (replacements.some(weakLinkRun(graph, [...otherEdges, ...next]))) {
        setStatus(weakLinkStatus)
        return
      }
      changeEdges(next, group, candidate.digit)
    }
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

  function savedSetLinkChoices(graph: ChainGraph, candidate: Candidate, visibleSets: ReadonlySet<number> | undefined) {
    const id = candidateId(candidate)
    const choices: ChainLinkChoice[] = []
    const label = (set: number) => `Set ${subsetSets.find(item => item.id === set)?.number ?? set}`
    const directOptions = directSubsetTargets.get(id)?.filter(({ set }) => visibleSets?.has(set)) ?? []
    for (const { set, proof } of directOptions) {
      choices.push({ label: label(set), kind: 'set', run: () => changeSubset(proof) })
    }
    if (subsetPathFinished || active.hidden) return choices
    for (const set of visibleSets ?? []) {
      if (directOptions.some(option => option.set === set)) continue
      const node = graph.alsNodes.get(set)?.get(candidate.digit)
      if (!node || !graph.members(node).includes(id)) continue
      if (subsetProof?.kind === 'endpoint' && set !== subsetProof.set) {
        const path = expandAlsPath(subsetProof, candidate.digit, graph)
        if (path && graph.strength(path.exit, node)) {
          choices.push({ label: label(set), kind: 'set', run: () => continueSavedSetPath(node) })
        }
        continue
      }
      if (pending === null || subsetProof) continue
      const links = mixed || graph.alsCellLink(pending, node) !== undefined
        ? inferenceLinks(graph, edges, pending, node) : undefined
      if (links) choices.push({ label: label(set), kind: 'set', run: () => advanceInference(node, links) })
    }

    if (subsetProof?.kind === 'path' || subsetProof?.kind === 'endpoint') {
      const set = subsetProof.kind === 'path' ? subsetProof.sets.at(-1)! : subsetProof.set
      for (const [digit, port] of graph.alsNodes.get(set) ?? []) {
        if (graph.alsCellLink(port, id) === undefined) continue
        const path = subsetProof.kind === 'path' && subsetProof.sets.length === 1
          ? [] : expandAlsPath(subsetProof, digit, graph)?.edges
        if (!path) continue
        choices.push({ label: `${label(set)} · skip ${digit} to force ${candidate.digit}`, kind: 'set',
          run: () => changeEdges([...path, [port, id]], id, candidate.digit) })
      }
    }
    return choices
  }

  function candidateChoices(candidate: Candidate, visibleSets: ReadonlySet<number> | undefined): ChainLinkChoice[] {
    if (!drawing || grouping || !graph) return []
    const id = candidateId(candidate)
    const choices = savedSetLinkChoices(graph, candidate, visibleSets)
    if (pending === null || pending === id || subsetProof) return choices
    const direct: ChainEdge = [pending, id]
    const canAppend = (edge: ChainEdge) => !edges.some(existing => sameEdge(existing, edge)) && !exceedsWeakLinkLimit?.(edge)
    const ordinary = isAlsChainNode(pending)
      ? inferenceLinks(graph, edges, pending, id)?.at(-1)
      : graph.strength(...direct) && canAppend(direct) ? direct : undefined
    const groupLabel = (node: ChainNode) => chainNodeCandidates(node)
      .map(({ cell, digit }) => `${digit}${cellName(cell).toLowerCase()}`).join(' or ')
    const includeCandidate = () => choices.unshift({
      label: `Candidate ${groupLabel(id)}`, kind: 'candidate', run: () => select(candidate),
    })
    if (choices.length) {
      if (ordinary && choices.length > 1) includeCandidate()
      return choices
    }
    if (ordinary && graph.strength(...ordinary) === 'strong') return choices
    const sourceLabel = (from: ChainNode, to: ChainNode) => {
      const source = graph.patternSource(from, to)
      if (source?.kind === 'firework') return `Firework at ${cellName(source.pivot).toLowerCase()}`
      if (source?.kind === 'rectangle') return `Unique Rectangle ${source.digits.join('/')}`
      return 'Group'
    }
    const endpoints = new Set([...groups, ...graph.houseGroups()])
    if (!ordinary) for (const node of graph.patternLinks().get(pending)?.keys() ?? []) endpoints.add(node)
    for (const node of endpoints) {
      if (typeof node === 'number' || node === pending || !graph.members(node).includes(id)) continue
      const strength = graph.strength(pending, node)
      const edge: ChainEdge = [pending, node]
      if (!strength || !canAppend(edge)) continue
      if (ordinary && (strength !== 'strong' || graph.patternSource(...edge))) continue
      choices.push({ label: `${sourceLabel(...edge)} · ${groupLabel(node)}`, kind: 'group',
        run: () => advanceInference(node, [edge]) })
    }
    if (ordinary) {
      if (choices.length) includeCandidate()
      return choices
    }

    // A pattern link may join two multi-candidate groups. Treat the selected
    // candidate as a member of its group when the existing path can join it.
    if (typeof pending === 'number') for (const [from, targets] of graph.patternLinks()) {
      if (from === pending || typeof from === 'number' || !graph.members(from).includes(pending)) continue
      const promote = ([a, b]: ChainEdge): ChainEdge => [a === pending ? from : a, b === pending ? from : b]
      const upgraded = edges.map(promote)
      if (upgraded.some(edge => !graph.strength(...edge)) || new Set(upgraded.flat()).size < new Set(edges.flat()).size) continue
      for (const to of targets.keys()) {
        if (!graph.members(to).includes(id) || upgraded.some(edge => sameEdge(edge, [from, to]))) continue
        const fromLabel = groupLabel(from)
        choices.push({ label: `${sourceLabel(from, to)} · (${fromLabel}) = (${groupLabel(to)})`, kind: 'group',
          run: () => changeEdges([...upgraded, [from, to]], to, candidate.digit) })
      }
    }
    return choices
  }

  function stop() {
    setEraserOn(false)
    setDrawingIntent(false)
    endPath()
  }

  return {
    drawing, erasing, grouping, groupSelection: grouping ? groupSelection : EMPTY_GROUP_SELECTION,
    canEraseNodes: eraserAvailable && !active.hidden && (edges.length > 0 || pending !== null),
    eraseCandidate,
    isEraseTarget: (candidate: Candidate) => eraseTargets.has(candidateId(candidate)),
    stopErasing: () => setEraserOn(false),
    toggleErasing() {
      setEraserOn(!erasing)
      setGroupSelection(null)
      setHovered(null)
      setStatus('')
    },
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
    annotations: preview ? { ...annotations, links: [preview, ...(annotations.links ?? [])] } : annotations,
    hasSubsetAnnotations: Boolean(subsetAnnotations) || analyzed.some(sketch => !sketch.hidden && sketch.edges.some(edge => edge.some(isAlsChainNode))),
    highlightNotation(part: ChainNotationPart | null) { setHoveredNotation(part) },
    highlightSubsetNotation: setSubsetFocus,
    subsetSets, subsetChoices, changeSubset,
    hasFixedSubsetColors,
    canEndPath: drawing && (pending !== null || (subsetProof !== null && !subsetPathFinished)),
    finishPath,
    candidateChoices,
    colorPairs, assignedColors: committed.assigned, usedColorPairs: committed.usedPairs,
    sketches: analyzed, active, status, pending, beginAt, select, groupCandidate, finishLoop, stop, setHighlightedDigit,
    suspend: () => { setEraserOn(false); setDrawingIntent(false); setGroupSelection(null) },
    setPreviewedProof,
    showEliminations,
    toggleEliminations() {
      setEliminationVisibility(current => ({ gameId: game.id, shown: !(current.gameId === game.id && current.shown) }))
    },
    chains: canAnalyze ? activeAnalysis?.chains ?? [] : [],
    medusas: canAnalyze ? activeAnalysis?.medusas ?? [] : [],
    allActions: visibleApplicable.actions, appliedChainIds: visibleApplicable.chainIds,
    hasLinks: hasChainContent(active),
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
      else if (canDrawActive) {
        if (startHighlightDigit !== null) setHighlightedDigit(startHighlightDigit)
        setDrawingIntent(true)
        setStatus('')
      }
    },
    switchSketch,
    toggleVisibility(id: number) {
      setGroupSelection(null)
      save((state) => {
        const target = state.sketches.find(sketch => sketch.id === id)
        if (!target || (!target.hidden && !hasChainContent(target))) return state
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
        const next = undoChainEdit(state, drawing || erasing)
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
        return drawing || erasing ? restored : { ...restored, pending: null }
      })
      setHovered(null)
      setStatus('')
    },
    clear() {
      setGroupSelection(null)
      if (subsetProof) changeSubset(null)
      else changeEdges([])
      setStatus('')
    },
  }
}
