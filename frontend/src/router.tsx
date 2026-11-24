import { Link, type RouteObject } from 'react-router'
import { DesignPage } from './design/DesignPage'
import { ChallengePage } from './pages/ChallengePage'
import { HistoryPage } from './pages/HistoryPage'
import { IntroPage } from './pages/IntroPage'
import { StartPage } from './pages/StartPage'
import { AppShell } from './shell/AppShell'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <StartPage /> },
      { path: '/c/:id', element: <ChallengePage /> },
      { path: '/history', element: <HistoryPage /> },
      {
        path: '*',
        element: (
          <IntroPage title="Page not found">
            There's nothing at this address. <Link to="/">Back to Practice</Link>
          </IntroPage>
        ),
      },
    ],
  },
  { path: '/design', element: <DesignPage /> },
]
