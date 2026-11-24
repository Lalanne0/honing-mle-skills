import { Link, type RouteObject } from 'react-router'
import { DesignPage } from './design/DesignPage'
import { ChallengePage } from './pages/ChallengePage'
import { IntroPage } from './pages/IntroPage'
import { StartPage } from './pages/StartPage'
import { AppShell } from './shell/AppShell'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <StartPage /> },
      { path: '/c/:id', element: <ChallengePage /> },
      {
        // Placeholder until the history and stats page (VIN-19) lists past challenges here.
        path: '/history',
        element: <IntroPage title="History">Your past challenges and scores will show up here.</IntroPage>,
      },
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
