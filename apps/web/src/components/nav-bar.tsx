import Link from "next/link";
import { auth } from "@/lib/auth";
import { getMyStatus } from "@/lib/api";
import { signOutAction } from "@/lib/actions";

export async function NavBar() {
  const session = await auth();
  const signedIn = !!session?.user?.backendId;
  const me = signedIn ? await getMyStatus().catch(() => null) : null;
  const approved = me?.status === "approved";
  const isSetter = approved && (me?.role === "admin" || me?.role === "setter");
  const isAdmin = approved && me?.role === "admin";

  return (
    <nav className="sticky top-0 z-40 border-b-[3px] border-[rgb(var(--accent))] bg-[rgb(var(--bg))]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-block h-5 w-5 bg-[rgb(var(--accent-2))] border-2 border-black" />
            <span className="font-pixel text-sm text-[rgb(var(--accent))]">MyGrader</span>
          </Link>
          {approved && (
            <div className="hidden sm:flex items-center gap-1">
              <NavLink href="/problems">Problems</NavLink>
              <NavLink href="/contests">Contests</NavLink>
              <NavLink href="/leaderboard">Leaderboard</NavLink>
              <NavLink href="/submissions">Submissions</NavLink>
              {isSetter && <NavLink href="/manage">Manage</NavLink>}
              {isAdmin && <NavLink href="/admin/users">Admin</NavLink>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm">
          {signedIn ? (
            <>
              {me?.username ? (
                <Link
                  href={`/u/${me.username}`}
                  className="text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--fg))] transition"
                >
                  {me.name}
                </Link>
              ) : (
                <Link href="/settings" className="text-amber-400 hover:underline">
                  Set username
                </Link>
              )}
              {me && me.status !== "approved" && (
                <span className="text-amber-400 text-xs">({me.status})</span>
              )}
              {approved && (
                <Link href="/settings" className="text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--fg))] transition">
                  Settings
                </Link>
              )}
              <form action={signOutAction}>
                <button className="text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--fg))] transition">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/sign-in" className="rounded-lg bg-gradient-accent text-white px-4 py-1.5 font-medium">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-sm text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--surface-2))] transition"
    >
      {children}
    </Link>
  );
}
