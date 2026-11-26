import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import type { Deduction, HintChoice, InferenceNode } from '../src/sudoku/engine.ts'
import { hintLocation, lessonDiagram } from '../src/sudoku/lesson-diagram.ts'
import { findDisallowedTeachingWord, validateContent } from '../tools/lesson-editor/validate.mjs'

const mask = (...digits: number[]) => digits.reduce((value, digit) => value | 1 << (digit - 1), 0)

test('Learn copy and hint templates follow the teaching wording rule', () => {
  const content = JSON.parse(readFileSync(new URL('../src/sudoku/learn-content.json', import.meta.url), 'utf8'))
  const lessons = [content.fundamentals, ...content.groups.flatMap(({ lessons }) => lessons)]
  const examples = lessons.flatMap(({ blocks }) => blocks.flatMap((block) =>
    block.type === 'diagram' ? [block.example] : block.type === 'practice' ? block.drills.map(({ example }) => example) : []))
  validateContent(content, content, examples)

  const draft = structuredClone(content)
  const wing = draft.groups.flatMap(({ lessons }) => lessons).find(({ id }) => id === 'wxyz-wing')
  wing.summary = 'If R4C2 takes 9, the wing has only three digits left.'
  assert.throws(() => validateContent(draft, content, examples), /Replace “takes” in WXYZ-Wing/)

  for (const path of [
    '../src/sudoku/hints.ts', '../src/sudoku/lesson-diagram.ts', '../src/sudoku/lesson-guidance.ts', '../src/sudoku/variant-hints.ts',
    '../src/components/HintCard.tsx', '../src/components/LessonPractice.tsx', '../src/components/TechniqueLesson.tsx', '../src/components/Worktable.tsx',
    '../src/routes/learn.index.tsx', '../src/routes/learn.$technique.tsx',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest)
    function checkText(node: ts.Node) {
      if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)) {
        assert.equal(findDisallowedTeachingWord(node.text), undefined, `${path}: ${node.text}`)
      }
      ts.forEachChild(node, checkText)
    }
    checkText(syntax)
  }
})

test('AIC location reveals the endpoint candidates without revealing links or the removal', () => {
  const start = { candidate: { cell: 3, digit: 4 } }
  const inner = { candidate: { cell: 21, digit: 4 } }
  const end = { candidate: { cell: 26, digit: 6 } }
  const hint: HintChoice = {
    technique: 'aic', actions: [{ eliminate: { cell: 8, digit: 6 } }],
    evidence: { inference: { links: [
      { from: start, to: inner, source: { house: { column: 3 } }, strength: 'strong' },
      { from: inner, to: end, source: { peers: {} }, strength: 'weak' },
    ] } },
  }
  const clue = hintLocation(hint, 'concise')
  assert.ok(clue)
  assert.equal(clue.text, 'Start at 4 in r1c4. The other end is 6 in r3c9.')
  assert.deepEqual([...clue.annotations.cells!.keys()], [3, 26])
  assert.equal(clue.annotations.candidates?.get(3)?.get(4)?.label, 'chain start')
  assert.equal(clue.annotations.candidates?.get(26)?.get(6)?.label, 'chain end')
  assert.equal(clue.annotations.candidates?.size, 2)
  assert.equal(clue.annotations.links, undefined)
})

test('Grouped AIC location shows all candidates in an endpoint group', () => {
  const hint: HintChoice = {
    technique: 'grouped-aic', actions: [{ eliminate: { cell: 3, digit: 4 } }],
    evidence: { inference: { links: [{
      from: { group: { cells: [0, 1], digit: 4 } }, to: { candidate: { cell: 2, digit: 4 } },
      source: { house: { row: 0 } }, strength: 'strong',
    }] } },
  }
  const clue = hintLocation(hint, 'concise')
  assert.ok(clue)
  assert.equal(clue.text, 'Start at 4 in r1c1 or r1c2. The other end is 4 in r1c3.')
  const marks = clue.annotations.candidates
  assert.equal(marks?.get(0)?.get(4)?.label, 'chain start')
  assert.equal(marks?.get(1)?.get(4)?.label, 'chain start')
  assert.equal(marks?.get(2)?.get(4)?.label, 'chain end')
  assert.deepEqual(clue.annotations.groups, [{
    point: { cells: [0, 1], digit: 4 }, color: 'var(--lesson-pattern)', label: 'Chain start group: 4 in r1c1 or r1c2',
  }])
  assert.equal(clue.annotations.links, undefined)
})

