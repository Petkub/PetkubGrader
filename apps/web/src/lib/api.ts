/**
 * BFF helpers: call FastAPI from Next.js server (RSC / Route Handlers / Server Actions).
 * Never imported in client components — uses internal API key.
 */
import "server-only";
import { auth } from "@/lib/auth";

const API_URL = process.env.API_INTERNAL_URL ?? "http://fastapi:8000";
const API_KEY = process.env.API_INTERNAL_KEY!;

async function call<T>(path: string, init: RequestInit = {}, userId?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Internal-Key", API_KEY);
  headers.set("Content-Type", "application/json");
  if (userId) headers.set("X-User-Id", userId);

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Authed call: looks up session, requires backendId. */
async function authedCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await auth();
  if (!session?.user?.backendId) throw new Error("not signed in");
  return call<T>(path, init, session.user.backendId);
}

// ---- User mirror (no session yet — sign-in callback) ----

export interface ApiUserOut {
  id: string;
  email: string;
  name: string;
  role: "admin" | "setter" | "member";
  status: "pending" | "approved" | "banned";
}

export async function apiUpsertUser(payload: {
  email: string;
  name: string;
  image_url: string | null;
}): Promise<ApiUserOut> {
  return call<ApiUserOut>("/users/upsert", { method: "POST", body: JSON.stringify(payload) });
}

// ---- Problems ----

export interface ApiTopic {
  id: string;
  slug: string;
  name: string;
}

export interface ApiProblem {
  id: string;
  slug: string;
  title: string;
  time_ms: number;
  memory_mb: number;
  scoring_mode: "ioi_strict" | "partial";
  is_public: boolean;
  topics: ApiTopic[];
  your_best_score: number;
}

export interface ApiSample {
  input: string;
  output: string;
  explanation: string | null;
}

export interface ApiProblemDetail extends ApiProblem {
  statement_md: string;
  input_format_md: string;
  output_format_md: string;
  constraints_md: string;
  samples: ApiSample[];
}

export async function listProblems(
  params: { q?: string; topics?: string[]; includeDrafts?: boolean } = {},
) {
  const u = new URLSearchParams();
  if (params.q) u.set("q", params.q);
  for (const t of params.topics ?? []) u.append("topic", t);
  if (params.includeDrafts) u.set("include_drafts", "true");
  const qs = u.toString();
  return authedCall<ApiProblem[]>(`/problems${qs ? "?" + qs : ""}`);
}

export async function getProblem(slug: string) {
  return authedCall<ApiProblemDetail>(`/problems/${slug}`);
}

// ---- Authoring (setter/admin) ----

export async function getMe() {
  return authedCall<ApiUserOut>("/users/me");
}

export interface ApiUserStatus {
  id: string;
  name: string;
  username: string | null;
  school: string | null;
  role: "admin" | "setter" | "member";
  status: "pending" | "approved" | "banned";
}

/** Works for pending/banned users too (no approved-gate). */
export async function getMyStatus() {
  return authedCall<ApiUserStatus>("/users/me/status");
}

