// Pure variant→BOM expansion logic (no I/O) so it can be unit-verified.

export type ExpandItem = {
  id: string;
  product_id: string;
  variant_selections: Record<string, unknown> | null;
  quantity: number;
};

export type TemplateLine = {
  component_id: string | null;
  quantity: number;
  is_variant_driven: boolean;
  variant_rule: { param?: string; map?: Record<string, { component_no?: string; qty?: number }> } | null;
};

export type ExpandedLine = {
  project_line_item_id: string;
  component_id: string;
  required_qty: number;
};

export type ExpandResult = {
  lines: ExpandedLine[];
  skippedNoTemplate: number;
  skippedNoMatch: number;
};

/**
 * Expand each project line item against its product's active BOM template:
 *  - common/normal lines → template component × line-item quantity
 *  - variant-driven lines → component & qty resolved from `variant_rule` using the
 *    line item's selected variant value, then × line-item quantity.
 */
export function expandBomLines(opts: {
  items: ExpandItem[];
  templateByProduct: Map<string, string>;
  linesByTemplate: Map<string, TemplateLine[]>;
  compByNo: Map<string, string>;
}): ExpandResult {
  const { items, templateByProduct, linesByTemplate, compByNo } = opts;
  const lines: ExpandedLine[] = [];
  let skippedNoTemplate = 0;
  let skippedNoMatch = 0;

  for (const item of items) {
    const templateId = templateByProduct.get(item.product_id);
    if (!templateId) {
      skippedNoTemplate++;
      continue;
    }
    const sels = item.variant_selections ?? {};
    const qty = Number(item.quantity ?? 1) || 1;

    for (const tl of linesByTemplate.get(templateId) ?? []) {
      let componentId = tl.component_id;
      let qtyPer = Number(tl.quantity ?? 0);

      if (tl.is_variant_driven && tl.variant_rule) {
        const rule = tl.variant_rule;
        const key = rule.param != null ? String(sels[rule.param] ?? "") : "";
        const entry = rule.map?.[key];
        if (!entry) {
          skippedNoMatch++;
          continue;
        }
        if (entry.component_no) componentId = compByNo.get(entry.component_no.toLowerCase()) ?? null;
        if (entry.qty != null) qtyPer = Number(entry.qty);
      }

      if (!componentId) continue;
      lines.push({
        project_line_item_id: item.id,
        component_id: componentId,
        required_qty: qtyPer * qty,
      });
    }
  }

  return { lines, skippedNoTemplate, skippedNoMatch };
}
