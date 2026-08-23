import type { ToolPermission } from "./types";

export interface UserToolPermissions {
  userId: string;
  permissions: ToolPermission[];
  updatedAt: number;
}

const DEFAULT_PERMISSIONS: ToolPermission[] = ["web_search", "file_analysis", "url_analysis"];

export async function getUserPermissions(_userId: string): Promise<ToolPermission[]> {
  return DEFAULT_PERMISSIONS;
}

export async function hasPermission(_userId: string, permission: ToolPermission): Promise<boolean> {
  const permissions = await getUserPermissions(_userId);
  return permissions.includes(permission);
}

export async function hasAllPermissions(_userId: string, permissions: ToolPermission[]): Promise<boolean> {
  const userPerms = await getUserPermissions(_userId);
  return permissions.every((p) => userPerms.includes(p));
}

export async function checkToolPermissions(
  _userId: string,
  requiredPermissions: ToolPermission[]
): Promise<{ allowed: boolean; missing: ToolPermission[] }> {
  const userPerms = await getUserPermissions(_userId);
  const missing = requiredPermissions.filter((p) => !userPerms.includes(p));
  return { allowed: missing.length === 0, missing };
}

export function getRequiredPermissionsForTool(_toolId: string): ToolPermission[] {
  return [];
}

export function filterToolsByPermissions(tools: string[], userPermissions: ToolPermission[]): string[] {
  return tools.filter((toolId) => {
    const required = getRequiredPermissionsForTool(toolId);
    return required.every((p) => userPermissions.includes(p));
  });
}