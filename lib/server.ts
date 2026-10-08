import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
export const COOKIE = "zaruba_admin";
const encode = (value: string) => new TextEncoder().encode(value);
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
export async function digest(value: string) { return hex(await crypto.subtle.digest("SHA-256", encode(value))); }
async function signingKey() {
  if (!env.SESSION_SECRET) throw new Error("Session secret unavailable");
  return crypto.subtle.importKey("raw", encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function createSession() {
  const payload = `${Date.now()+12*60*60*1000}.${crypto.randomUUID()}`;
  return `${payload}.${hex(await crypto.subtle.sign("HMAC", await signingKey(), encode(payload)))}`;
}
export async function isAdmin() {
  try {
    const token = (await cookies()).get(COOKIE)?.value ?? "";
    const [expiry, nonce, signature, extra] = token.split(".");
    if (extra || !nonce || !/^\d{13}$/.test(expiry) || Number(expiry) < Date.now() || !/^[a-f0-9]{64}$/.test(signature ?? "")) return false;
    return await crypto.subtle.verify("HMAC", await signingKey(), new Uint8Array(signature.match(/../g)!.map(x=>parseInt(x,16))), encode(`${expiry}.${nonce}`));
  } catch { return false; }
}
export function checkOrigin(request: Request) { return request.headers.get("origin") === new URL(request.url).origin; }
export async function authorizeWrite(request: Request) {
  if (!checkOrigin(request) || !await isAdmin()) return Response.json({ error: "Войдите как администратор, чтобы изменить оплату." }, { status: 403 });
  return null;
}
export function storage() {
  if (!env.DB || !env.BUCKET) throw new Error("Хранилище не подключено.");
  return { db: env.DB, bucket: env.BUCKET };
}
export const selectPayments = "SELECT slot, manager_key AS managerKey, first_name AS firstName, last_name AS lastName, amount_kopecks AS amountKopecks, photo_key AS photoKey, version, updated_at AS updatedAt FROM payments";
