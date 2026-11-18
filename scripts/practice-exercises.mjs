const topicNames = {
  pointing: 'Locked candidates (pointing)',
  claiming: 'Locked candidates (claiming)',
  'als-xz': 'ALS-XZ',
  'als-xy-wing': 'ALS-XY-Wing',
  'als-chain': 'ALS chain',
  'sue-de-coq': 'Sue de Coq',
  'sk-loop': 'SK loop',
}

export function buildPracticeTopics(techniques, content) {
  const titles = new Map(content.groups.flatMap(({ lessons }) => lessons.flatMap(({ blocks }) =>
    blocks.filter((block) => block.type === 'practice').flatMap(({ drills }) =>
      drills.map(({ example, title }) => [example, title]),
    ),
  )))
  return Object.fromEntries(techniques.map(({ id, difficulty }) => {
    const fallback = id.charAt(0).toUpperCase() + id.slice(1).replaceAll('-', ' ')
    const title = titles.get(id)
    const name = topicNames[id] ?? (title && id.startsWith('unique-rectangle-') ? `Unique Rectangle ${title}` : title) ?? fallback
    return [id, { name, difficulty }]
  }))
}

function remapPosition(exercise, symmetry, shift) {
  const cellAt = (cell) => {
    const row = Math.floor(cell / 9)
    const column = cell % 9
    return [cell, (8 - row) * 9 + (8 - column), column * 9 + row, column * 9 + (8 - row)][symmetry]
  }
  const digitAt = (digit) => digit === 0 ? 0 : (digit - 1 + shift) % 9 + 1
  const remap = (source, convert) => {
    const output = Array(81)
    Array.from(source).forEach((item, cell) => { output[cellAt(cell)] = convert(item) })
    return output
  }
  const maskAt = (mask) => {
    let result = 0
    for (let digit = 1; digit <= 9; digit++) {
      if (mask & (1 << (digit - 1))) result |= 1 << (digitAt(digit) - 1)
    }
    return result
  }
  const kind = 'place' in exercise.suggestion ? 'place' : 'eliminate'
  const { cell, digit } = exercise.suggestion[kind]
  return {
    givens: remap(exercise.givens, (digit) => digitAt(Number(digit))).join(''),
    entries: remap(exercise.entries, (digit) => digitAt(Number(digit))).join(''),
    eliminations: remap(exercise.eliminations, maskAt),
    candidates: remap(exercise.candidates, maskAt),
    suggestion: { [kind]: { cell: cellAt(cell), digit: digitAt(digit) } },
  }
}

export function buildPracticeExercises(request, techniqueIds, mixedPositions) {
  const examples = new Map(techniqueIds.map((technique) => [
    technique, request({ type: 'practice-examples', technique }),
  ]))
  const candidates = [...mixedPositions, ...Array.from(examples.values()).flat()]
  return Object.fromEntries(techniqueIds.map((technique) => {
    const sources = examples.get(technique).slice()
    const sourceGivens = new Set(sources.map(({ givens }) => givens))
    const disabledTechniques = techniqueIds.filter((id) => id !== technique)
    for (const position of candidates) {
      if (sources.length >= 5) break
      if (sourceGivens.has(position.givens)) continue
      const values = Array.from(position.givens, (digit, cell) => digit === '0' ? position.entries[cell] : digit).join('')
      const { choices } = request({
        type: 'hints', values, eliminations: position.eliminations, limit: 1, disabledTechniques,
      })
      if (!choices.length) continue
      sources.push({ ...position, suggestion: choices[0].actions[0] })
      sourceGivens.add(position.givens)
    }

    const seen = new Set()
    const variantsBySource = sources.map((example) => {
      const variants = []
      // Keep the examples as independent sources. A rearrangement of one source is
      // another display of that same exercise for progress tracking.
      for (const [symmetry, shift] of [[0, 0], [1, 3], [2, 6], [3, 1], [0, 4], [1, 7]]) {
        const { suggestion, ...position } = remapPosition(example, symmetry, shift)
        if (seen.has(position.givens)) continue
        const proof = request({
          type: 'practice-proof', values: position.givens, entries: position.entries,
          eliminations: position.eliminations, preferredTechnique: technique, action: suggestion,
        })
        if (proof?.technique !== technique) {
          if (symmetry === 0 && shift === 0) throw new Error(`Could not verify the ${technique} exercise.`)
          continue
        }
        const { pattern, ...deduction } = proof
        variants.push({
          ...position,
          sourceGivens: example.givens,
          hint: { technique, pattern, deduction },
        })
        seen.add(position.givens)
        if (variants.length === 4) break
      }
      return variants
    })
    const positions = Array.from({ length: 4 }, (_, index) =>
      variantsBySource.flatMap((variants) => variants[index] ? [variants[index]] : []),
    ).flat().slice(0, 12)
    if (positions.length < 10 || new Set(positions.map(({ sourceGivens }) => sourceGivens)).size < 3) {
      throw new Error(`Not enough practice positions for ${technique}.`)
    }
    return [technique, positions]
  }))
}
