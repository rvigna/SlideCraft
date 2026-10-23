import type { TableCell, TableObject } from './types';

/** Effective look of one cell: explicit cell styling beats header/banding, which beat the table fill */
export function cellStyle(obj: TableObject, r: number, cell: TableCell) {
  const header = obj.headerRow && r === 0;
  const banded = obj.bandedRows && !header && (r - (obj.headerRow ? 1 : 0)) % 2 === 1;
  const fill = cell.fill ?? (header ? obj.headerFill : banded ? obj.bandFill : obj.backgroundColor);
  return {
    fill: fill === 'transparent' ? undefined : fill,
    color: cell.color ?? (header ? obj.headerColor : obj.color),
    bold: cell.bold ?? header,
    align: cell.align ?? obj.textAlign,
  };
}
