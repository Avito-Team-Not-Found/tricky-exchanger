import './ui.scss';

interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className = '' }: BrandLogoProps) {
  return (
    <span className={`brand-logo ${className}`.trim()}>
      <img className="brand-logo__icon" src="/favicon.svg" alt="" />
      <span className="brand-logo__text">Меняйка</span>
    </span>
  );
}
