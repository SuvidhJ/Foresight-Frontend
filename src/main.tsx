import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MOCKED } from '@/lib/env'
import { router } from '@/app/router'
import './index.css'

/** Starts MSW with only the handler groups of the modules that are still mocked. */
async function startMocks() {
  if (!MOCKED.length) return
  const [{ setupWorker }, { handlerGroups }] = await Promise.all([import('msw/browser'), import('./mocks/handlers')])
  const handlers = MOCKED.flatMap((m) => handlerGroups[m])
  await setupWorker(...handlers).start({ onUnhandledRequest: 'bypass', quiet: true })
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 } },
})

startMocks().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
          <Toaster theme="dark" position="top-center" richColors closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
})