test('AIC location outlines both endpoint groups without exposing internal groups', () => {
  const start: InferenceNode = { group: { cells: [0, 1], digit: 4 } }
  const inner: InferenceNode = { group: { cells: [36, 37], digit: 4 } }
  const end: InferenceNode = { 'mixed-group': [{ cell: 6, digit: 4 }, { cell: 6, digit: 7 }] }
  const hint: HintChoice = {
    technique: 'tridagon-aic', actions: [{ eliminate: { cell: 3, digit: 4 } }],
    evidence: { inference: { links: [
      { from: start, to: inner, source: { peers: {} }, strength: 'strong' },
      { from: inner, to: end, source: { peers: {} }, strength: 'weak' },
    ] } },
  }
  const clue = hintLocation(hint, 'concise')!
  assert.deepEqual(clue.annotations.groups?.map(({ point }) => point), [
    { cells: [0, 1], digit: 4 }, { candidates: [{ cell: 6, digit: 4 }, { cell: 6, digit: 7 }] },
  ])
  assert.equal(clue.annotations.candidates?.has(36), false)
  assert.equal(clue.annotations.candidates?.has(37), false)
  assert.equal(clue.annotations.candidates?.has(3), false)
  assert.equal(clue.annotations.links, undefined)
})

test('grouped AIC explanation treats every member as one endpoint', () => {
  const group: InferenceNode = { group: { cells: [0, 1], digit: 1 } }
  const a: InferenceNode = { candidate: { cell: 3, digit: 1 } }
  const b: InferenceNode = { candidate: { cell: 30, digit: 1 } }
  const c: InferenceNode = { candidate: { cell: 30, digit: 2 } }
  const d: InferenceNode = { candidate: { cell: 27, digit: 2 } }
  const end: InferenceNode = { candidate: { cell: 9, digit: 2 } }
  const deduction: Deduction = {
    technique: 'grouped-aic', actions: [{ eliminate: { cell: 9, digit: 1 } }],
    evidence: { inference: { links: [
      { from: group, to: a, source: { house: { row: 0 } }, strength: 'strong' },
      { from: a, to: b, source: { house: { column: 3 } }, strength: 'weak' },
      { from: b, to: c, source: { cell: 30 }, strength: 'strong' },
      { from: c, to: d, source: { house: { row: 3 } }, strength: 'weak' },
      { from: d, to: end, source: { house: { column: 0 } }, strength: 'strong' },
    ] } },
  }
  const diagram = lessonDiagram({ deduction, candidates: Array(81).fill(mask(1, 2, 3)) })
  assert.match(diagram.description, /each outlined group as one end of a link/)
  assert.match(diagram.reason, /at least one member is true/)
  assert.match(diagram.reason, /false only when every member is false/)
  assert.match(diagram.reason, /conflicts with every candidate at both ends/)
  assert.deepEqual(diagram.annotations.links?.[0].from, { cells: [0, 1], digit: 1 })
  for (const cell of [0, 1]) assert.equal(diagram.annotations.candidates?.get(cell)?.get(1)?.label, 'Grouped candidates')
  assert.equal(diagram.annotations.candidates?.get(9)?.get(1)?.mark, 'strike')
})

