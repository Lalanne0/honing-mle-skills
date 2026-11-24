import type { RouteObject } from 'react-router'
import { DesignPage } from './design/DesignPage'
import { ChallengePage } from './pages/ChallengePage'
import { HistoryPage } from './pages/HistoryPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PracticePage } from './pages/PracticePage'
import { AppShell } from './shell/AppShell'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <PracticePage /> },
      { path: '/c/:id', element: <ChallengePage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '/design', element: <DesignPage /> },
]
