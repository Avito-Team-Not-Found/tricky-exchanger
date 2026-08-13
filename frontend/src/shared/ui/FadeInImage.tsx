import { useCallback, useState } from 'react';

import './ui.scss';

interface FadeInImageProps {
  src: string;
  alt: string;
  className?: string;
}

// complete нужен вдобавок к onLoad: кешированная картинка загрузилась раньше обработчика
export function FadeInImage({ src, alt, className }: FadeInImageProps) {
  const [image, setImage] = useState({ src, loaded: false });

  // key={src} перемонтирует <img>, чтобы ref-колбэк заново проверил complete (кеш не ждёт onLoad)
  if (image.src !== src) {
    setImage({ src, loaded: false });
  }

  const checkComplete = useCallback(
    (node: HTMLImageElement | null) => {
      if (node?.complete) setImage((prev) => (prev.loaded ? prev : { src, loaded: true }));
    },
    [src],
  );

  return (
    <img
      key={src}
      className={`fade-in-image${image.loaded ? ' fade-in-image--loaded' : ''}${
        className ? ` ${className}` : ''
      }`}
      src={src}
      alt={alt}
      ref={checkComplete}
      onLoad={() => setImage((prev) => ({ ...prev, loaded: true }))}
      // битый URL показываем как есть, а не прозрачной заглушкой
      onError={() => setImage((prev) => ({ ...prev, loaded: true }))}
    />
  );
}
