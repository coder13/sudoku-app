import { bindPreview } from './preview.js'

const picker = document.querySelector('#article')
const frame = document.querySelector('#canvas')
const canvas = frame.parentElement
const inspector = document.querySelector('#inspector')
const status = document.querySelector('#status')
const instruction = document.querySelector('#instruction')
const saveButton = document.querySelector('#save')
const editButton = document.querySelector('#edit')
const viewButton = document.querySelector('#view')
const openLink = document.querySelector('#open')

let content
let saved
let revision
let examples
let pageId = ''
let activeBlock
let preview
let editing = true
let saving = false
let pending = false
let needsRefresh = false
let version = 0
let loadNumber = 0
let restoreScroll = 0
const unpreviewedBlocks = new Set()

const currentLesson = () => pageId === content.fundamentals.id
  ? content.fundamentals
  : content.groups.flatMap(({ lessons }) => lessons).find(({ id }) => id === pageId)
const path = () => pageId ? '/learn/' + pageId : '/learn'

function report(message, state = '') {
  status.textContent = message
  status.dataset.state = state
  saveButton.disabled = saving || !pending
  picker.disabled = saving || !content
}
function change(refresh = false) {
  pending = true
  needsRefresh ||= refresh
  version += 1
  if (!saving) report(needsRefresh ? 'Unsaved changes · Save to refresh the layout' : 'Unsaved changes', 'dirty')
}
function changeBlock(block) {
  unpreviewedBlocks.add(block)
  preview?.lockBlock(block)
  change(true)
}

function updatePicker() {
  picker.replaceChildren(new Option('Overview', ''), new Option(content.fundamentals.title, content.fundamentals.id))
  for (const { title, lessons } of content.groups) {
    const group = document.createElement('optgroup')
    group.label = title
    for (const lesson of lessons) group.append(new Option(lesson.title, lesson.id))
    picker.append(group)
  }
  picker.value = pageId
}

function loadPreview(keepScroll = false) {
  preview = undefined
  restoreScroll = keepScroll ? (frame.contentWindow?.scrollY ?? 0) : 0
  openLink.href = path()
  canvas.setAttribute('aria-busy', 'true')
  frame.inert = true
  frame.src = path() + '?preview=' + ++loadNumber
}

function waitForApp(doc) {
  const article = doc.querySelector('.lesson-overview, .technique-lesson')
  if (!article) return Promise.reject(new Error('The article did not load in the preview.'))
  if (article.hasAttribute('data-preview-ready')) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      clearTimeout(timeout)
      observer.disconnect()
      resolve()
    })
    const timeout = setTimeout(() => {
      observer.disconnect()
      reject(new Error('The preview did not finish loading. Check the dev server and reload the editor.'))
    }, 15000)
    observer.observe(article, { attributes: true, attributeFilter: ['data-preview-ready'] })
  })
}

frame.addEventListener('load', async () => {
  if (!content) return
  const request = loadNumber
  const location = frame.contentWindow.location
  if (location.pathname.replace(/\/$/, '') !== path() || location.search !== '?preview=' + request) return
  try {
    const doc = frame.contentDocument
    await waitForApp(doc)
    if (request !== loadNumber) return
    preview = bindPreview(doc, {
      content,
      lesson: currentLesson(),
      editing: () => editing,
      changed: change,
      selectBlock: (block) => chooseBlock(block),
      save,
    })
    frame.contentWindow.scrollTo(0, restoreScroll)
  } catch (error) {
    if (request === loadNumber) report(error.message, 'error')
  } finally {
    if (request === loadNumber) {
      canvas.removeAttribute('aria-busy')
      frame.inert = false
    }
  }
})

function setMode(active) {
  editing = active
  document.body.toggleAttribute('data-preview', !editing)
  editButton.setAttribute('aria-pressed', String(editing))
  viewButton.setAttribute('aria-pressed', String(!editing))
  instruction.textContent = editing ? 'Click any highlighted text to edit it. Use ⌘S or Ctrl+S to save.' :
    'Test the article and its puzzles as a reader.'
  preview?.applyMode()
}
editButton.addEventListener('click', () => setMode(true))
viewButton.addEventListener('click', () => setMode(false))

