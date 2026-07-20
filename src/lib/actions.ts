"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { DEAL_STAGES } from "./format";
import { getSessionUser, audit } from "./auth";
import { can, type AuthUser, type Capability } from "./authz";

/**
 * Обязательная server-side проверка прав в каждой мутации (roles-motorhof.md §1).
 * UI прячет кнопки по флагам, но это удобство — защита ЗДЕСЬ.
 */
async function requireCan(...caps: Capability[]): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user || !caps.some((c) => can(user, c))) {
    throw new Error("Недостаточно прав для этого действия");
  }
  return user;
}

const str = (fd: FormData, key: string) => (fd.get(key) as string | null)?.trim() || null;
const num = (fd: FormData, key: string) => {
  const v = str(fd, key);
  if (!v) return null;
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
};

// Деньги парсим в СТРОКУ для Prisma Decimal (без JS-float): «€ 12.500,50» → "12500.50".
// Принимаем и точку, и запятую как десятичный разделитель.
const money = (fd: FormData, key: string): string | null => {
  const v = str(fd, key);
  if (!v) return null;
  const cleaned = v.replace(/[€\s]/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  return cleaned === "" || cleaned === "-" ? null : cleaned;
};

const date = (fd: FormData, key: string): Date | null => {
  const v = str(fd, key);
  return v ? new Date(`${v}T00:00:00`) : null;
};

function revalidateAll() {
  for (const p of ["/", "/cars", "/clients", "/deals", "/tasks"]) revalidatePath(p);
}

// ─── Автомобили ────────────────────────────────────────────────

// Общая сборка данных авто из формы. Деньги — строки для Decimal.
// einkaufspreis24 по умолчанию = закупка, плановая цена = цена продажи (§22).
function carDataFromForm(fd: FormData) {
  const purchasePrice = money(fd, "purchasePrice") ?? "0";
  const listPrice = money(fd, "listPrice") ?? "0";
  const engine = str(fd, "engineVol");
  return {
    make: str(fd, "make") ?? "—",
    model: str(fd, "model") ?? "—",
    year: num(fd, "year") ?? new Date().getFullYear(),
    mileage: num(fd, "mileage") ?? 0,
    vin: str(fd, "vin"),
    color: str(fd, "color"),
    transmission: str(fd, "transmission"),
    fuel: str(fd, "fuel"),
    engineVol: engine ? parseFloat(engine.replace(",", ".")) : null,
    purchasePrice,
    listPrice,
    status: str(fd, "status") ?? "PREP",
    notes: str(fd, "notes"),
    taxScheme: str(fd, "taxScheme") ?? "DIFFERENZBESTEUERUNG",
    purchaseChannel: str(fd, "purchaseChannel"),
    currentOwner: str(fd, "currentOwner") ?? "MOTORHOF_OG",
    einkaufspreisGemaess24: money(fd, "einkaufspreisGemaess24") ?? purchasePrice,
    plannedSalePriceGross: money(fd, "plannedSalePriceGross") ?? listPrice,
    minimumSalePriceGross: money(fd, "minimumSalePriceGross"),
    arrivalDate: date(fd, "arrivalDate"),
  };
}

export async function createCar(fd: FormData) {
  const user = await requireCan("edit.car");
  const data = carDataFromForm(fd);
  const car = await prisma.car.create({ data });
  await audit(user.id, "Car", car.id, "create", { after: { make: data.make, model: data.model, status: data.status } });
  revalidateAll();
  redirect(`/cars/${car.id}`);
}

export async function updateCar(id: string, fd: FormData) {
  const user = await requireCan("edit.car");
  const before = await prisma.car.findUnique({ where: { id } });
  const data = carDataFromForm(fd);
  await prisma.car.update({ where: { id }, data });
  await audit(user.id, "Car", id, "update", {
    before: before
      ? {
          purchasePrice: before.purchasePrice.toString(),
          listPrice: before.listPrice.toString(),
          minimumSalePriceGross: before.minimumSalePriceGross?.toString(),
          taxScheme: before.taxScheme,
          currentOwner: before.currentOwner,
          status: before.status,
        }
      : undefined,
    after: {
      purchasePrice: data.purchasePrice,
      listPrice: data.listPrice,
      minimumSalePriceGross: data.minimumSalePriceGross,
      taxScheme: data.taxScheme,
      currentOwner: data.currentOwner,
      status: data.status,
    },
  });
  revalidateAll();
  redirect(`/cars/${id}`);
}

// Статусы: SALES — только продажные (RESERVED/SOLD и возврат в AVAILABLE),
// TECHNICAL — только подготовительные (PREP/AVAILABLE). ADMIN/PARTNER — любые.
const SALES_STATUSES = ["RESERVED", "SOLD", "AVAILABLE"];
const TECH_STATUSES = ["PREP", "AVAILABLE"];

export async function setCarStatus(id: string, status: string) {
  const user = await requireCan("status.sales", "status.tech");
  const allowed =
    (can(user, "status.sales") && SALES_STATUSES.includes(status)) ||
    (can(user, "status.tech") && TECH_STATUSES.includes(status));
  if (!allowed) throw new Error("Ваша роль не может установить этот статус");

  const before = await prisma.car.findUnique({ where: { id }, select: { status: true } });
  await prisma.car.update({ where: { id }, data: { status } });
  await audit(user.id, "Car", id, "status", { before: { status: before?.status }, after: { status } });
  revalidateAll();
}

export async function deleteCar(id: string) {
  const user = await requireCan("delete.any");
  const before = await prisma.car.findUnique({ where: { id } });
  await prisma.car.delete({ where: { id } });
  await audit(user.id, "Car", id, "delete", {
    before: before ? { make: before.make, model: before.model, vin: before.vin } : undefined,
  });
  revalidateAll();
  redirect("/cars");
}

export async function addExpense(carId: string, fd: FormData) {
  const user = await requireCan("expense.add", "expense.addPending");
  // Kostenvoranschlag: у кого нет права прямого расхода (TECHNICAL) — смета PENDING,
  // в маржу попадёт только после подтверждения PARTNER/ADMIN (roles-motorhof.md §2).
  const approvalStatus = can(user, "expense.add") ? "APPROVED" : "PENDING";
  const exp = await prisma.expense.create({
    data: {
      carId,
      title: str(fd, "title") ?? "Расход",
      amountGross: money(fd, "amount") ?? "0",
      approvalStatus,
    },
  });
  await audit(user.id, "Expense", exp.id, "create", {
    after: { carId, title: exp.title, amountGross: exp.amountGross.toString(), approvalStatus },
  });
  revalidatePath(`/cars/${carId}`);
  revalidatePath("/cars");
  revalidatePath("/");
}

export async function approveExpense(id: string, carId: string) {
  const user = await requireCan("expense.approve");
  await prisma.expense.update({ where: { id }, data: { approvalStatus: "APPROVED" } });
  await audit(user.id, "Expense", id, "approve");
  revalidatePath(`/cars/${carId}`);
  revalidatePath("/cars");
  revalidatePath("/");
}

export async function deleteExpense(id: string, carId: string) {
  const user = await requireCan("delete.any");
  const before = await prisma.expense.findUnique({ where: { id } });
  await prisma.expense.delete({ where: { id } });
  await audit(user.id, "Expense", id, "delete", {
    before: before ? { title: before.title, amountGross: before.amountGross.toString() } : undefined,
  });
  revalidatePath(`/cars/${carId}`);
  revalidatePath("/cars");
}

// ─── Клиенты ───────────────────────────────────────────────────

export async function createClient(fd: FormData) {
  const user = await requireCan("client.manage");
  const client = await prisma.client.create({
    data: {
      name: str(fd, "name") ?? "—",
      phone: str(fd, "phone") ?? "—",
      email: str(fd, "email"),
      type: str(fd, "type") ?? "BUYER",
      source: str(fd, "source"),
      notes: str(fd, "notes"),
    },
  });
  await audit(user.id, "Client", client.id, "create", { after: { name: client.name } });
  revalidateAll();
}

export async function updateClient(id: string, fd: FormData) {
  const user = await requireCan("client.manage");
  await prisma.client.update({
    where: { id },
    data: {
      name: str(fd, "name") ?? "—",
      phone: str(fd, "phone") ?? "—",
      email: str(fd, "email"),
      type: str(fd, "type") ?? "BUYER",
      source: str(fd, "source"),
      notes: str(fd, "notes"),
    },
  });
  await audit(user.id, "Client", id, "update");
  revalidateAll();
  redirect(`/clients/${id}`);
}

// Внимание: сделки клиента удалятся каскадом (schema.prisma), задачи — отвяжутся (SetNull).
export async function deleteClient(id: string) {
  const user = await requireCan("delete.any");
  const before = await prisma.client.findUnique({ where: { id } });
  await prisma.client.delete({ where: { id } });
  await audit(user.id, "Client", id, "delete", {
    before: before ? { name: before.name, phone: before.phone } : undefined,
  });
  revalidateAll();
  redirect("/clients");
}

// ─── Сделки ────────────────────────────────────────────────────

export async function createDeal(fd: FormData) {
  const user = await requireCan("sell");
  const clientId = str(fd, "clientId");
  if (!clientId) return;
  const deal = await prisma.deal.create({
    data: {
      clientId,
      carId: str(fd, "carId"),
      type: str(fd, "type") ?? "SALE",
      amount: money(fd, "amount"),
      notes: str(fd, "notes"),
      stage: "NEW",
    },
  });
  await audit(user.id, "Deal", deal.id, "create", {
    after: { clientId, carId: deal.carId, amount: deal.amount?.toString() },
  });
  revalidateAll();
}

export async function moveDealStage(id: string, dir: 1 | -1) {
  const user = await requireCan("sell");
  const deal = await prisma.deal.findUnique({ where: { id }, include: { car: true } });
  if (!deal) return;
  const order = DEAL_STAGES.map((s) => s.key);
  const idx = order.indexOf(deal.stage);
  // LOST не входит в воронку (idx === -1): стрелка утащила бы сделку в NEW молча.
  // Для возврата в работу есть reopenDeal.
  if (idx === -1) return;
  const next = order[Math.min(Math.max(idx + dir, 0), order.length - 1)];
  if (next === deal.stage) return;

  const closing = next === "DONE";

  // Mindestverkaufspreis (roles-motorhof.md §3): закрытие продажи ниже минимума
  // блокируется для SALES; PARTNER/ADMIN проходят, действие пишется как override.
  let overrideReason: string | undefined;
  if (
    closing &&
    deal.type !== "PURCHASE" &&
    deal.car?.minimumSalePriceGross != null &&
    deal.amount != null &&
    deal.amount.lt(deal.car.minimumSalePriceGross)
  ) {
    if (!can(user, "sell.belowMin")) {
      redirect("/deals?error=below-min");
    }
    overrideReason = `Продажа ниже Mindestverkaufspreis (${deal.car.minimumSalePriceGross.toString()}) за ${deal.amount.toString()} — override ролью PARTNER/ADMIN`;
  }

  await prisma.deal.update({
    where: { id },
    data: { stage: next, closedAt: closing ? new Date() : null },
  });
  if (closing && deal.carId && deal.type !== "PURCHASE") {
    await prisma.car.update({ where: { id: deal.carId }, data: { status: "SOLD" } });
  }
  if (!closing && deal.carId && deal.stage === "DONE") {
    // сделку вернули из "Закрыта" — авто снова в наличии
    await prisma.car.update({ where: { id: deal.carId }, data: { status: "AVAILABLE" } });
  }
  await audit(user.id, "Deal", id, overrideReason ? "close-below-min-override" : "stage", {
    before: { stage: deal.stage },
    after: { stage: next },
    reason: overrideReason,
  });
  revalidateAll();
}

export async function loseDeal(id: string) {
  const user = await requireCan("sell");
  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal) return;
  await prisma.deal.update({ where: { id }, data: { stage: "LOST", closedAt: new Date() } });
  // Сделку теряют уже после закрытия — освобождаем авто обратно на склад.
  if (deal.stage === "DONE" && deal.carId && deal.type !== "PURCHASE") {
    await prisma.car.update({ where: { id: deal.carId }, data: { status: "AVAILABLE" } });
  }
  await audit(user.id, "Deal", id, "lose", { before: { stage: deal.stage } });
  revalidateAll();
}

