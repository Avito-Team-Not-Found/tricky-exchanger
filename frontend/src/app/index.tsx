import { Typography } from 'antd'

import { AppProviders } from './providers'

export function App() {
  return (
    <AppProviders>
      <main className="page-container">
        <Typography.Title level={1}>Tricky Exchanger</Typography.Title>
      </main>
    </AppProviders>
  )
}
