import { AppProviders } from './providers'
import { RouterProvider } from './router/RouterProvider'

export function App() {
  return (
    <AppProviders>
      <RouterProvider />
    </AppProviders>
  )
}
