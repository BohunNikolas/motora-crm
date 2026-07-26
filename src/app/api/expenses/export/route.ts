import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { EXPENSE_CATEGORY, EXPENSE_PAYMENT_STATUS, internalCode, expenseNet, expenseVat } from "@/lib/format";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function monthRange(ym: string | null): { gte: Date; lt: Date } | null {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  return { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
}

// CSV-экранирование: оборачиваем в кавычки, дублируем внутренние кавычки.
const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  // Экспорт расходов — только финансовые роли (§14, §20); никакого доступа через API иначе.
  if (!user || !can(user, "see.acquisition")) {
    return new Response("Forbidden", { status: 403 });
  }
  const p = req.nextUrl.searchParams;
  const where: Prisma.ExpenseWhereInput = { cancelled: false };
  const mr = monthRange(p.get("month"));
  if (mr) where.date = { gte: mr.gte, lt: mr.lt };
  if (p.get("category")) where.category = p.get("category")!;
  if (p.get("carId")) where.carId = p.get("carId")!;
  if (p.get("ownerCompany")) where.ownerCompany = p.get("ownerCompany")!;
  if (p.get("responsibleUserId")) where.responsibleUserId = p.get("responsibleUserId")!;
  if (p.get("paymentStatus")) where.paymentStatus = p.get("paymentStatus")!;
  if (p.get("supplier")) where.supplier = { contains: p.get("supplier")!, mode: "insensitive" };
  const amt: Prisma.DecimalFilter = {};
  if (p.get("minAmount")) amt.gte = p.get("minAmount")!;
  if (p.get("maxAmount")) amt.lte = p.get("maxAmount")!;
  if (Object.keys(amt).length) where.amountGross = amt;

  const expenses = await prisma.expense.findMany({
    where,
    include: { car: true, responsible: { select: { name: true } } },
    orderBy: { date: "desc" },
  });

  const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna" }).format(d) : "");
  const header = ["Дата", "Название", "Категория", "Авто", "Netto", "USt", "Brutto", "Поставщик", "№ счёта", "Дата счёта", "Оплата", "Ответственный"];
  const rows = expenses.map((e) => [
    fmtDate(e.date),
    e.title,
    EXPENSE_CATEGORY[e.category] ?? e.category,
    e.car ? `${internalCode(e.car)} ${e.car.make} ${e.car.model}` : "",
    expenseNet(e).toString(),
    expenseVat(e).toString(),
    e.amountGross.toString(),
    e.supplier ?? "",
    e.invoiceNumber ?? "",
    fmtDate(e.invoiceDate),
    EXPENSE_PAYMENT_STATUS[e.paymentStatus]?.label ?? e.paymentStatus,
    e.responsible?.name ?? "",
  ]);

  // BOM для корректной кириллицы в Excel; разделитель ";" (de-AT).
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses-${p.get("month") ?? "all"}.csv"`,
    },
  });
}
