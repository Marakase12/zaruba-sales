import { env } from "cloudflare:workers";
import { checkOrigin, COOKIE, createSession, digest, storage } from "../../../lib/server";
export async function POST(request: Request) {
  if (!checkOrigin(request)) return Response.json({ error: "Недопустимый запрос." }, { status: 403 });
  try {
    const { db } = storage();
    const now = Date.now();
    const key = await digest(`${request.headers.get("cf-connecting-ip") ?? "local"}:${env.SESSION_SECRET}`);
    const limit = await db.prepare("INSERT INTO login_attempts (key,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at < ? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at < ? THEN ? ELSE reset_at END RETURNING attempts").bind(key, now+900000, now, now, now+900000).first<{ attempts: number }>();
    if ((limit?.attempts ?? 99) > 10) return Response.json({ error: "Слишком много попыток. Попробуйте через 15 минут." }, { status: 429, headers: { "Retry-After": "900" } });
    const { username, password } = await request.json() as { username?: unknown; password?: unknown };
    if (!env.ADMIN_PASSWORD || typeof password !== "string" || password.length > 200 || username !== "ADMIN" || await digest(password) !== await digest(env.ADMIN_PASSWORD)) return Response.json({ error: "Неверный логин или пароль." }, { status: 401 });
    const token = await createSession();
    await db.prepare("DELETE FROM login_attempts WHERE key=? OR reset_at < ?").bind(key, now).run();
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return Response.json({ ok: true }, { headers: { "Set-Cookie": `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=43200${secure}`, "Cache-Control": "no-store" } });
  } catch (error) { console.error("Login failed", error); return Response.json({ error: "Не удалось войти. Попробуйте ещё раз." }, { status: 503 }); }
}
export async function DELETE(request: Request) {
  if (!checkOrigin(request)) return Response.json({ error: "Недопустимый запрос." }, { status: 403 });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": `${COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`, "Cache-Control": "no-store" } });
}
