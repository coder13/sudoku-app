function requireValue(valid, message) {
  if (!valid) throw new Error(message)
}

const isText = (value) => typeof value === 'string' && Boolean(value.trim())
const isTextList = (value) => Array.isArray(value) && value.length > 0 && value.every(isText)
const isOptionalText = (value) => value === undefined || isText(value)
const isSlug = (value) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)

export function findDisallowedTeachingWord(text) {
  return text.match(/\b(?:take|takes|taking|taken|took)\b/i)?.[0]
}

function checkWording(content, context) {
  const metadataKeys = ['id', 'href', 'type', 'example']
  const text = JSON.stringify(content, (key, value) => metadataKeys.includes(key) ? undefined : value)
  const word = findDisallowedTeachingWord(text)
  requireValue(!word, `Replace “${word}” in ${context}. Use “place” for a move or “is” for a cell's value.`)
}

function validLink(link) {
  return isText(link?.label) && isText(link.href) && (
    /^\/learn\/[a-z0-9-]+(?:#[a-z0-9-]+)?$/i.test(link.href) ||
    (/^https?:\/\//i.test(link.href) && URL.canParse(link.href))
  )
}

function validCrop(crop) {
  if (crop === undefined) return true
  return crop && [crop.row, crop.column, crop.rows, crop.columns].every(Number.isInteger) &&
    crop.row >= 0 && crop.column >= 0 && crop.rows >= 1 && crop.columns >= 1 &&
    crop.row + crop.rows <= 9 && crop.column + crop.columns <= 9
}

function validDiagramCopy(copy) {
  if (copy === undefined) return true
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) return false
  const labels = ['description', 'reason', 'patternLabel', 'accentLabel', 'strongLabel', 'weakLabel', 'proofTitle']
  return labels.every((key) => isOptionalText(copy[key])) &&
    (copy.results === undefined || isTextList(copy.results)) &&
    (copy.trace === undefined || (Array.isArray(copy.trace) && copy.trace.length > 0 &&
      copy.trace.every((part) => isText(part?.assumption) && isTextList(part.steps) && isText(part.conclusion))))
}

function checkLesson(lesson, original, examples) {
  const context = lesson?.title || original.title
  requireValue(lesson?.id === original.id && isText(lesson.title) && isText(lesson.summary),
    `Enter a title and subtitle for ${context}.`)
  requireValue(lesson.aliases === undefined || isTextList(lesson.aliases),
    `Enter a list of alternate names for ${context}.`)
  requireValue(Array.isArray(lesson.blocks) && Array.isArray(lesson.references) &&
    lesson.references.every(validLink) && (lesson.credits === undefined || (Array.isArray(lesson.credits) &&
    lesson.credits.every(validLink))) && isOptionalText(lesson.referencesTitle) && isOptionalText(lesson.creditsPrefix),
  `Enter link labels and Learn paths or complete web URLs for ${context}.`)

  const headings = new Set(['explanation', 'examples', 'worked-example', 'trainer'])
  const drills = []
  for (const [index, block] of lesson.blocks.entries()) {
    const label = `Block ${index + 1} in ${context}`
    switch (block?.type) {
      case 'text':
        requireValue(isTextList(block.paragraphs), `${label} needs paragraph text.`)
        break
      case 'heading':
        requireValue(isText(block.title) && isSlug(block.id) && !headings.has(block.id),
          `${label} needs a heading and unique anchor.`)
        headings.add(block.id)
        break
      case 'list':
        requireValue(isTextList(block.items), `${label} needs list text.`)
        break
      case 'diagram':
        requireValue(examples.includes(block.example) && validCrop(block.region) && validDiagramCopy(block.copy),
          `${label} needs a verified example, a crop within the board, and nonempty caption text.`)
        if (block.notes !== undefined) {
          const { id, title, paragraphs } = block.notes ?? {}
          requireValue(isTextList(paragraphs) && isOptionalText(title) &&
            (id === undefined || (isSlug(id) && !headings.has(id))),
          `${label} needs notes with text and a unique anchor.`)
          if (id) headings.add(id)
        }
        break
      case 'practice':
        requireValue(Array.isArray(block.drills) && block.drills.length > 0 &&
          block.drills.every((drill) => examples.includes(drill?.example) && isText(drill.title)) &&
          isOptionalText(block.title) && isOptionalText(block.selectLabel) && isOptionalText(block.instruction),
        `${label} needs nonempty practice labels and instructions.`)
        drills.push(...block.drills.map(({ example }) => example))
        break
      default:
        throw new Error(`${label} has an unknown block type.`)
    }
  }
  const originalDrills = original.blocks.flatMap((block) =>
    block.type === 'practice' ? block.drills.map(({ example }) => example) : [],
  )
  requireValue(drills.sort().join(',') === originalDrills.sort().join(','), `Keep the existing practice variants in ${context}.`)
  checkWording(lesson, context)
}

export function validateContent(content, original, examples) {
  const overview = content?.overview
  requireValue(overview && ['pageTitle', 'title', 'intro', 'difficultyTitle', 'fundamentalsNote'].every((key) => isText(overview[key])) &&
    isTextList(overview.difficultyParagraphs), 'Complete the Overview title and text.')
  checkWording(overview, 'the Learn overview')
  checkLesson(content.fundamentals, original.fundamentals, examples)
  requireValue(Array.isArray(content.groups) && content.groups.length === original.groups.length, 'Keep the existing technique families.')
  for (const [index, group] of content.groups.entries()) {
    const current = original.groups[index]
    requireValue(isText(group?.title) && isText(group.overview) && group.variant === current.variant &&
      Array.isArray(group.lessons) && group.lessons.length === current.lessons.length, 'Each technique family needs a title and description.')
    checkWording([group.title, group.overview], group.title)
    for (const [lessonIndex, lesson] of group.lessons.entries()) checkLesson(lesson, current.lessons[lessonIndex], examples)
  }
}
