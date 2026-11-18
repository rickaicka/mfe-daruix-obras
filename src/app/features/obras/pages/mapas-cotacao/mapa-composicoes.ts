import type { QuotationComposition, QuotationItem } from '../../models/mapa-cotacao.model';

interface CompositionRow extends QuotationComposition {
  kind: 'composition';
  depth: number;
  children: ComparisonRow[];
}

interface ItemRow {
  kind: 'item';
  key: string;
  depth: number;
  item: QuotationItem;
  itemIndex: number;
}

type ComparisonRow = CompositionRow | ItemRow;

export function buildComparisonTree(items: readonly QuotationItem[]): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const groups = new Map<string, CompositionRow>();

  items.forEach((item, itemIndex) => {
    let siblings = rows;
    const path = item.composition_path ?? [];

    path.forEach(({ key, label }, depth) => {
      let group = groups.get(key);
      if (!group) {
        group = { kind: 'composition', key, label, depth, children: [] };
        groups.set(key, group);
        siblings.push(group);
      }
      siblings = group.children;
    });

    siblings.push({ kind: 'item', key: `item:${item.id}`, depth: path.length, item, itemIndex });
  });

  return rows;
}

export function visibleComparisonRows(
  tree: readonly ComparisonRow[],
  expanded: ReadonlySet<string>,
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const visit = (branch: readonly ComparisonRow[]) => {
    for (const row of branch) {
      rows.push(row);
      if (row.kind === 'composition' && expanded.has(row.key)) visit(row.children);
    }
  };
  visit(tree);
  return rows;
}
