// Бэкенд собирает imageUrl из внутрисетевого имени MinIO (minio:9000), которое браузер
// не резолвит. Пока бэкенд не отдаёт публичный адрес (аналог MINIO_PUBLIC_ENDPOINT),
// подменяем хост на доступный с машины разработчика; для уже публичных URL — no-op.
export function publicImageUrl(url: string | null): string | undefined {
  if (!url) return undefined;
  return url.replace(/^https?:\/\/minio:9000\//, 'http://localhost:9000/');
}
