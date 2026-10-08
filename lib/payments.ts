export const GOAL = 3_200_000;
export const SLOTS = 20;
export type Payment = { slot: number; managerKey: string; firstName: string; lastName: string; amountKopecks: number; photoKey: string; version: number; updatedAt: string };
export function managerKey(first: string, last: string) { return `${first.trim().replace(/\s+/g, " ")}\u0000${last.trim().replace(/\s+/g, " ")}`.normalize("NFKC").toLocaleLowerCase("ru-RU"); }
export function parseAmount(value: string) {
  const clean = value.replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(clean)) throw new Error("Введите сумму в рублях, не более двух знаков после запятой.");
  const [rub, kop = ""] = clean.split(".");
  const amount = Number(rub) * 100 + Number(kop.padEnd(2, "0"));
  if (amount <= 0 || amount > 99_999_999_900) throw new Error("Сумма должна быть больше нуля и меньше миллиарда рублей.");
  return amount;
}
export function rankPayments(payments: Payment[]) {
  const groups = new Map<string, { key: string; firstName: string; lastName: string; photoKey: string; amountKopecks: number; count: number }>();
  for (const p of [...payments].sort((a,b) => a.updatedAt.localeCompare(b.updatedAt))) {
    const r = groups.get(p.managerKey) ?? { key: p.managerKey, firstName: p.firstName, lastName: p.lastName, photoKey: p.photoKey, amountKopecks: 0, count: 0 };
    r.amountKopecks += p.amountKopecks; r.count++; r.photoKey = p.photoKey; groups.set(p.managerKey, r);
  }
  return [...groups.values()].sort((a,b) => b.amountKopecks-a.amountKopecks || b.count-a.count || a.lastName.localeCompare(b.lastName, "ru"));
}
export const money = (kopecks: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: kopecks % 100 ? 2 : 0 }).format(kopecks/100);
export const photoUrl = (key: string) => `/api/photos/${encodeURIComponent(key)}`;
