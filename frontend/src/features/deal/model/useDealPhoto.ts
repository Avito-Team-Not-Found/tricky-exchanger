import { useState } from 'react';

import { jsonStorage } from '@shared/lib/storage';

const MAX_SIDE = 512;
const JPEG_QUALITY = 0.7;

export function photoKey(chainId: number, requestId: number): string {
  return `deal:photo:${chainId}:${requestId}`;
}

// Сжатие фото упаковки перед отправкой: canvas ужимает файл до 512px по большей стороне и
// отдаёт JPEG 0.7 — иначе снимок не влезет в квоту localStorage
export async function compressImageFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas is not supported');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image failed to load'));
    image.src = src;
  });
}

// Фото упаковки перед отправкой: хранится в localStorage на пару «цепочка + заявка». Запись в
// try/catch — квота может кончиться, тогда фото остаётся в состоянии страницы, а кнопка
// отправки всё равно разблокируется (тост пользователю не показываем).
export function useDealPhoto(chainId: number, requestId: number) {
  const key = photoKey(chainId, requestId);
  const [photo, setPhoto] = useState<string | null>(() => jsonStorage.get<string>(key));

  const setPhotoFile = async (file: File) => {
    const dataUrl = await compressImageFile(file);
    jsonStorage.set(key, dataUrl);
    setPhoto(dataUrl);
  };

  const removePhoto = () => {
    jsonStorage.remove(key);
    setPhoto(null);
  };

  return { photo, setPhotoFile, removePhoto, isPhotoSet: photo !== null };
}
