import type { ReactNode } from 'react'

import { Navigate } from 'react-router'

import { useAppSelector } from '@app/store/hooks'

export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAppSelector((state) => state.user.token)
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return children
}
