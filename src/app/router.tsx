import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { useSession } from '@/store/session'
import { AppShell, HOME } from './AppShell'

// The 3D pages (three.js is most of the bundle) and the chart pages load on demand.
const CabPage = lazy(() => import('@/pages/CabPage'))
const StagePage = lazy(() => import('@/pages/StagePage'))
const OverviewPage = lazy(() => import('@/pages/OverviewPage'))
const IncidentsPage = lazy(() => import('@/pages/IncidentsPage'))
const FlagsPage = lazy(() => import('@/pages/FlagsPage'))
const PreShiftPage = lazy(() => import('@/pages/PreShiftPage'))
const TrainingPage = lazy(() => import('@/pages/TrainingPage'))
const SummaryPage = lazy(() => import('@/pages/SummaryPage'))
const EvidencePage = lazy(() => import('@/pages/EvidencePage'))

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>{children}</Suspense>
}

function Home() {
  const role = useSession((s) => s.role)
  return <Navigate to={HOME[role]} replace />
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'preshift', element: <Page><PreShiftPage /></Page> },
      { path: 'cab', element: <Page><CabPage /></Page> },
      { path: 'stage', element: <Page><StagePage /></Page> },
      { path: 'overview', element: <Page><OverviewPage /></Page> },
      { path: 'flags', element: <Page><FlagsPage /></Page> },
      { path: 'incidents', element: <Page><IncidentsPage /></Page> },
      { path: 'training', element: <Page><TrainingPage /></Page> },
      { path: 'summary', element: <Page><SummaryPage /></Page> },
      { path: 'evidence', element: <Page><EvidencePage /></Page> },
      { path: '*', element: <Home /> },
    ],
  },
])
