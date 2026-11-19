import { createFileRoute, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import { ImportPuzzle } from '../components/ImportPuzzle'

export const Route = createFileRoute('/import')({ component: ImportPage })

function ImportPage() {
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  return <ImportPuzzle fullPage close={() => {
    if (canGoBack) router.history.back()
    else void navigate({ to: '/', search: {}, replace: true })
  }} />
}
