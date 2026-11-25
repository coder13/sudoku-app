import { createContext, useContext, type RefObject } from 'react'

/** Named measurement and resize targets shared by the desktop play host and its slots. */
export type PlayLayoutAnchors = {
  layoutRoot: RefObject<HTMLDivElement | null>
  page: RefObject<HTMLElement | null>
  edges: RefObject<HTMLDivElement | null>
  workspace: RefObject<HTMLDivElement | null>
  divider: RefObject<HTMLDivElement | null>
  puzzleStack: RefObject<HTMLDivElement | null>
  puzzleCard: RefObject<HTMLElement | null>
  inputStack: RefObject<HTMLDivElement | null>
  controls: RefObject<HTMLElement | null>
  hintSlot: RefObject<HTMLDivElement | null>
  hint: RefObject<HTMLElement | null>
}

export const PlayLayoutAnchorsContext = createContext<PlayLayoutAnchors | null>(null)

export function usePlayLayoutAnchors() {
  return useContext(PlayLayoutAnchorsContext)
}

export function isPlayLayoutResizing(anchors: PlayLayoutAnchors | null) {
  return Boolean(anchors?.layoutRoot.current?.hasAttribute('data-layout-resizing') ||
    anchors?.workspace.current?.hasAttribute('data-layout-resizing'))
}