async function save() {
  if (!pending || saving) return
  saving = true
  report('Saving…')
  const savingVersion = version
  const snapshot = structuredClone(content)
  try {
    const response = await fetch('./content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision, content: snapshot }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error)
    revision = result.revision
    saved = snapshot
    saving = false
    if (version === savingVersion) {
      pending = false
      needsRefresh = false
      unpreviewedBlocks.clear()
      updatePicker()
      renderInspector()
      loadPreview(true)
      report('Saved to file')
    } else {
      report('Saved · Newer edits are unsaved', 'dirty')
    }
  } catch (error) {
    saving = false
    report(error.message, 'error')
  }
}

saveButton.addEventListener('click', save)
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  }
})
window.addEventListener('beforeunload', (event) => {
  if (!pending) return
  event.preventDefault()
  event.returnValue = true
})
picker.addEventListener('change', () => {
  if (pending && !window.confirm('Discard the unsaved changes to this article?')) {
    picker.value = pageId
    return
  }
  const next = picker.value
  if (pending) content = structuredClone(saved)
  pending = false
  needsRefresh = false
  unpreviewedBlocks.clear()
  pageId = next
  activeBlock = currentLesson()?.blocks[0]
  updatePicker()
  renderInspector()
  loadPreview()
  report('Saved to file')
})

function node(tag, props = {}, ...children) {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('aria-')) element.setAttribute(key, value)
    else element[key] = value
  }
  element.append(...children)
  return element
}
const button = (label, run, disabled = false) => node('button', { type: 'button', onclick: run, disabled }, label)
const field = (label, control) => node('label', { className: 'field' }, label, control)
const input = (value, set, props = {}) => node('input', {
  value,
  oninput: (event) => { set(event.target.value); change(true) },
  ...props,
})
const panel = (title, ...children) => node('section', { className: 'panel' }, node('h2', {}, title), ...children)
const buttons = (...items) => node('div', { className: 'inline-controls' }, ...items)
const kinds = { text: 'Paragraph', heading: 'Heading', list: 'List', diagram: 'Diagram', practice: 'Practice puzzle' }

function chooseBlock(block, scroll = false) {
  if (activeBlock !== block) {
    activeBlock = block
    renderInspector()
    inspector.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' })
  }
  if (scroll) preview?.blockNodes.get(block)?.scrollIntoView({ block: 'center' })
}

function headingId(lesson) {
  const taken = new Set(lesson.blocks.filter(({ type }) => type === 'heading').map(({ id }) => id))
  let id = 'section'
  let number = 2
  while (taken.has(id)) id = 'section-' + number++
  return id
}

function insertBlock(lesson, type) {
  const block = { type }
  if (type === 'text') block.paragraphs = ['New paragraph']
  if (type === 'heading') Object.assign(block, { id: headingId(lesson), title: 'New section' })
  if (type === 'list') block.items = ['New item']
  if (type === 'diagram') block.example = lesson.blocks.find((item) => item.type === 'diagram')?.example ?? examples[0]
  lesson.blocks.splice(lesson.blocks.indexOf(activeBlock) + 1, 0, block)
  changeBlock(block)
  chooseBlock(block)
}

function blockName(block) {
  return block.title ?? block.paragraphs?.[0] ?? block.items?.[0] ?? block.example ?? kinds[block.type]
}

function structure(lesson) {
  const list = node('ol', { className: 'block-list' })
  for (const block of lesson.blocks) {
    const name = blockName(block)
    const option = button(name, () => chooseBlock(block, true))
    option.title = kinds[block.type] + ' · ' + name
    option.setAttribute('aria-pressed', String(block === activeBlock))
    list.append(node('li', {}, option))
  }
  const type = node('select', { 'aria-label': 'Block type' }, ...Object.entries(kinds)
    .filter(([key]) => key !== 'practice').map(([key, label]) => new Option(label, key)))
  return panel('Article blocks', buttons(type, button('Add', () => insertBlock(lesson, type.value))), list)
}

function diagramControls(block) {
  const example = node('select', {}, ...examples.map((id) => new Option(id, id, false, id === block.example)))
  example.onchange = () => {
    if (block.copy && !window.confirm('Changing the example will remove your custom diagram copy. Continue?')) {
      example.value = block.example
      return
    }
    delete block.copy
    block.example = example.value
    changeBlock(block)
    renderInspector()
  }
  const cropped = node('input', { type: 'checkbox', checked: !!block.region, onchange: (event) => {
    if (event.target.checked) block.region = { row: 0, column: 0, rows: 4, columns: 4 }
    else delete block.region
    change(true)
    renderInspector()
  } })
  const controls = [field('Board example', example), node('label', { className: 'check' }, cropped, 'Set a custom crop')]
  if (block.region) {
    const coordinates = [['First row', 'row', 1], ['First column', 'column', 1], ['Rows', 'rows', 0], ['Columns', 'columns', 0]]
    controls.push(node('div', { className: 'crop' }, ...coordinates.map(([label, key, offset]) =>
      field(label, input(block.region[key] + offset, (value) => { block.region[key] = Number(value) - offset },
        { type: 'number', min: '1', max: '9' })))))
  }
  if (block.copy) controls.push(button('Restore generated copy', () => {
    delete block.copy
    changeBlock(block)
    renderInspector()
  }))
  return controls
}

