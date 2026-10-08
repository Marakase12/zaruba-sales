import { authorizeWrite, isAdmin, selectPayments, storage } from "../../../lib/server";
import { managerKey, parseAmount, type Payment } from "../../../lib/payments";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { db } = storage();
    const { results } = await db.prepare(`${selectPayments} ORDER BY slot`).all<Payment>();
    return Response.json({ payments: results, canEdit: await isAdmin() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Read payments failed", error); return Response.json({ error: "Не удалось загрузить оплаты. Попробуйте ещё раз." }, { status: 503 }); }
}
export async function POST(request: Request) {
  const denied = await authorizeWrite(request); if (denied) return denied;
  if (Number(request.headers.get("content-length") ?? 0) > 6_000_000) return Response.json({ error: "Фотография слишком большая. Максимум 5 МБ." }, { status: 413 });
  const { db, bucket } = storage(); let newKey: string | null = null; let committed = false;
  try {
    const form = await request.formData();
    const slot = Number(form.get("slot")); const version = Number(form.get("version") ?? 0);
    const firstName = String(form.get("firstName") ?? "").trim().replace(/\s+/g, " ");
    const lastName = String(form.get("lastName") ?? "").trim().replace(/\s+/g, " ");
    if (!Number.isInteger(slot) || slot < 1 || slot > 20 || !Number.isInteger(version) || version < 0) throw new Error("Некорректный номер оплаты.");
    if (!firstName || !lastName || firstName.length > 60 || lastName.length > 60 || /[\x00-\x1f<>]/.test(firstName+lastName)) throw new Error("Укажите имя и фамилию, до 60 символов каждое.");
    const amount = parseAmount(String(form.get("amount") ?? ""));
    const existing = await db.prepare(`${selectPayments} WHERE slot=?`).bind(slot).first<Payment>();
    if ((existing?.version ?? 0) !== version) return Response.json({ error: "Эта оплата уже изменилась. Закройте форму и откройте её снова." }, { status: 409 });
    const key = managerKey(firstName,lastName);
    const reuse = await db.prepare("SELECT photo_key FROM payments WHERE manager_key=? ORDER BY updated_at DESC LIMIT 1").bind(key).first<{ photo_key: string }>();
    let photoKey = existing?.managerKey === key ? existing.photoKey : reuse?.photo_key ?? "";
    const photo = form.get("photo");
    if (photo instanceof File && photo.size) {
      if (photo.size > 5_000_000) throw new Error("Фотография слишком большая. Максимум 5 МБ.");
      const bytes = new Uint8Array(await photo.arrayBuffer());
      const png = bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71;
      const jpg = bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
      const webp = String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP";
      if (!png && !jpg && !webp) throw new Error("Выберите фотографию JPG, PNG или WebP.");
      newKey = `${crypto.randomUUID()}.${png ? "png" : jpg ? "jpg" : "webp"}`;
      await bucket.put(newKey, bytes, { httpMetadata: { contentType: png ? "image/png" : jpg ? "image/jpeg" : "image/webp" } }); photoKey = newKey;
    }
    if (!photoKey) throw new Error("Загрузите фотографию менеджера.");
    const now = new Date().toISOString();
    const query = existing
      ? db.prepare("UPDATE payments SET manager_key=?,first_name=?,last_name=?,amount_kopecks=?,photo_key=?,version=version+1,updated_at=? WHERE slot=? AND version=?").bind(key,firstName,lastName,amount,photoKey,now,slot,version)
      : db.prepare("INSERT INTO payments (manager_key,first_name,last_name,amount_kopecks,photo_key,updated_at,slot,version) VALUES (?,?,?,?,?,?,?,1) ON CONFLICT(slot) DO NOTHING").bind(key,firstName,lastName,amount,photoKey,now,slot);
    const result = await query.run();
    if (!result.meta.changes) { if (newKey) await bucket.delete(newKey); return Response.json({ error: "Монетка уже изменена в другом окне. Обновите данные." }, { status: 409 }); }
    committed=true; return Response.json({ ok: true });
  } catch (error) {
    if (newKey && !committed) await bucket.delete(newKey).catch(()=>{});
    const message=error instanceof Error ? error.message : "Не удалось сохранить оплату.";
    if (/D1|SQL|bucket|binding/i.test(message)) { console.error("Save failed", error); return Response.json({ error: "Не удалось сохранить оплату. Попробуйте ещё раз." }, { status: 500 }); }
    return Response.json({ error: message }, { status: 400 });
  }
}
export async function DELETE(request: Request) {
  const denied=await authorizeWrite(request); if (denied) return denied;
  try {
    const { slot, version }=await request.json() as { slot: number; version: number };
    if (!Number.isInteger(slot) || !Number.isInteger(version) || slot<1 || slot>20) return Response.json({ error:"Некорректная оплата." },{status:400});
    const { db }=storage(); const r=await db.prepare("DELETE FROM payments WHERE slot=? AND version=?").bind(slot,version).run();
    if (!r.meta.changes) return Response.json({error:"Оплата уже изменилась. Обновите страницу."},{status:409});
    return Response.json({ok:true});
  } catch(error) { console.error("Delete failed",error); return Response.json({error:"Не удалось удалить оплату."},{status:500}); }
}
