import assert from 'node:assert/strict'
import { cloneElement, createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type Props = Record<string, unknown>
type Component = (props: Props) => ReactNode

// Capture host elements, including their event props, while React renders each
// function component in its own boundary. Memo wrappers still render on mount.
export function renderedElements(component: Component, props: Props): ReactElement<Props>[] {
  const tree: ReactElement<Props>[] = []

  function visit(node: ReactNode): ReactNode {
    if (Array.isArray(node)) return node.map(visit)
    if (!isValidElement<Props>(node)) return node
    let type: unknown = node.type
    while (type && typeof type === 'object' && '$$typeof' in type && type.$$typeof === Symbol.for('react.memo')) {
      type = (type as { type: unknown }).type
    }
    if (typeof type === 'function') {
      return createElement(Capture, { key: node.key, component: type as Component, props: node.props })
    }
    assert.ok(typeof type === 'string' || type === Fragment, 'The capture helper must render every component type')
    tree.push(node)
    const children = visit(node.props.children as ReactNode)
    return Array.isArray(children) ? cloneElement(node, undefined, ...children) : cloneElement(node, undefined, children)
  }

  function Capture({ component, props }: { component: Component; props: Props }) {
    return visit(component(props))
  }

  renderToStaticMarkup(createElement(Capture, { component, props }))
  assert.ok(tree.length, 'The captured component tree must contain rendered elements')
  return tree
}
