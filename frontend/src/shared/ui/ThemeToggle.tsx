import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Switch } from 'antd';

interface ThemeToggleProps {
  checked: boolean;
  onChange: () => void;
  className?: string;
}

export function ThemeToggle({ checked, onChange, className }: ThemeToggleProps) {
  return (
    <Switch
      className={className}
      checked={checked}
      onChange={onChange}
      checkedChildren={<MoonOutlined aria-hidden />}
      unCheckedChildren={<SunOutlined aria-hidden />}
      aria-label="Переключить тему"
    />
  );
}
