import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/guard";
import { listUsers, approveUser, banUser, setUserRole } from "@/lib/api";

export const dynamic = "force-dynamic";

const ROLES = ["member", "setter", "admin"] as const;

export default async function AdminUsersPage() {
  await requireAdmin();
  const users = await listUsers();
  const pending = users.filter((u) => u.status === "pending");

  async function approve(formData: FormData) {
    "use server";
    await requireAdmin();
    await approveUser(String(formData.get("id")));
    revalidatePath("/admin/users");
  }
  async function ban(formData: FormData) {
    "use server";
    await requireAdmin();
    await banUser(String(formData.get("id")));
    revalidatePath("/admin/users");
  }
  async function changeRole(formData: FormData) {
    "use server";
    await requireAdmin();
    await setUserRole(
      String(formData.get("id")),
      String(formData.get("role")) as "member" | "setter" | "admin",
    );
    revalidatePath("/admin/users");
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <h1 className="text-3xl font-bold">Users</h1>

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-600">
            Pending approval ({pending.length})
          </h2>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-amber-300 dark:border-amber-800">
            {pending.map((u) => (
              <li key={u.id} className="px-4 py-3 flex items-center justify-between">
                <span>
                  <span className="font-medium">{u.name}</span>{" "}
                  <span className="text-xs text-zinc-500">{u.email}</span>
                </span>
                <div className="flex gap-2">
                  <form action={approve}>
                    <input type="hidden" name="id" value={u.id} />
                    <button className="text-xs rounded-md bg-emerald-600 text-white px-3 py-1.5">
                      Approve
                    </button>
                  </form>
                  <form action={ban}>
                    <input type="hidden" name="id" value={u.id} />
                    <button className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5">
                      Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          All users ({users.length})
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-2">Name</th>
              <th className="py-2">Status</th>
              <th className="py-2">Role</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-zinc-500">{u.email}</div>
                </td>
                <td className="py-2">
                  <span
                    className={
                      u.status === "approved"
                        ? "text-emerald-600"
                        : u.status === "banned"
                        ? "text-rose-600"
                        : "text-amber-600"
                    }
                  >
                    {u.status}
                  </span>
                </td>
                <td className="py-2">
                  <form action={changeRole} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={u.id} />
                    <select
                      name="role"
                      defaultValue={u.role}
                      className="text-xs bg-transparent border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-1"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button className="text-xs underline text-zinc-500">set</button>
                  </form>
                </td>
                <td className="py-2 text-right">
                  {u.status !== "banned" && (
                    <form action={ban}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-xs text-rose-600 hover:underline">ban</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
