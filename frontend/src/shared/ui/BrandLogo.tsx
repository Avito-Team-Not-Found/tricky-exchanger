import { SwapOutlined } from '@ant-design/icons'

import './ui.scss'

interface BrandLogoProps {
  className?: string
}

export function BrandLogo({ className = '' }: BrandLogoProps) {
  return (
    <span className={`brand-logo ${className}`.trim()}>
      <SwapOutlined className="brand-logo__icon" aria-hidden />
      <span className="brand-logo__text">Tricky Exchanger</span>
    </span>
  )
}
