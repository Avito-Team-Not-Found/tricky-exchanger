import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { store } from '@app/store'
import { loginSucceeded, logout } from '@app/store/slices/userSlice'

import { RedirectIfAuthed } from './RedirectIfAuthed'
import { RequireAuth } from './RequireAuth'

const session = { token: 'jwt', user: { id: '1', name: 'Анна', email: 'anna@example.com' } }

function renderRequireAuth() {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route path="/login" element={<div>login screen</div>} />
          <Route
            path="/private"
            element={
              <RequireAuth>
                <div>private screen</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

function renderRedirectIfAuthed() {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <div>login screen</div>
              </RedirectIfAuthed>
            }
          />
          <Route path="/products" element={<div>products screen</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('RequireAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    store.dispatch(logout())
  })

  it('redirects to /login when there is no token', () => {
    renderRequireAuth()

    expect(screen.getByText('login screen')).toBeInTheDocument()
    expect(screen.queryByText('private screen')).not.toBeInTheDocument()
  })

  it('renders children when a token is present', () => {
    store.dispatch(loginSucceeded(session))
    renderRequireAuth()

    expect(screen.getByText('private screen')).toBeInTheDocument()
    expect(screen.queryByText('login screen')).not.toBeInTheDocument()
  })
})

describe('RedirectIfAuthed', () => {
  beforeEach(() => {
    localStorage.clear()
    store.dispatch(logout())
  })

  it('redirects an authed user away from the login screen', () => {
    store.dispatch(loginSucceeded(session))
    renderRedirectIfAuthed()

    expect(screen.getByText('products screen')).toBeInTheDocument()
    expect(screen.queryByText('login screen')).not.toBeInTheDocument()
  })

  it('shows the login screen for an unauthed user', () => {
    renderRedirectIfAuthed()

    expect(screen.getByText('login screen')).toBeInTheDocument()
    expect(screen.queryByText('products screen')).not.toBeInTheDocument()
  })
})
