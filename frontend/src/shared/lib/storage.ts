const TOKEN_KEY = 'tricky_exchanger_token';
const USER_KEY = 'tricky_exchanger_user';
const THEME_KEY = 'tricky_exchanger_theme';

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

// ключ читает и инлайн-скрипт в index.html (до первого кадра) — менять значение нужно в обоих местах
export const themeStorage = {
  key: THEME_KEY,
  get(): 'light' | 'dark' | null {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  },
  set(mode: 'light' | 'dark'): void {
    localStorage.setItem(THEME_KEY, mode);
  },
};

export const userStorage = {
  get<T>(): T | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  set<T>(user: T): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  remove(): void {
    localStorage.removeItem(USER_KEY);
  },
};

// типизированный доступ к JSON-значениям по произвольному ключу — для клиентских имитаций сделки
// (адрес ПВЗ, фото упаковки, флаг спора). Возвращает false, если запись не влезла в квоту
// localStorage: фото упаковки при этом остаётся только в состоянии страницы
export const jsonStorage = {
  get<T>(key: string): T | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  set<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    localStorage.removeItem(key);
  },
};
