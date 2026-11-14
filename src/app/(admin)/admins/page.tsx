import { prisma } from "@/lib/prisma";
import AdminUsers from "@/components/AdminUsers";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const users = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, username: true, phone: true } });
  return (
    <main style={{ flex: 1, minWidth: 0, padding: "4px clamp(16px, 4vw, 28px) 48px" }}>
      <AdminUsers users={users} />
    </main>
  );
}
