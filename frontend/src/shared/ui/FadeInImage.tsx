import { useState } from 'react';

import './ui.scss';

interface FadeInImageProps {
  src: string;
  alt: string;
  className?: string;
}

// Фото проявляется по готовности картинки, иначе она «щёлкает» в кадре, когда догрузится.
// Проверка complete нужна вдобавок к onLoad: у картинки из кеша load мог сработать раньше
// обработчика, и тогда фото осталось бы прозрачным навсегда
export function FadeInImage({ src, alt, className }: FadeInImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <img
      className={`fade-in-image${loaded ? ' fade-in-image--loaded' : ''}${
        className ? ` ${className}` : ''
      }`}
      src={src}
      alt={alt}
      ref={(node) => {
        if (node?.complete) setLoaded(true);
      }}
      onLoad={() => setLoaded(true)}
    />
  );
}
