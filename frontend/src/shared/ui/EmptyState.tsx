import type { ReactNode } from 'react';

import { InboxOutlined } from '@ant-design/icons';

import './ui.scss';

interface EmptyStateProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function EmptyState({ title, description, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <InboxOutlined className="empty-state__icon" aria-hidden />
      <p className="empty-state__title">{title}</p>
      {description ? <p className="empty-state__description">{description}</p> : null}
      {children ? <div className="empty-state__actions">{children}</div> : null}
    </div>
  );
}
