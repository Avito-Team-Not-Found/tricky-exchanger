export const env = {
  // пустой URL = relative /api/v1 через Vite-proxy (dev) или общий reverse-proxy (prod),
  // чтобы бэкенду не требовался CORS
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '',
};

export const isDev = import.meta.env.DEV;

export const featureChainsEnabled =
  (import.meta.env.VITE_FEATURE_CHAINS as string | undefined) === 'true';
