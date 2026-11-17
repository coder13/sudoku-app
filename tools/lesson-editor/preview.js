const editingStyles = `
[data-lesson-field][contenteditable] {
  outline: 1px dashed var(--selected-border, #9864d3);
  outline-offset: 3px;
  border-radius: 2px;
  cursor: text;
}
[data-lesson-field][contenteditable]:focus {
  outline: 2px solid var(--selected-border, #9864d3);
  background: var(--surface, #fff);
}
[data-lesson-field][contenteditable] span { cursor: inherit; }
[data-lesson-field][contenteditable]:empty::before {
  content: attr(data-lesson-field);
  color: var(--muted, #666);
}
`

export function bindPreview(doc, { content, lesson, editing, changed, selectBlock, save }) {
  const article = doc.querySelector(lesson ? '.technique-lesson' : '.lesson-overview')
  if (!article) throw new Error('The article did not load in the preview.')
  const style = doc.createElement('style')
  style.textContent = editingStyles
  doc.head.append(style)
  const fields = []
  const blockNodes = new Map()
  const blockFields = new Map()
  const locked = new Set()

  function field(element, label, update) {
    if (!element) throw new Error(`Could not find “${label}” in the preview. Save or reload to refresh it.`)
    element.dataset.lessonField = label
    fields.push(element)
    element.addEventListener('input', () => {
      if (!element.isContentEditable) return
      update(element.innerText.replace(/\s*\n\s*/g, ' ').trim())
      changed()
    })
    element.addEventListener('keydown', (event) => {
      if (editing() && event.key === 'Enter' && !event.isComposing) event.preventDefault()
    })
  }
  function property(element, label, object, key) {
    field(element, label, (value) => { object[key] = value })
  }
  function diagram(figure, block) {
    const caption = figure.querySelector('figcaption')
    const outcome = caption.querySelector('.lesson-outcomes')
    const override = (element, label, key) => field(element, label, (value) => {
      block.copy ??= {}
      block.copy[key] = value
    })
    override(caption.querySelector('.lesson-diagram-summary'), 'Diagram caption', 'description')
    override(caption.querySelector('.lesson-diagram-reason'), 'Diagram explanation', 'reason')
    const notes = caption.querySelector('.lesson-example-notes')
    if (notes) {
      if (block.notes.title) property(notes.querySelector('h3'), 'Example notes heading', block.notes, 'title')
      notes.querySelectorAll('p').forEach((element, index) =>
        property(element, 'Example notes', block.notes.paragraphs, index))
    }
    const outcomeNodes = outcome.matches('ul') ? Array.from(outcome.children) : [outcome]
    const results = outcomeNodes.map((element) => element.textContent)
    outcomeNodes.forEach((element, index) => field(element, 'Diagram result', (value) => {
      results[index] = value
      block.copy ??= {}
      block.copy.results = results
    }))

    const labels = [
      ['.lesson-key-pattern', 'Pattern key', 'patternLabel'],
      ['.lesson-key-accent', 'Accent key', 'accentLabel'],
      ['.lesson-key-link:not(.dashed)', 'Strong link key', 'strongLabel'],
      ['.lesson-key-link.dashed', 'Weak link key', 'weakLabel'],
    ]
    for (const [selector, label, key] of labels) {
      const element = caption.querySelector(selector)?.nextElementSibling
      if (element) override(element, label, key)
    }

    const proof = caption.querySelector('.lesson-proof')
    if (!proof) return
    override(proof.querySelector('summary span'), 'Proof heading', 'proofTitle')
    const parts = Array.from(proof.querySelectorAll(':scope > div'))
    const trace = parts.map((part) => ({
      assumption: part.firstElementChild.textContent,
      steps: Array.from(part.querySelectorAll('li'), (element) => element.textContent),
      conclusion: part.lastElementChild.textContent,
    }))
    parts.forEach((part, index) => {
      const update = (element, label, object, key) => field(element, label, (value) => {
        object[key] = value
        block.copy ??= {}
        block.copy.trace = trace
      })
      update(part.firstElementChild, 'Proof assumption', trace[index], 'assumption')
      part.querySelectorAll('li').forEach((element, stepIndex) => update(element, 'Proof step', trace[index].steps, stepIndex))
      update(part.lastElementChild, 'Proof conclusion', trace[index], 'conclusion')
    })
  }

  const header = article.querySelector('.lesson-heading')
  property(header.querySelector('.lesson-title'), 'Page title', lesson ?? content.overview, 'title')
  if (lesson) {
    property(article.querySelector('[data-lesson-intro]'), 'Article introduction', lesson, 'summary')
    for (const [index, block] of lesson.blocks.entries()) {
      const elements = Array.from(article.querySelectorAll(`[data-lesson-block="${index}"]`))
      const [element] = elements
      if (!element) throw new Error(`The preview is missing block ${index + 1}.`)
      blockNodes.set(block, element)
      const firstField = fields.length
      switch (block.type) {
        case 'heading':
          property(element, 'Section heading', block, 'title')
          break
        case 'text':
          elements.forEach((paragraph, index) => property(paragraph, 'Paragraph', block.paragraphs, index))
          break
        case 'list':
          Array.from(element.children).forEach((item, index) => property(item, 'List item', block.items, index))
          break
        case 'diagram':
          diagram(element, block)
          break
        case 'table':
          property(element.querySelector('caption'), 'Table caption', block, 'caption')
          element.querySelectorAll('thead th').forEach((cell, index) => property(cell, 'Column heading', block.columns, index))
          element.querySelectorAll('tbody tr').forEach((row, rowIndex) => row.querySelectorAll('td').forEach((cell, index) => property(cell, 'Table cell', block.rows[rowIndex], index)))
          break
        case 'concept-check':
          property(element.querySelector('h2'), 'Concept check heading', block, 'title')
          break
        case 'practice': {
          field(element.querySelector('.lesson-trainer-title'), 'Trainer subtitle', (value) => {
            if (value) block.title = value
            else delete block.title
          })
          if (block.drills.length === 1) {
            property(element.querySelector('.lesson-practice-instruction'), 'Practice instruction', block, 'instruction')
          }
          const label = element.querySelector('.lesson-drill > span')
          if (label) property(label, 'Practice picker label', block, 'selectLabel')
          break
        }
      }
      blockFields.set(block, fields.slice(firstField))
      for (const node of elements) {
        node.addEventListener('pointerdown', () => { if (editing()) selectBlock(block) })
        node.addEventListener('focusin', () => { if (editing()) selectBlock(block) })
      }
    }
    const references = article.querySelector('.lesson-references')
    property(references.querySelector('h2'), 'References heading', lesson, 'referencesTitle')
    references.querySelectorAll('li a > span').forEach((element, index) =>
      property(element, 'Reference label', lesson.references[index], 'label'))
    const creditsPrefix = references.querySelector('p > span')
    if (creditsPrefix) property(creditsPrefix, 'Credits introduction', lesson, 'creditsPrefix')
    references.querySelectorAll('p > a').forEach((element, index) =>
      property(element, 'Credit label', lesson.credits[index], 'label'))
  } else {
    const { overview, groups } = content
    property(header.querySelector('.lesson-summary'), 'Introduction', overview, 'intro')
    property(header.querySelector('.lesson-overview-basics > span'), 'Fundamentals link introduction', overview, 'fundamentalsNote')
    const difficulty = article.querySelector('[data-lesson-difficulty]')
    property(difficulty.querySelector('h2'), 'Difficulty heading', overview, 'difficultyTitle')
    difficulty.querySelectorAll('p').forEach((element, index) =>
      property(element, 'Difficulty paragraph', overview.difficultyParagraphs, index))
    article.querySelectorAll('[data-lesson-group-title]').forEach(element =>
      property(element, 'Technique group heading', groups[element.dataset.lessonGroupTitle], 'title'))
    article.querySelectorAll('[data-lesson-group-overview]').forEach(element =>
      property(element, 'Technique group description', groups[element.dataset.lessonGroupOverview], 'overview'))
  }

  doc.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]')
    if (anchor) {
      event.preventDefault()
      event.stopPropagation()
      if (!editing()) doc.defaultView.open(anchor.href, '_blank', 'noopener')
    } else if (editing() && event.target.closest('summary [data-lesson-field]')) {
      event.preventDefault()
    }
  }, true)
  doc.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
    event.preventDefault()
    save()
  })

  function applyMode() {
    const active = editing()
    for (const element of fields) {
      if (active && !locked.has(element)) {
        element.setAttribute('contenteditable', 'plaintext-only')
        element.setAttribute('role', 'textbox')
        element.setAttribute('aria-label', element.dataset.lessonField)
      } else {
        element.removeAttribute('contenteditable')
        element.removeAttribute('role')
        element.removeAttribute('aria-label')
      }
    }
  }
  function lockBlock(block) {
    for (const element of blockFields.get(block) ?? []) locked.add(element)
    applyMode()
  }
  applyMode()
  return { applyMode, blockNodes, lockBlock }
}