export async function updateMe(payload: { name?: string; username?: string; school?: string }) {
  return authedCall<ApiUserStatus>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export interface ApiProfile {
  name: string;
  username: string;
  school: string | null;
  total_score: number;
  rank: number;
  solved_count: number;
  solved: { slug: string; title: string; solved_at: string | null }[];
}

export async function getProfile(username: string) {
  return authedCall<ApiProfile>(`/users/by-username/${username}`);
}

// ---- Contests ----

export interface ApiContestSummary {
  slug: string;
  title: string;
  mode: "live" | "virtual";
  start_at: string;
  duration_min: number;
  status: "upcoming" | "running" | "ended";
  registered: boolean;
  is_published: boolean;
}

export interface ApiContestProblem {
  alias: string;
  slug: string | null;
  title: string | null;
  your_best_score: number | null;
}

export interface ApiContestDetail extends ApiContestSummary {
  description_md: string;
  can_access_problems: boolean;
  can_release: boolean;
  started_at: string | null;
  problems: ApiContestProblem[];
}

export interface ApiScoreboardRow {
  rank: number;
  user_id: string;
  name: string;
  username: string | null;
  total_score: number;
  per_problem: Record<string, number>;
}

export async function listContests() {
  return authedCall<ApiContestSummary[]>("/contests");
}
export async function getContest(slug: string) {
  return authedCall<ApiContestDetail>(`/contests/${slug}`);
}
export async function registerContest(slug: string) {
  return authedCall<ApiContestDetail>(`/contests/${slug}/register`, { method: "POST" });
}
export async function startContest(slug: string) {
  return authedCall<ApiContestDetail>(`/contests/${slug}/start`, { method: "POST" });
}
export async function getScoreboard(slug: string) {
  return authedCall<ApiScoreboardRow[]>(`/contests/${slug}/scoreboard`);
}
export async function createContest(payload: {
  slug: string;
  title: string;
  description_md?: string;
  mode: "live" | "virtual";
  start_at: string;
  duration_min: number;
}) {
  return authedCall<ApiContestSummary>("/contests", { method: "POST", body: JSON.stringify(payload) });
}
export async function addContestProblem(slug: string, problem_slug: string, alias: string) {
  return authedCall<ApiContestDetail>(`/contests/${slug}/problems`, {
    method: "POST",
    body: JSON.stringify({ problem_slug, alias }),
  });
}
export async function publishContest(slug: string) {
  return authedCall<ApiContestSummary>(`/contests/${slug}/publish`, { method: "POST" });
}
export async function createContestProblem(slug: string, title: string, alias: string) {
  return authedCall<{ problem_slug: string }>(`/contests/${slug}/problems/new`, {
    method: "POST",
    body: JSON.stringify({ title, alias }),
  });
}
export async function releaseContestProblems(slug: string) {
  return authedCall<ApiContestDetail>(`/contests/${slug}/release`, { method: "POST" });
}

export async function listTopics() {
  return authedCall<ApiTopic[]>("/topics");
}

export interface ProblemCreateInput {
  slug: string;
  title: string;
  statement_md?: string;
  input_format_md?: string;
  output_format_md?: string;
  constraints_md?: string;
  time_ms?: number;
  memory_mb?: number;
  scoring_mode?: "ioi_strict" | "partial";
  topic_slugs?: string[];
}

export async function createProblem(payload: ProblemCreateInput) {
  return authedCall<ApiProblemDetail>("/problems", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type ProblemUpdateInput = Partial<Omit<ProblemCreateInput, "slug">>;

export async function updateProblem(slug: string, payload: ProblemUpdateInput) {
  return authedCall<ApiProblemDetail>(`/problems/${slug}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function publishProblem(slug: string) {
  return authedCall<ApiProblemDetail>(`/problems/${slug}/publish`, { method: "POST" });
}

export async function unpublishProblem(slug: string) {
  return authedCall<ApiProblemDetail>(`/problems/${slug}/unpublish`, { method: "POST" });
}

// ---- Submissions ----

export interface ApiSubmission {
  id: string;
  problem_id: string;
  language: "cpp" | "python";
  status: "queued" | "judging" | "done" | "error";
  overall_verdict: string | null;
  total_score: number;
  max_time_ms: number;
  max_memory_kb: number;
  created_at: string;
  can_view_source: boolean;
}

export interface ApiSubmissionTestcase {
  testcase_id: string;
  subtask_id: string;
  verdict: string | null;
  time_ms: number | null;
  memory_kb: number | null;
  score: number;
}

export interface ApiSubtaskMeta {
  id: string;
  ord: number;
  name: string;
  weight: number;
  is_sample: boolean;
}

export interface ApiSubmissionDetail extends ApiSubmission {
  compile_log: string | null;
  error_message: string | null;
  subtasks: ApiSubtaskMeta[];
  testcases: ApiSubmissionTestcase[];
  source: string | null;
}

export async function submit(payload: {
  problem_slug: string;
  language: "cpp" | "python";
  source: string;
}) {
  return authedCall<ApiSubmission>("/submissions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSubmission(id: string) {
  return authedCall<ApiSubmissionDetail>(`/submissions/${id}`);
}

export interface ApiSubmissionListRow {
  id: string;
  problem_slug: string;
  problem_title: string;
  language: "cpp" | "python";
  status: "queued" | "judging" | "done" | "error";
  overall_verdict: string | null;
  total_score: number;
  max_time_ms: number;
  created_at: string;
}

export async function listMySubmissions(params: { problem?: string; limit?: number } = {}) {
  const u = new URLSearchParams();
  if (params.problem) u.set("problem", params.problem);
  if (params.limit) u.set("limit", String(params.limit));
  const qs = u.toString();
  return authedCall<ApiSubmissionListRow[]>(`/submissions${qs ? "?" + qs : ""}`);
}

export interface ApiProblemSubmissionRow {
  id: string;
  user_name: string;
  user_username: string | null;
  is_mine: boolean;
  language: "cpp" | "python";
  status: "queued" | "judging" | "done" | "error";
  overall_verdict: string | null;
  total_score: number;
  max_time_ms: number;
  created_at: string;
  can_view_source: boolean;
}

export interface ApiProblemSubmissions {
  viewer_passed: boolean;
  rows: ApiProblemSubmissionRow[];
}

export async function listProblemSubmissions(slug: string, limit = 100) {
  return authedCall<ApiProblemSubmissions>(`/submissions/by-problem/${slug}?limit=${limit}`);
}

// ---- Ranking ----

export interface ApiRankRow {
  rank: number;
  user_id: string;
  name: string;
  username: string | null;
  total_score: number;
  solved: number;
  first_full_at: string | null;
}

export async function getRanking(limit = 100) {
  return authedCall<ApiRankRow[]>(`/ranking?limit=${limit}`);
}

// ---- Admin ----

export interface ApiAdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "setter" | "member";
  status: "pending" | "approved" | "banned";
  created_at: string;
}

export async function listUsers(status?: "pending" | "approved" | "banned") {
  const qs = status ? `?status=${status}` : "";
  return authedCall<ApiAdminUser[]>(`/admin/users${qs}`);
}

export async function approveUser(id: string) {
  return authedCall<ApiAdminUser>(`/admin/users/${id}/approve`, { method: "POST" });
}

export async function banUser(id: string) {
  return authedCall<ApiAdminUser>(`/admin/users/${id}/ban`, { method: "POST" });
}

export async function setUserRole(id: string, role: "admin" | "setter" | "member") {
  return authedCall<ApiAdminUser>(`/admin/users/${id}/role/${role}`, { method: "POST" });
}
