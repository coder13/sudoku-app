import { createFileRoute, Link, Outlet, useMatch, useRouterState } from '@tanstack/react-router'
import { ChevronDown, List } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { lessonsByVariant } from '../sudoku/lesson-difficulties'
import { learnFundamentals, lessonRoutes } from '../sudoku/lessons'
import '../lessons.css'

export const Route = createFileRoute('/learn')({ component: LearnLayout })

export function LearnLayout() {
  const article = useRouterState({ select: ({ location }) => location.pathname })
  return (
    <div className="learn-page">
      <TechniqueNavigation />
      <main className="learn-content">
        <div className="advanced-article-tab" aria-hidden="true">Article</div>
        <div className="learn-content-scroll motion-screen" key={article}><Outlet /></div>
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
            {difficulties.map(({ title, families, count }) => {
              const lessons = families.flatMap(family => family.lessons)
              const links = <ul>{lessons.map(({ id, title }) => <li key={id}>
                <Link to="/learn/$technique" params={{ technique: id }} activeOptions={activeOptions}
                  className="learn-nav-link" aria-current={current?.id === id ? 'page' : undefined} onClick={select}>{title}</Link>
              </li>)}</ul>
              return !group && count > 8
                ? <details className="learn-nav-group" key={title} open={current && lessons.includes(current)}>
                    <summary>{title}</summary>{links}
                  </details>
                : <div className="learn-nav-group" key={title}><h2>{title}</h2>{links}</div>
            })}
          </details>)}
        </div>
      </nav>
    </aside>
  )
}
