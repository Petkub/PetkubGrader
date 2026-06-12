/**
 * BFF upload proxy: browser POSTs a ZIP here; we forward it to FastAPI
 * with the internal key + user id. Keeps FastAPI off the public network.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const API_URL = process.env.API_INTERNAL_URL ?? "http://fastapi:8000";
const API_KEY = process.env.API_INTERNAL_KEY!;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.backendId) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  const { slug } = await params;

  // Re-emit the incoming multipart body to FastAPI. fetch sets the boundary
  // from the FormData, so don't set Content-Type manually.
  const form = await req.formData();

  const res = await fetch(`${API_URL}/problems/${slug}/testcases`, {
    method: "POST",
    headers: {
      "X-Internal-Key": API_KEY,
      "X-User-Id": session.user.backendId,
    },
    body: form,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
