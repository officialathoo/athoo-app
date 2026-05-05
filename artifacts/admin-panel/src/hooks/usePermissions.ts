import { useAdmin } from "@/hooks/useAdmin";

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ["*"],
  ops: [
    "users.read", "users.write",
    "bookings.read", "bookings.write",
    "verification.read", "verification.write",
    "complaints.read", "complaints.write",
    "broadcasts.read", "broadcasts.write",
    "promotions.read", "promotions.write",
    "settings.read",
  ],
  finance: [
    "users.read",
    "bookings.read",
    "finance.read", "finance.write",
    "reports.read",
    "settings.read",
  ],
  support: [
    "users.read",
    "bookings.read",
    "complaints.read", "complaints.write",
    "broadcasts.read",
  ],
};

export function usePermissions() {
  const { admin } = useAdmin();

  const adminRole = admin?.adminRole || "";
  const adminPermissions: string[] = Array.isArray(admin?.adminPermissions) ? admin!.adminPermissions : [];

  function hasPermission(permission: string): boolean {
    if (!admin || admin.role !== "admin") return false;

    const rolePerms = ROLE_PERMISSIONS[adminRole] || [];
    if (rolePerms.includes("*")) return true;
    if (rolePerms.includes(permission)) return true;
    if (adminPermissions.includes("*")) return true;
    if (adminPermissions.includes(permission)) return true;

    const [resource] = permission.split(".");
    if (adminPermissions.includes(`${resource}.*`)) return true;
    if (rolePerms.includes(`${resource}.*`)) return true;

    return false;
  }

  function hasRole(...roles: string[]): boolean {
    if (!admin) return false;
    return roles.includes(adminRole);
  }

  function isSuperAdmin(): boolean {
    return adminRole === "super_admin";
  }

  function canRead(resource: string): boolean {
    return hasPermission(`${resource}.read`);
  }

  function canWrite(resource: string): boolean {
    return hasPermission(`${resource}.write`);
  }

  return {
    hasPermission,
    hasRole,
    isSuperAdmin,
    canRead,
    canWrite,
    adminRole,
    adminPermissions,
  };
}

