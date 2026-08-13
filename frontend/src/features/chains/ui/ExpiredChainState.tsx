import { Button } from 'antd';
import { useNavigate } from 'react-router';

import { EmptyState } from '@shared/ui';

export function ExpiredChainState() {
  const navigate = useNavigate();
  return (
    <EmptyState title="Время истекло" description="Дедлайн цепочки прошёл, обмен распался">
      <Button type="primary" size="large" onClick={() => navigate('/exchange-requests')}>
        К моим запросам
      </Button>
    </EmptyState>
  );
}
