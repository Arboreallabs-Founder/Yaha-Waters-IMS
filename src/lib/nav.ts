import type { Role } from "@/lib/roles";

export type NavItem = {
  label: string;
  href: string;
  /** Roles allowed to see this item. Empty = all signed-in roles. */
  roles?: Role[];
  /** Milestone status — items not yet built are shown disabled. */
  status?: "live" | "soon";
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/", status: "live" }],
  },
  {
    title: "Catalogue",
    items: [
      { label: "Products", href: "/masters/products", status: "live" },
      { label: "Components", href: "/masters/components", status: "live" },
      { label: "Categories", href: "/masters/categories", status: "live" },
      { label: "BOM Templates", href: "/masters/bom-templates", status: "live" },
    ],
  },
  {
    title: "Partners",
    items: [
      { label: "Vendors", href: "/masters/vendors", status: "live" },
      { label: "Customers", href: "/masters/customers", status: "live" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Projects / Orders", href: "/projects", status: "live" },
      { label: "Requisitions", href: "/requisitions", status: "live" },
      { label: "Purchase Orders", href: "/purchase-orders", status: "live" },
      { label: "Job Work", href: "/job-work", status: "live" },
      { label: "Goods Receipt", href: "/grn", status: "live" },
      { label: "Inventory", href: "/inventory", status: "live" },
      { label: "Finished Goods", href: "/finished-goods", status: "live" },
    ],
  },
  {
    title: "Insight",
    items: [
      { label: "Action Center", href: "/reconciliation", status: "live" },
      { label: "Supplier KPIs", href: "/suppliers", status: "live" },
    ],
  },
  {
    title: "Admin",
    items: [{ label: "Users", href: "/admin/users", roles: ["admin"], status: "live" }],
  },
];

export function visibleGroups(role: Role): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}
