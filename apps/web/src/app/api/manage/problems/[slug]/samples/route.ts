/** BFF proxy: browser PUTs sample list (JSON) → forwarded to FastAPI. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const API_URL = process.env.API_INTERNAL_URL ?? "http://fastapi:8000";
const API_KEY = process.env.API_INTERNAL_KEY!;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.backendId) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  const { slug } = await params;
  const body = await req.text();

  const res = await fetch(`${API_URL}/problems/${slug}/samples`, {
    method: "PUT",
    headers: {
      "X-Internal-Key": API_KEY,
      "X-User-Id": session.user.backendId,
      "Content-Type": "application/json",
    },
    body,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
