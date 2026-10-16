import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import type { ExamDto, ExamsDto } from "@sala/contracts";
import { env } from "../env.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("exams HTTP", () => {
  const priorToken = env.mpAccessToken;
  let ctx: ReturnType<typeof buildTestApp>;
  let free: string;
  let paid: string;
  let other: string;

  async function signUp(key: string) {
    const res = await ctx.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ email: `${key}@example.test`, password: "correct-horse-battery", name: key }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } };
    return { id: body.user.id, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
  }

  function call(method: string, path: string, cookie?: string, body?: unknown) {
    return ctx.app.request(`/api/v1${path}`, {
      method,
      headers: baseHeaders({ ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    env.mpAccessToken = "test-token";
    ctx = buildTestApp();
    free = (await signUp("free")).cookie;
    const p = await signUp("paid");
    paid = p.cookie;
    const o = await signUp("other");
    other = o.cookie;
    await ctx.db.insert(schema.userSubscriptions).values([
      { userId: p.id, providerSubscriptionId: "sub-paid", status: "authorized" },
      { userId: o.id, providerSubscriptionId: "sub-other", status: "authorized" },
    ]);
  });

  afterAll(() => {
    env.mpAccessToken = priorToken;
  });

  it("answers 401 anonymous and 403 PRO_REQUIRED for a free user", async () => {
    expect((await call("GET", "/me/exams")).status).toBe(401);
    const res = await call("GET", "/me/exams", free);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PRO_REQUIRED");
  });

  it("round-trips create, list, patch and delete", async () => {
    const created = await call("POST", "/me/exams", paid, { subject: "Física", examDate: inDays(10), targetHours: 12 });
    expect(created.status).toBe(201);
    const exam = (await created.json()) as ExamDto;
    expect(exam).toMatchObject({ subject: "Física", targetHours: 12, studiedMinutes: 0 });

    const list = (await (await call("GET", "/me/exams", paid)).json()) as ExamsDto;
    expect(list.exams.map((e) => e.id)).toEqual([exam.id]);

    const patched = await call("PATCH", `/me/exams/${exam.id}`, paid, { targetHours: 6 });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as ExamDto).targetHours).toBe(6);

    expect((await call("PATCH", `/me/exams/${exam.id}`, other, { targetHours: 1 })).status).toBe(404);
    expect((await call("DELETE", `/me/exams/${exam.id}`, other)).status).toBe(404);

    expect((await call("DELETE", `/me/exams/${exam.id}`, paid)).status).toBe(204);
    expect(((await (await call("GET", "/me/exams", paid)).json()) as ExamsDto).exams).toEqual([]);
  });

  it("validates the body", async () => {
    expect((await call("POST", "/me/exams", paid, { subject: "", examDate: inDays(3), targetHours: 5 })).status).toBe(400);
    expect((await call("POST", "/me/exams", paid, { subject: "X", examDate: "2020-01-01", targetHours: 5 })).status).toBe(400);
    expect((await call("PATCH", `/me/exams/${UUID}`, paid, { targetHours: 0 })).status).toBe(400);
    expect((await call("PATCH", "/me/exams/not-a-uuid", paid, { targetHours: 3 })).status).toBe(400);
  });
});