/** Вернуть потерянную сделку в работу — в начало воронки. */
export async function reopenDeal(id: string) {
  const user = await requireCan("sell");
  await prisma.deal.update({ where: { id }, data: { stage: "NEW", closedAt: null } });
  await audit(user.id, "Deal", id, "reopen");
  revalidateAll();
}

export async function deleteDeal(id: string) {
  const user = await requireCan("delete.any");
  const before = await prisma.deal.findUnique({ where: { id } });
  await prisma.deal.delete({ where: { id } });
  await audit(user.id, "Deal", id, "delete", {
    before: before ? { stage: before.stage, amount: before.amount?.toString() } : undefined,
  });
  revalidateAll();
}

// ─── Задачи ────────────────────────────────────────────────────

export async function createTask(fd: FormData) {
  await requireCan("task.manage");
  const due = str(fd, "dueDate");
  await prisma.task.create({
    data: {
      title: str(fd, "title") ?? "Задача",
      // <input type="date"> отдаёт "2026-07-17". new Date("2026-07-17") — это ПОЛНОЧЬ UTC,
      // а срок задачи — календарный день по локальному времени. Без "T00:00:00" в поясах
      // западнее UTC задача «на сегодня» сразу попадала бы в просроченные.
      dueDate: due ? new Date(`${due}T00:00:00`) : null,
      clientId: str(fd, "clientId"),
      carId: str(fd, "carId"),
    },
  });
  revalidateAll();
}

export async function toggleTask(id: string) {
  await requireCan("task.manage");
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return;
  await prisma.task.update({ where: { id }, data: { done: !t.done } });
  revalidatePath("/tasks");
  revalidatePath("/");
}

// Удаление — только ADMIN («продавец не может удалять что-либо»).
// Мягкая отмена задач (CANCELLED) — фаза 4.
export async function deleteTask(id: string) {
  const user = await requireCan("delete.any");
  await prisma.task.delete({ where: { id } });
  await audit(user.id, "Task", id, "delete");
  revalidatePath("/tasks");
  revalidatePath("/");
}
