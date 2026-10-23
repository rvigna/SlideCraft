import { Menu, MenuItem as CarbonMenuItem, MenuItemDivider } from '@carbon/react';
import { useUi, type MenuItem } from '../store/ui';

export function openContextMenu(x: number, y: number, items: MenuItem[], label = 'Context menu') {
  useUi.setState({ menu: { x, y, items, label } });
}

export const closeContextMenu = () => useUi.setState({ menu: null });

function renderItems(items: MenuItem[]) {
  return items.map((item, i) => {
    if (item === 'divider') return <MenuItemDivider key={`d${i}`} />;
    return (
      <CarbonMenuItem
        key={item.label}
        label={item.label}
        shortcut={item.shortcut}
        renderIcon={item.icon}
        disabled={item.disabled}
        kind={item.danger ? 'danger' : 'default'}
        onClick={item.children ? undefined : () => { closeContextMenu(); item.onClick?.(); }}
      >
        {item.children ? renderItems(item.children) : undefined}
      </CarbonMenuItem>
    );
  });
}

/** Single host for every context menu and menubar dropdown */
export function ContextMenuHost() {
  const menu = useUi(s => s.menu);
  if (!menu) return null;
  return (
    <Menu
      key={`${menu.x},${menu.y},${menu.label}`}
      className="sc-menu"
      label={menu.label}
      open
      mode="full"
      size="sm"
      x={menu.x}
      y={menu.y}
      onClose={closeContextMenu}
    >
      {renderItems(menu.items)}
    </Menu>
  );
}