test('a discontinuous loop at a group explains the group conclusion without choosing a member', () => {
  const group: InferenceNode = { group: { cells: [0, 1], digit: 4 } }
  const a: InferenceNode = { candidate: { cell: 3, digit: 4 } }
  const b: InferenceNode = { candidate: { cell: 30, digit: 4 } }
  for (const seam of ['strong', 'weak'] as const) {
    const deduction: Deduction = {
      technique: 'grouped-discontinuous-nice-loop', actions: seam === 'strong'
        ? [{ eliminate: { cell: 9, digit: 4 } }]
        : [{ eliminate: { cell: 0, digit: 4 } }, { eliminate: { cell: 1, digit: 4 } }],
      evidence: { inference: { links: [
        { from: group, to: a, source: { peers: {} }, strength: seam },
        { from: a, to: b, source: { peers: {} }, strength: seam === 'strong' ? 'weak' : 'strong' },
        { from: b, to: group, source: { peers: {} }, strength: seam },
      ] } },
    }
    const diagram = lessonDiagram({ deduction, candidates: Array(81).fill(mask(4, 7)) })
    assert.match(diagram.description, /back to the same group/)
    assert.doesNotMatch(diagram.reason, /starting candidate|Place 4/)
    assert.match(diagram.reason, seam === 'strong'
      ? /starting group is true\. Remove candidates that conflict with every member/
      : /Every member of the starting group is false\. Remove each member/)
  }
})

test('3D Medusa location marks only cells in the coloring proof', () => {
  const patternCells = [10, 13, 15, 22, 24]
  const hint: HintChoice = {
    technique: '3d-medusa', actions: [{ eliminate: { cell: 15, digit: 1 } }],
    evidence: { coloring: {
      colors: [
        [{ cell: 10, digit: 9 }, { cell: 13, digit: 1 }, { cell: 22, digit: 4 }, { cell: 24, digit: 9 }],
        [{ cell: 13, digit: 4 }, { cell: 15, digit: 9 }, { cell: 24, digit: 4 }],
      ],
      links: [], reason: 'both-colors',
    } },
    pattern: { cells: patternCells, candidates: [], houses: [{ row: 1 }, { row: 2 }, { column: 4 }, { column: 6 }] },
  }
  const clue = hintLocation(hint, 'concise')
  assert.ok(clue)
  assert.equal(clue.text, 'Look at the highlighted cells.')
  assert.deepEqual([...clue.annotations.cells!.keys()], patternCells)
  assert.equal(clue.annotations.candidates, undefined)
  assert.equal(clue.annotations.links, undefined)
})

test('3D Medusa highlights the outside cell that loses all its candidates', () => {
  const candidates = Array(81).fill(0)
  candidates[0] = mask(2, 7, 8)
  candidates[1] = mask(2, 5)
  candidates[9] = mask(2, 5)
  const a = { cell: 0, digit: 2 }
  const b = { cell: 1, digit: 2 }
  const c = { cell: 1, digit: 5 }
  const deduction: Deduction = {
    technique: '3d-medusa', actions: [{ eliminate: a }, { eliminate: c }],
    evidence: { coloring: {
      colors: [[a, c], [b]],
      links: [
        { from: a, to: b, source: { house: { row: 0 } }, strength: 'strong' },
        { from: b, to: c, source: { cell: 1 }, strength: 'strong' },
      ],
      reason: { 'emptied-cell': 9 },
    } },
  }

  const { annotations, reason, results } = lessonDiagram({ deduction, candidates }, undefined, { cellReferenceStyle: 'concise' })
  assert.equal(annotations.cells?.get(9)?.label, 'contradiction cell')
  assert.notEqual(annotations.cells?.get(9)?.fill, annotations.cells?.get(0)?.fill)
  assert.equal(annotations.cells?.get(0)?.label, 'pattern cell')
  assert.equal(annotations.candidates?.has(9), false)
  assert.equal(annotations.candidates?.get(1)?.get(5)?.mark, 'strike')
  assert.match(reason, /If all blue candidates are true, r2c1 has no candidate left/)
  assert.match(reason, /2 in r1c1 rules out 2 there because both cells share column 1/)
  assert.match(reason, /5 in r1c2 rules out 5 there because both cells share box 1/)
  assert.deepEqual(results, ['Remove 2 from r1c1.', 'Remove 5 from r1c2.'])
})

