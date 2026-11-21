import { createFileRoute, useLocation, useMatch, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { pairingTicket } from '../sudoku/pairing-link'
import { isSyncStep } from '../sudoku/sync-steps'

export const Route = createFileRoute('/sync')({
  ssr: false,
  component: LegacySyncRedirect,
})

function LegacySyncRedirect() {
  const navigate = useNavigate()
  const href = useLocation({ select: location => location.href })
  const step = useMatch({ from: '/sync/$step', shouldThrow: false, select: match => match.params.step })

  // Pairing tickets live in the fragment, which is only available in the browser.
  useEffect(() => {
    const origin = window.location.origin
    const url = new URL(href, origin)
    if (url.pathname !== '/sync' && !url.pathname.startsWith('/sync/')) return
    const ticket = pairingTicket(url.href, origin)
    if (ticket) void navigate({
      to: '/settings/device-sync/$step', params: { step: 'confirm' }, hash: 'pair=' + ticket, replace: true,
    })
    else if (step && isSyncStep(step)) void navigate({
      to: '/settings/device-sync/$step', params: { step }, replace: true,
    })
    else void navigate({ to: '/settings/device-sync', replace: true })
  }, [href, step, navigate])

  return null
}
