# App areas & actions (for custom role/permission design)

| # | Area | Actions inside it |
|---|---|---|
| 1 | Dashboard | View only — but visibility itself is gated per your request |
| 2 | Master Data (products, components, categories, BOM templates, inspection templates, vendors, customers) | View / Write |
| 3 | Projects / Orders | View / Create / Edit / Change status |
| 4 | Requisitions | View / Create / Approve |
| 5 | Purchase Orders | View / Create / Edit price (admin-gated today) / Approve price / Delete / Print |
| 6 | Job Work | View / Create / Receive |
| 7 | Goods Receipt (GRN) | View / Make (receive lines) / QC Approve/Reject (IRN) / Print |
| 8 | Inventory (incl. lots, stickers) | View / Adjust / Print stickers |
| 9 | Traceability | View only (read-heavy) |
| 10 | Finished Goods | View / Create / Dispatch |
| 11 | Action Center (Reconciliation) | View / Act |
| 12 | Supplier KPIs | View only |
| 13 | Site Purchases (not its own page — a "log purchase" form embedded on Projects → [project] detail; currently gated to admin/team_lead/team_member, `founder` excluded — looks like an oversight, not intentional) | Create |
| 14 | Admin → Users | Manage roles/users (admin/founder only, always) |
