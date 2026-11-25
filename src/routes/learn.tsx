import { createFileRoute, Link, Outlet, useMatch, useRouterState } from '@tanstack/react-router'
import { ChevronDown, List } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { lessonsByVariant } from '../sudoku/lesson-difficulties'
import { learnFundamentals, lessonRoutes } from '../sudoku/lessons'
import '../lessons.css'

export const Route = createFileRoute('/learn')({ component: LearnLayout })

const DEFAULT_LEARN_WIDTH = 1320
const DEFAULT_LEARN_ARTICLE_WIDTH = 810
const MAX_LEARN_WIDTH = 1920

function boundedLearnWidth(width: number, max: number) {
  return Math.max(DEFAULT_LEARN_WIDTH, Math.min(max, Math.round(width)))
}

export function LearnLayout() {
  const article = useRouterState({ select: ({ location }) => location.pathname })
  const [learnWidth, setLearnWidth] = useState(DEFAULT_LEARN_WIDTH)
  const [maxLearnWidth, setMaxLearnWidth] = useState(MAX_LEARN_WIDTH)
  const resizeStart = useRef<{ pointerId: number; x: number; width: number } | null>(null)

  useEffect(() => {
    const update = () => {
      const max = Math.max(DEFAULT_LEARN_WIDTH, Math.min(MAX_LEARN_WIDTH, window.innerWidth))
      resizeStart.current = null
      setMaxLearnWidth(max)
      setLearnWidth(width => boundedLearnWidth(width, max))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || resizeStart.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeStart.current = { pointerId: event.pointerId, x: event.clientX, width: learnWidth }
  }

  function moveResize(event: ReactPointerEvent<HTMLDivElement>) {
    const start = resizeStart.current
    if (!start || start.pointerId !== event.pointerId) return
    // The Learn wrapper stays centered, so its right edge moves by half of each width change.
    setLearnWidth(boundedLearnWidth(start.width + (event.clientX - start.x) * 2, maxLearnWidth))
  }

  function finishResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (resizeStart.current?.pointerId === event.pointerId) resizeStart.current = null
  }

  function adjustLearnWidth(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 128 : 32
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      setLearnWidth(width => boundedLearnWidth(width + (event.key === 'ArrowRight' ? step : -step), maxLearnWidth))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setLearnWidth(DEFAULT_LEARN_WIDTH)
    } else if (event.key === 'End') {
      event.preventDefault()
      setLearnWidth(maxLearnWidth)
    }
  }

  const articleWidth = DEFAULT_LEARN_ARTICLE_WIDTH + learnWidth - DEFAULT_LEARN_WIDTH
  const maxArticleWidth = DEFAULT_LEARN_ARTICLE_WIDTH + maxLearnWidth - DEFAULT_LEARN_WIDTH
  const pageStyle = {
    '--learn-width': `${learnWidth}px`,
    '--learn-content-expansion': `${learnWidth - DEFAULT_LEARN_WIDTH}px`,
  } as CSSProperties

  return (
    <div className="learn-page" style={pageStyle}>
      <TechniqueNavigation />
      <main className="learn-content" id="learn-content-area">
        <div className="advanced-article-tab" aria-hidden="true">Article</div>
        <div className="learn-content-scroll motion-screen" key={article}><Outlet /></div>
        <div className="learn-content-resizer" role="separator" tabIndex={0} aria-orientation="vertical"
          aria-label="Learn content width" aria-controls="learn-content-area"
          aria-valuemin={DEFAULT_LEARN_ARTICLE_WIDTH} aria-valuemax={maxArticleWidth} aria-valuenow={articleWidth}
          aria-valuetext={`${articleWidth} pixels`} onPointerDown={startResize} onPointerMove={moveResize}
          onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={finishResize}
          onKeyDown={adjustLearnWidth} />
      </main>
    </div>
  )
}

const activeOptions = { exact: true, includeSearch: false }

export function TechniqueNavigation() {
  const technique = useMatch({ from: '/learn/$technique', shouldThrow: false, select: ({ params }) => params.technique })
  const current = technique ? lessonRoutes.get(technique) : undefined
  const [expanded, setExpanded] = useState(false)
  const sidebar = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => setExpanded(false), [technique])

  useEffect(() => {
    const nav = list.current
    if (!nav?.clientHeight) return
    if (!technique || technique === learnFundamentals.id) {
      nav.scrollTop = 0
      return
    }
    const active = nav.querySelector('[aria-current="page"]')
    if (!active) return
    const viewport = nav.getBoundingClientRect()
    const item = active.getBoundingClientRect()
    if (item.top < viewport.top + 6 || item.bottom > viewport.bottom - 6) {
      nav.scrollTop += (item.top + item.bottom - viewport.top - viewport.bottom) / 2
    }
  }, [technique, expanded])

  useEffect(() => {
    if (!expanded) return
    function dismiss(event: PointerEvent) {
      if (!sidebar.current?.contains(event.target as Node)) setExpanded(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [expanded])

  function select(event: MouseEvent<HTMLAnchorElement>) {
    if (!expanded || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    setExpanded(false)
    toggle.current?.focus({ preventScroll: true })
  }

  return (
    <aside className="learn-navigation" ref={sidebar} data-expanded={expanded}
      onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setExpanded(false) }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !expanded) return
        event.stopPropagation()
        setExpanded(false)
        toggle.current?.focus({ preventScroll: true })
      }}>
      <p className="learn-nav-title">Articles</p>
      <button type="button" className="learn-nav-toggle" ref={toggle} aria-expanded={expanded} aria-controls="technique-navigation"
        onClick={() => setExpanded((open) => !open)}>
        <List size={18} aria-hidden="true" />
        <span>Articles</span>
        <ChevronDown className="learn-nav-chevron" size={18} aria-hidden="true" />
      </button>
      <nav className="learn-nav-panel" id="technique-navigation" aria-label="Sudoku articles">
        <div className="learn-nav-intro">
          <Link to="/learn" activeOptions={activeOptions} className="learn-nav-link" onClick={select}>Overview</Link>
          <Link to="/learn/$technique" params={{ technique: learnFundamentals.id }} activeOptions={activeOptions}
            className="learn-nav-link" onClick={select}>{learnFundamentals.title}</Link>
        </div>
        <div className="learn-nav-list" ref={list} key={current?.id}>
          {lessonsByVariant.map(({ title, group, difficulties }) => <details className="learn-nav-variant" key={title}
            open={current && current !== learnFundamentals
              ? difficulties.some(({ families }) => families.some(({ lessons }) => lessons.includes(current)))
              : !group}>
            <summary>{title}</summary>
            {difficulties.map(({ title, families }) => {
              const lessons = families.flatMap(family => family.lessons)
              const links = <ul>{lessons.map(({ id, title }) => <li key={id}>
                <Link to="/learn/$technique" params={{ technique: id }} activeOptions={activeOptions}
                  className="learn-nav-link" aria-current={current?.id === id ? 'page' : undefined} onClick={select}>{title}</Link>
              </li>)}</ul>
              return <details className="learn-nav-group" key={title} open={current && lessons.includes(current)}>
                <summary>{title}</summary>{links}
              </details>
            })}
          </details>)}
        </div>
      </nav>
    </aside>
  )
}
