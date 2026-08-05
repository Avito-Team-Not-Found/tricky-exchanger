const TOKEN_KEY = 'tricky_exchanger_token'
const USER_KEY = 'tricky_exchanger_user'

export const tokenStorage = {
  get(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  },
  set(token: string): void {
    localStorage.setItem(TOKEN_KEY, token)
  },
  remove(): void {
    localStorage.removeItem(TOKEN_KEY)
  },
}

export const userStorage = {
  get<T>(): T | null {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },
  set<T>(user: T): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  remove(): void {
    localStorage.removeItem(USER_KEY)
  },
}
