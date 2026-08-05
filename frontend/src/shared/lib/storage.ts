const TOKEN_KEY = 'tricky_exchanger_token';

export const tokenStorage = {
  get(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },
  remove(): void {
    localStorage.removeItem(TOKEN_KEY);
  },
};
