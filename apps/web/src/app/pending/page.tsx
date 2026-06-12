import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMyStatus } from "@/lib/api";
import { signOutAction } from "@/lib/actions";
import { IconCross, IconHourglass } from "@/components/pixel-icons";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const session = await auth();
  if (!session?.user?.backendId) redirect("/sign-in");
  const me = await getMyStatus().catch(() => null);
  if (!me) redirect("/sign-in");
  if (me.status === "approved") redirect("/problems");

  const banned = me.status === "banned";

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <div
          className={`mx-auto w-14 h-14 surface flex items-center justify-center ${
            banned ? "text-[rgb(var(--wa))]" : "text-[rgb(var(--accent))]"
          }`}
        >
          {banned ? <IconCross size={28} /> : <IconHourglass size={28} />}
        </div>
        <h1 className="text-2xl font-bold">
          {banned ? "Account suspended" : "Awaiting approval"}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {banned
            ? "Your account has been suspended. Contact an administrator if you think this is a mistake."
            : "Your account is registered and waiting for an administrator to approve it. You'll be able to view problems and submit once approved."}
        </p>
        <p className="text-sm text-zinc-500">
          Signed in as <span className="font-medium">{me.name}</span>
        </p>
        <form action={signOutAction}>
          <button className="text-sm rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