test('WXYZ-Wing shows why placing the outside candidate would leave a cell unfilled', () => {
  const candidates = Array(81).fill(0)
  candidates[33] = mask(5, 8)
  candidates[69] = mask(5, 9)
  candidates[74] = mask(1, 8)
  candidates[78] = mask(1, 5, 9)
  candidates[29] = mask(1, 8)
  const deduction: Deduction = {
    technique: 'wxyz-wing', actions: [{ eliminate: { cell: 29, digit: 8 } }],
    evidence: { 'wxyz-wing': { cells: [33, 69, 74, 78], digits: [1, 5, 8, 9], unrestricted: 8 } },
  }
  const diagram = lessonDiagram({ deduction, candidates })
  assert.deepEqual(diagram.reasonSteps, [
    'Candidate 1 is restricted; all its cells share row 9. Candidate 5 is restricted; all its cells share column 7. Candidate 9 is restricted; all its cells share column 7. Candidate 8 is unrestricted because a pair of its candidate cells does not share a row, column, or box. A restricted candidate can appear at most once in the wing.',
    'If R4C3 is 8, it rules out every 8 in the wing (R4C7 and R9C3).',
    'That leaves only the three restricted candidates (1, 5, and 9) for four cells. They can fill at most three cells, so the unrestricted candidate must appear in the wing.',
  ])
  assert.doesNotMatch(diagram.reason, /fourth cell|exactly one.*8/)
  assert.equal(diagram.accentLabel, 'Unrestricted candidate')
  assert.deepEqual(diagram.results, ['Remove 8 from R4C3.'])
})

test('WXYZ-Wing handles all four restricted digits without inventing an unrestricted digit', () => {
  const candidates = Array(81).fill(0)
  candidates[0] = mask(1, 2)
  candidates[3] = mask(2, 3)
  candidates[30] = mask(3, 4)
  candidates[27] = mask(1, 4)
  candidates[28] = mask(4, 5)
  candidates[29] = mask(4, 6)
  candidates[54] = mask(1, 5)
  const deduction: Deduction = {
    technique: 'wxyz-wing', actions: [
      { eliminate: { cell: 54, digit: 1 } }, { eliminate: { cell: 28, digit: 4 } }, { eliminate: { cell: 29, digit: 4 } },
    ],
    evidence: { 'wxyz-wing': { cells: [0, 3, 27, 30], digits: [1, 2, 3, 4], unrestricted: null } },
  }
  const diagram = lessonDiagram({ deduction, candidates })
  assert.match(diagram.reason, /The candidates for 4 share row 4/)
  assert.match(diagram.reason, /rules out the same digit in the other wing cells/)
  assert.match(diagram.reason, /Placing 1 in R7C1 would rule out every 1 in the wing \(R1C1 and R4C1\)/)
  assert.match(diagram.reason, /Placing any crossed-out 4 would rule out every 4 in the wing \(R4C1 and R4C4\)/)
  assert.deepEqual(diagram.results, ['Remove 1 from R7C1.', 'Remove 4 from R4C2 and R4C3.'])
  assert.doesNotMatch(diagram.reason, /null|undefined|other three/)
  assert.equal(diagram.accentLabel, undefined)
})

test('Singly linked ALS-XZ distinguishes the restricted common candidate from the unrestricted one', () => {
  const candidates = Array(81).fill(0)
  candidates[18] = candidates[19] = mask(2, 3, 4)
  candidates[15] = mask(4, 5)
  candidates[24] = mask(2, 4, 5)
  candidates[25] = mask(2, 4, 8)
  const deduction: Deduction = {
    technique: 'als-xz', actions: [{ eliminate: { cell: 25, digit: 4 } }],
    evidence: { 'als-xz': { sets: [
      { cells: [18, 19], digits: [2, 3, 4] }, { cells: [15, 24], digits: [2, 4, 5] },
    ], links: [2] } },
  }

  const { annotations, mainLabel, accentLabel, reason } = lessonDiagram({ deduction, candidates })
  assert.equal(mainLabel, 'Unrestricted common candidate')
  assert.equal(accentLabel, 'Restricted common candidate')
  for (const cell of [18, 19, 24]) {
    assert.equal(annotations.candidates?.get(cell)?.get(2)?.color, 'var(--lesson-accent)')
  }
  for (const cell of [15, 18, 19, 24]) {
    assert.equal(annotations.candidates?.get(cell)?.get(4)?.color, 'var(--lesson-pattern)')
  }
  assert.equal(annotations.candidates?.get(18)?.has(3), false)
  const set1 = { setMarkers: [{ color: 'var(--lesson-pattern-fill)', label: 'Set 1' }] }
  const set2 = { setMarkers: [{ color: 'var(--lesson-als-second-set-fill)', label: 'Set 2' }] }
  const expectedCells = new Map([[18, set1], [19, set1], [15, set2], [24, set2]])
  assert.deepEqual(annotations.cells, expectedCells)
  assert.match(reason, /Set 1 \(blue\) is at R3C1 and R3C2\. Set 2 \(purple\) is at R2C7 and R3C7/)
  const location = hintLocation(deduction, 'concise')
  assert.deepEqual(location?.annotations.cells, expectedCells)
  assert.equal(location?.annotations.candidates, undefined)
  assert.equal(annotations.candidates?.get(25)?.get(4)?.mark, 'strike')
})

