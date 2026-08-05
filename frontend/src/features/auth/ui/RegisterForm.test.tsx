import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp } from 'antd'
import { AxiosError } from 'axios'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { store } from '@app/store'
import { logout } from '@app/store/slices/userSlice'

import { registerRequest } from '../api/authApi'

import { RegisterForm } from './RegisterForm'

vi.mock('../api/authApi', () => ({
  registerRequest: vi.fn(),
}))

const mockedRegisterRequest = vi.mocked(registerRequest)

function setup() {
  return render(
    <Provider store={store}>
      <AntApp>
        <MemoryRouter initialEntries={['/register']}>
          <Routes>
            <Route path="/register" element={<RegisterForm />} />
            <Route path="/products" element={<div>products screen</div>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </Provider>,
  )
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Имя/i), 'Новый Пользователь')
  await user.type(screen.getByLabelText(/Email/i), 'new@example.com')
  await user.type(screen.getByLabelText(/^Пароль$/), 'password123')
}

describe('RegisterForm', () => {
  beforeEach(() => {
    localStorage.clear()
    store.dispatch(logout())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stays disabled until all fields are valid', async () => {
    const user = userEvent.setup()
    setup()

    const submit = screen.getByRole('button', { name: /Зарегистрироваться/ })
    expect(submit).toBeDisabled()

    await fillValidForm(user)
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/Повторите пароль/i), 'password123')
    expect(submit).toBeEnabled()
  })

  it('stays disabled when passwords do not match', async () => {
    const user = userEvent.setup()
    setup()

    await fillValidForm(user)
    await user.type(screen.getByLabelText(/Повторите пароль/i), 'different')
    expect(screen.getByRole('button', { name: /Зарегистрироваться/ })).toBeDisabled()
  })

  it('registers, stores the session and redirects to /products', async () => {
    const user = userEvent.setup()
    mockedRegisterRequest.mockResolvedValue({
      token: 'jwt',
      user: { id: '1', name: 'Новый Пользователь', email: 'new@example.com' },
    })
    setup()

    await fillValidForm(user)
    await user.type(screen.getByLabelText(/Повторите пароль/i), 'password123')
    await user.click(screen.getByRole('button', { name: /Зарегистрироваться/ }))

    expect(await screen.findByText('products screen')).toBeInTheDocument()
    expect(mockedRegisterRequest).toHaveBeenCalledWith(
      'Новый Пользователь',
      'new@example.com',
      'password123',
    )
    expect(store.getState().user.user?.email).toBe('new@example.com')
  })

  it('shows a toast when the email is already registered', async () => {
    const user = userEvent.setup()
    const error = new AxiosError('Conflict')
    Object.assign(error, { response: { status: 409 } })
    mockedRegisterRequest.mockRejectedValue(error)
    setup()

    await fillValidForm(user)
    await user.type(screen.getByLabelText(/Повторите пароль/i), 'password123')
    await user.click(screen.getByRole('button', { name: /Зарегистрироваться/ }))

    expect(
      await screen.findByText('Пользователь с таким email уже зарегистрирован'),
    ).toBeInTheDocument()
    expect(store.getState().user.token).toBeNull()
  })
})
