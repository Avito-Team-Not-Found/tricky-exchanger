import { Route, Routes } from 'react-router'

import { AuthPage, ForgotPasswordPage } from '@pages/index'

import { RedirectIfAuthed } from './RedirectIfAuthed'

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <AuthPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <AuthPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <RedirectIfAuthed>
            <ForgotPasswordPage />
          </RedirectIfAuthed>
        }
      />
      {/* заглушка на / и неизвестные пути — до появления первой защищённой страницы редиректить некуда */}
      <Route path="*" element={<AuthPage />} />
    </Routes>
  )
}
