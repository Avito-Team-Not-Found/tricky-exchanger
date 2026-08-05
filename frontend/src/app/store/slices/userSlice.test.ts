import { beforeEach, describe, expect, it } from 'vitest'

import { store } from '../index'

import { loginSucceeded, logout } from './userSlice'

const session = { token: 'jwt-token', user: { id: '1', name: 'Анна', email: 'anna@example.com' } }

describe('user slice', () => {
  beforeEach(() => {
    localStorage.clear()
    store.dispatch(logout())
  })

  it('starts logged out', () => {
    expect(store.getState().user.token).toBeNull()
    expect(store.getState().user.user).toBeNull()
  })

  it('stores the session and persists it to localStorage', () => {
    store.dispatch(loginSucceeded(session))

    expect(store.getState().user).toEqual(session)
    expect(localStorage.getItem('tricky_exchanger_token')).toBe('jwt-token')
    expect(localStorage.getItem('tricky_exchanger_user')).toBe(JSON.stringify(session.user))
  })

  it('clears the session and localStorage on logout', () => {
    store.dispatch(loginSucceeded(session))
    store.dispatch(logout())

    expect(store.getState().user.token).toBeNull()
    expect(store.getState().user.user).toBeNull()
    expect(localStorage.getItem('tricky_exchanger_token')).toBeNull()
    expect(localStorage.getItem('tricky_exchanger_user')).toBeNull()
  })
})