function blockDetails(lesson) {
  const block = activeBlock
  if (!block) return []
  const index = lesson.blocks.indexOf(block)
  function move(offset) {
    lesson.blocks.splice(index, 1)
    lesson.blocks.splice(index + offset, 0, block)
    change(true)
    renderInspector()
  }
  const actions = buttons(
    button('Move up', () => move(-1), index === 0),
    button('Move down', () => move(1), index === lesson.blocks.length - 1),
  )
  if (block.type !== 'practice') actions.append(button('Remove block', () => {
    if (!window.confirm('Remove this ' + kinds[block.type].toLowerCase() + ' block?')) return
    lesson.blocks.splice(index, 1)
    preview?.lockBlock(block)
    change(true)
    chooseBlock(lesson.blocks[Math.min(index, lesson.blocks.length - 1)])
  }))

  const controls = []
  const unpreviewed = unpreviewedBlocks.has(block)
  if (unpreviewed && block.type === 'heading') {
    controls.push(field('Heading text', input(block.title, (value) => { block.title = value })))
  }
  if (block.type === 'diagram') controls.push(...diagramControls(block))
  if (block.type === 'practice') {
    if (block.drills.length > 1) controls.push(field('Practice instruction', input(block.instruction ?? '', (value) => {
      if (value.trim()) block.instruction = value
      else delete block.instruction
    }, { placeholder: 'Use the default for each variant' })))
    for (const drill of block.drills) {
      controls.push(field(drill.example, input(drill.title, (value) => { drill.title = value })))
    }
  }
  if (block.type === 'list' || block.type === 'text') {
    const items = block.items ?? block.paragraphs
    const name = block.type === 'list' ? 'item' : 'paragraph'
    if (unpreviewed) items.forEach((value, index) => controls.push(field(`${kinds[block.type]} ${index + 1}`, node('textarea', {
      value,
      rows: 3,
      oninput: (event) => { items[index] = event.target.value; change(true) },
    }))))
    controls.push(button('Add ' + name, () => {
      items.push('New ' + name)
      changeBlock(block)
      renderInspector()
    }))
    if (items.length > 1) items.forEach((value, index) => {
      const remove = button('Remove ' + name + ' ' + (index + 1), () => {
        if (!window.confirm('Remove this ' + name + '?')) return
        items.splice(index, 1)
        changeBlock(block)
        renderInspector()
      })
      remove.title = value
      controls.push(remove)
    })
  }
  return [panel(kinds[block.type], actions, ...controls)]
}

function linksPanel(lesson, key, title) {
  const links = lesson[key] ?? []
  const section = node('details', { className: 'panel', open: inspector.querySelector(`[data-links="${key}"]`)?.open ?? false })
  section.dataset.links = key
  section.append(node('summary', {}, title))
  links.forEach((link, index) => {
    section.append(node('div', { className: 'ref-entry' },
      field('Label', input(link.label, (value) => { link.label = value })),
      field('URL', input(link.href, (value) => { link.href = value }, { type: 'url' })),
      button('Remove link', () => {
        if (!window.confirm('Remove this link?')) return
        links.splice(index, 1)
        change(true)
        renderInspector()
      })))
  })
  section.append(button('Add link', () => {
    lesson[key] = links
    links.push({ label: 'New link', href: '' })
    change(true)
    renderInspector()
    inspector.querySelector(`[data-links="${key}"] .ref-entry:last-of-type input`)?.focus()
  }))
  return section
}

function renderInspector() {
  const lesson = currentLesson()
  if (lesson) {
    inspector.replaceChildren(structure(lesson), ...blockDetails(lesson), linksPanel(lesson, 'references', 'References'),
      linksPanel(lesson, 'credits', 'Example credits'))
    return
  }
  const { overview } = content
  inspector.replaceChildren(panel('Overview settings',
    field('Browser tab title', input(overview.pageTitle, (value) => { overview.pageTitle = value })),
    node('p', {}, 'Edit the section headings and technique family descriptions directly on the page.')))
}

try {
  const response = await fetch('./content')
  if (!response.ok) throw new Error('Could not load the lessons.')
  const data = await response.json()
  content = data.content
  revision = data.revision
  examples = data.examples
  saved = structuredClone(content)
  updatePicker()
  renderInspector()
  loadPreview()
  setMode(true)
  report('Saved to file')
} catch (error) {
  report(error.message, 'error')
}