test('Doubly linked ALS-XZ explains a removal supported by only one of the two sets', () => {
  const candidates = Array(81).fill(0)
  candidates[0] = mask(1, 2, 3)
  candidates[1] = mask(2, 3)
  candidates[3] = mask(1, 4)
  candidates[4] = mask(2, 4)
  candidates[6] = mask(1, 5)
  candidates[10] = mask(3, 5)
  candidates[13] = mask(3, 4)
  const deduction: Deduction = {
    technique: 'als-xz', actions: [{ eliminate: { cell: 6, digit: 1 } }, { eliminate: { cell: 10, digit: 3 } }],
    evidence: { 'als-xz': { sets: [
      { cells: [0, 1], digits: [1, 2, 3] }, { cells: [3, 4, 13], digits: [1, 2, 3, 4] },
    ], links: [1, 2] } },
  }
  const diagram = lessonDiagram({ deduction, candidates })
  assert.equal(diagram.annotations.candidates?.get(0)?.get(1)?.color, 'var(--lesson-accent)')
  assert.equal(diagram.annotations.candidates?.get(0)?.get(2)?.color, 'var(--lesson-accent)')
  assert.equal(diagram.annotations.candidates?.get(6)?.get(1)?.mark, 'strike')
  assert.match(diagram.reason, /The 1 candidates in sets 1 and 2 share row 1/)
  assert.match(diagram.reason, /One set must skip 1 and the other must skip 2/)
  assert.match(diagram.reason, /At least one of R1C1 and R1C4 must be 1/)
  assert.match(diagram.reason, /At least one of R1C1 and R1C2 must be 3\. Putting 3 in R2C2/)
})

test('ALS-XY-Wing names the middle set and the digit passed to the last set', () => {
  const candidates = Array(81).fill(0)
  candidates[0] = mask(1, 8)
  candidates[3] = mask(1, 2)
  candidates[12] = mask(2, 8)
  candidates[9] = mask(7, 8)
  const deduction: Deduction = {
    technique: 'als-xy-wing', actions: [{ eliminate: { cell: 9, digit: 8 } }],
    evidence: { 'als-chain': { sets: [
      { cells: [0], digits: [1, 8] }, { cells: [3], digits: [1, 2] }, { cells: [12], digits: [2, 8] },
    ], links: [1, 2] } },
  }
  const diagram = lessonDiagram({ deduction, candidates })
  assert.equal(diagram.annotations.cells?.get(0)?.setMarkers?.[0]?.label, 'Set 1')
  assert.equal(diagram.annotations.cells?.get(3)?.setMarkers?.[0]?.label, 'Set 2')
  assert.deepEqual(diagram.annotations.cells?.get(12), { setMarkers: [{ label: 'Set 3', color: 'var(--lesson-set-teal)' }] })
  assert.equal(diagram.annotations.candidates?.get(3)?.get(2)?.color, 'var(--chain-blue)')
  assert.equal(diagram.annotations.candidates?.get(12)?.get(2)?.color, 'var(--chain-orange)')
  assert.equal(diagram.annotations.candidates?.get(12)?.get(8)?.color, 'var(--chain-blue)')
  assert.match(diagram.reason, /If it skips 8, it must use 1/)
  assert.match(diagram.reason, /The 1 candidates in sets 1 and 2 share row 1/)
  assert.match(diagram.reason, /rules it out in set 2 \(R1C4\)\. This set must use 2/)
  assert.match(diagram.reason, /The 2 candidates in sets 2 and 3 share column 4/)
  assert.match(diagram.reason, /rules it out in set 3 \(R2C4\)\. This set must use 8/)
  assert.match(diagram.reason, /At least one of R1C1 and R2C4 must be 8/)
})

