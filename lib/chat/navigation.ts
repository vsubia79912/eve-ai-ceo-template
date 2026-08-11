export type SidebarNavItem = {
  readonly href: "/status" | "/tasks";
  readonly icon: "activity" | "briefcase";
  readonly label: string;
  readonly match: "exact" | "prefix";
};

export const SIDEBAR_NAV_ITEMS: readonly SidebarNavItem[] = [
  {
    href: "/tasks",
    icon: "briefcase",
    label: "Engineering tasks",
    match: "prefix",
  },
  {
    href: "/status",
    icon: "activity",
    label: "Status",
    match: "exact",
  },
];

export function isSidebarNavItemActive(pathname: string | null, item: SidebarNavItem) {
  if (!pathname) {
    return false;
  }

  if (item.match === "prefix") {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return pathname === item.href;
}
