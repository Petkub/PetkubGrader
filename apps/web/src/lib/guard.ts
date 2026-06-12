import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe, getMyStatus, type ApiUserOut, type ApiUserStatus } from "@/lib/api";

/** Require an approved account. Pending/banned → /pending. Signed-out → /sign-in.
 *  Approved but no username yet → /settings (pick a handle first). */
export async function requireApproved(): Promise<ApiUserStatus> {
  const me = await requireApprovedNoHandleGate();
  if (!me.username) redirect("/settings");
  return me;
}

/** Signed-in + not banned. Pending users pass — they may browse but the
 *  backend blocks submit/register/start (approved-only). Banned → /pending.
 *  No username yet → /settings. Check `me.status` to gate write UI. */
export async function requireUser(): Promise<ApiUserStatus> {
  const session = await auth();
  if (!session?.user?.backendId) redirect("/sign-in");
  const me = await getMyStatus().catch(() => null);
  if (!me) redirect("/sign-in");
  if (me.status === "banned") redirect("/pending");
  if (!me.username) redirect("/settings");
  return me;
}

/** Same gate minus the username step — for /settings itself (avoids a redirect
 *  loop). Pending users pass: they need /settings to pick a handle. */
export async function requireApprovedNoHandleGate(): Promise<ApiUserStatus> {
  const session = await auth();
  if (!session?.user?.backendId) redirect("/sign-in");
  const me = await getMyStatus().catch(() => null);
  if (!me) redirect("/sign-in");
  if (me.status === "banned") redirect("/pending");
  return me;
}

/** Require an approved setter/admin. Redirects otherwise. Returns the user. */
export async function requireSetter(): Promise<ApiUserOut> {
  const session = await auth();
  if (!session?.user?.backendId) redirect("/sign-in");
  const me = await getMe().catch(() => null);
  if (!me) redirect("/sign-in");
  if (me.role !== "admin" && me.role !== "setter") redirect("/problems");
  return me;
}

/** Require an approved admin. Redirects otherwise. */
export async function requireAdmin(): Promise<ApiUserOut> {
  const session = await auth();
  if (!session?.user?.backendId) redirect("/sign-in");
  const me = await getMe().catch(() => null);
  if (!me) redirect("/sign-in");
  if (me.role !== "admin") redirect("/problems");
  return me;
}
