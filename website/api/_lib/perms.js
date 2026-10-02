// Every permission the panel knows about. Owners always have all of them.
// The admin UI reads this list, so adding a permission here shows it there too.
export const CATALOG = [
  {
    group: "Noticeboard",
    perms: [
      ["notices.view", "Open the noticeboard section"],
      ["notices.create", "Post new notices"],
      ["notices.edit", "Edit notices (title, text, pin, how often it shows)"],
      ["notices.toggle", "Show or hide notices on the website"],
      ["notices.delete", "Delete notices"],
    ],
  },
  {
    group: "Site editor",
    perms: [
      ["content.view", "Open the site editor"],
      ["content.edit_text", "Edit texts on the website"],
      ["content.edit_images", "Change images and upload new ones"],
      ["content.revert", "Undo edits back to the original"],
    ],
  },
  {
    group: "Statistics",
    perms: [
      ["stats.view", "See statistics"],
      ["stats.reset", "Reset all statistics to zero"],
    ],
  },
  {
    group: "Team and roles",
    perms: [
      ["users.view", "See the team list"],
      ["users.create", "Create accounts (only for lower roles)"],
      ["users.edit", "Change name and role, enable or disable accounts"],
      ["users.permissions", "Change one member's own permissions"],
      ["users.reset_password", "Reset other members' passwords"],
      ["users.delete", "Delete accounts"],
      ["roles.edit", "Change what a role can do (only lower roles)"],
    ],
  },
  {
    group: "Activity log",
    perms: [["logs.view", "See who did what"]],
  },
];

export const ALL_PERMS = CATALOG.flatMap((g) => g.perms.map(([p]) => p));
const PERM_SET = new Set(ALL_PERMS);

export const ROLES = ["owner", "admin", "moderator"];
export const RANK = { owner: 3, admin: 2, moderator: 1 };
export const EDITABLE_ROLES = ["admin", "moderator"];

export const DEFAULT_ROLE_PERMS = {
  admin: [
    "notices.view", "notices.create", "notices.edit", "notices.toggle", "notices.delete",
    "content.view", "content.edit_text", "content.edit_images", "content.revert",
    "stats.view",
    "users.view", "users.create", "users.edit", "users.reset_password",
    "logs.view",
  ],
  moderator: [
    "notices.view", "notices.create", "notices.edit", "notices.toggle",
    "content.view", "content.edit_text",
    "stats.view",
  ],
};

export function isPerm(p) {
  return PERM_SET.has(p);
}

export function cleanPermList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter(isPerm))];
}

export function cleanOverrides(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    if (isPerm(k) && (v === "allow" || v === "deny")) out[k] = v;
  }
  return out;
}

export function effectivePerms(role, rolePerms, overrides) {
  if (role === "owner") return [...ALL_PERMS];
  const set = new Set(rolePerms || []);
  for (const [p, v] of Object.entries(overrides || {})) {
    if (v === "allow") set.add(p);
    if (v === "deny") set.delete(p);
  }
  return ALL_PERMS.filter((p) => set.has(p));
}