test('ALS chains draw weak links between grouped occurrences without extra group outlines', () => {
  const candidates = Array(81).fill(0)
  candidates[25] = mask(3, 4)
  candidates[21] = mask(4, 6)
  candidates[12] = candidates[13] = mask(2, 6, 9)
  candidates[4] = candidates[5] = mask(3, 4, 9)
  candidates[7] = mask(3, 4, 9)
  const deduction: HintChoice = {
    technique: 'als-chain', actions: [{ eliminate: { cell: 7, digit: 3 } }],
    evidence: { 'als-chain': { sets: [
      { cells: [25], digits: [3, 4] }, { cells: [21], digits: [4, 6] },
      { cells: [12, 13], digits: [2, 6, 9] }, { cells: [4, 5], digits: [3, 4, 9] },
    ], links: [4, 6, 9] } },
  }
  const { annotations } = lessonDiagram({ deduction, candidates })
  const weakLink = { color: 'var(--chain-neutral)', dashed: true, hideGroupOutlines: true }
  assert.deepEqual(annotations.links, [
    { from: { cells: [25], digit: 4 }, to: { cells: [21], digit: 4 }, ...weakLink },
    { from: { cells: [21], digit: 6 }, to: { cells: [12, 13], digit: 6 }, ...weakLink },
    { from: { cells: [12, 13], digit: 9 }, to: { cells: [4, 5], digit: 9 }, ...weakLink },
  ])
  for (const cell of [12, 13]) {
    assert.deepEqual(annotations.candidates?.get(cell)?.get(6), { color: 'var(--chain-orange)', mark: 'ring', label: 'OFF in this case' })
    assert.deepEqual(annotations.candidates?.get(cell)?.get(9), { color: 'var(--chain-blue)', mark: 'ring', label: 'ON in this case' })
  }
  assert.equal(annotations.candidates?.get(25)?.get(3)?.color, 'var(--chain-orange)')
  assert.equal(annotations.candidates?.get(5)?.get(3)?.color, 'var(--chain-blue)')
  assert.equal(annotations.candidates?.get(7)?.get(3)?.mark, 'strike')
  assert.equal(hintLocation(deduction, 'concise')?.annotations.links, undefined)
})

test('Sue de Coq distinguishes the line set, box set, and intersection at both hint stages', () => {
  const candidates = Array(81).fill(0)
  candidates[54] = mask(3, 4, 9)
  candidates[56] = mask(3, 5, 9)
  candidates[58] = mask(1, 4)
  candidates[60] = mask(1, 5)
  candidates[61] = mask(1, 5, 8)
  candidates[65] = mask(3, 9)
  const deduction: Deduction = {
    technique: 'sue-de-coq', actions: [{ eliminate: { cell: 61, digit: 1 } }],
    evidence: { 'sue-de-coq': {
      intersection: [54, 56], digits: [3, 4, 5, 9],
      line: { cells: [58, 60], digits: [1, 4, 5], house: { row: 6 } },
      block: { cells: [65], digits: [3, 9], house: { box: 6 } },
    } },
  }
  const diagram = lessonDiagram({ deduction, candidates })
  const location = hintLocation(deduction, 'concise')
  for (const [cells, label, fill] of [
    [[58, 60], 'Line set', 'var(--lesson-pattern-fill)'],
    [[65], 'Box set', 'var(--lesson-als-second-set-fill)'],
    [[54, 56], 'Intersection', 'var(--lesson-set-teal)'],
  ] as const) {
    for (const cell of cells) {
      assert.deepEqual(diagram.annotations.cells?.get(cell), { setMarkers: [{ label, color: fill }] })
      assert.deepEqual(location?.annotations.cells?.get(cell), { setMarkers: [{ label, color: fill }] })
    }
  }
  assert.match(diagram.reason, /Line set \(blue\).*Box set \(purple\).*Intersection \(teal\)/)
  assert.equal(diagram.annotations.candidates?.get(61)?.get(1)?.mark, 'strike')
})
