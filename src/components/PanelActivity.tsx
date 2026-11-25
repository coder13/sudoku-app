import { createContext, type ReactNode, useContext } from 'react'

export type PanelActivity = 'active' | 'preview' | 'inactive'

const PanelActivityContext = createContext<PanelActivity>('active')

/** Provide a panel's host lifecycle to content that has work to gate while previewed or hidden. */
export function PanelActivityBoundary({ activity, children }: { activity: PanelActivity; children: ReactNode }) {
  return <PanelActivityContext.Provider value={activity}>{children}</PanelActivityContext.Provider>
}

export function usePanelActivity() {
  return useContext(PanelActivityContext)
}
