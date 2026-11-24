import { Link, type RouteObject } from 'react-router'
import { DesignPage } from './design/DesignPage'
import { ChallengePage } from './pages/ChallengePage'
import { IntroPage } from './pages/IntroPage'
import { AppShell } from './shell/AppShell'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      {
        // Placeholder until the start screen (VIN-16) picks a level and topic here.
        path: '/',
        element: (
          <IntroPage title="Practice">
            Pick a level and a topic, then answer an ML system-design challenge in up to three rounds.
          </IntroPage>
        ),
      },
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
