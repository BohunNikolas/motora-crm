"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { DEAL_STAGES } from "./format";

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
  const car = await prisma.car.create({ data: carDataFromForm(fd) });
  revalidateAll();
  redirect(`/cars/${car.id}`);
}

export async function updateCar(id: string, fd: FormData) {
  await prisma.car.update({ where: { id }, data: carDataFromForm(fd) });
  revalidateAll();
  redirect(`/cars/${id}`);
}

export async function setCarStatus(id: string, status: string) {
  await prisma.car.update({ where: { id }, data: { status } });
  revalidateAll();
}

export async function deleteCar(id: string) {
  await prisma.car.delete({ where: { id } });
  revalidateAll();
  redirect("/cars");
}

export async function addExpense(carId: string, fd: FormData) {
  await prisma.expense.create({
    data: {
      carId,
      title: str(fd, "title") ?? "Расход",
      amountGross: money(fd, "amount") ?? "0",
      // vatRate=20, alreadyIncluded=false — по умолчанию из схемы. Полная форма расхода — фаза 4.
    },
  });
  revalidatePath(`/cars/${carId}`);
  revalidatePath("/cars");
  revalidatePath("/");
}

export async function deleteExpense(id: string, carId: string) {
  await prisma.expense.delete({ where: { id } });
  revalidatePath(`/cars/${carId}`);
  revalidatePath("/cars");
}

// ─── Клиенты ───────────────────────────────────────────────────

export async function createClient(fd: FormData) {
  await prisma.client.create({
    data: {
      name: str(fd, "name") ?? "—",
      phone: str(fd, "phone") ?? "—",
      email: str(fd, "email"),
      type: str(fd, "type") ?? "BUYER",
      source: str(fd, "source"),
      notes: str(fd, "notes"),
    },
  });
  revalidateAll();
}

export async function updateClient(id: string, fd: FormData) {
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
  revalidateAll();
  redirect(`/clients/${id}`);
}

// Внимание: сделки клиента удалятся каскадом (schema.prisma), задачи — отвяжутся (SetNull).
export async function deleteClient(id: string) {
  await prisma.client.delete({ where: { id } });
  revalidateAll();
  redirect("/clients");
}

// ─── Сделки ────────────────────────────────────────────────────

export async function createDeal(fd: FormData) {
  const clientId = str(fd, "clientId");
  if (!clientId) return;
  await prisma.deal.create({
    data: {
      clientId,
      carId: str(fd, "carId"),
      type: str(fd, "type") ?? "SALE",
      amount: money(fd, "amount"),
      notes: str(fd, "notes"),
      stage: "NEW",
    },
  });
  revalidateAll();
}

export async function moveDealStage(id: string, dir: 1 | -1) {
  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal) return;
  const order = DEAL_STAGES.map((s) => s.key);
  const idx = order.indexOf(deal.stage);
  // LOST не входит в воронку (idx === -1): стрелка утащила бы сделку в NEW молча.
  // Для возврата в работу есть reopenDeal.
  if (idx === -1) return;
  const next = order[Math.min(Math.max(idx + dir, 0), order.length - 1)];
  if (next === deal.stage) return;

  const closing = next === "DONE";
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
  revalidateAll();
}

export async function loseDeal(id: string) {
  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal) return;
  await prisma.deal.update({ where: { id }, data: { stage: "LOST", closedAt: new Date() } });
  // Сделку теряют уже после закрытия — освобождаем авто обратно на склад.
  if (deal.stage === "DONE" && deal.carId && deal.type !== "PURCHASE") {
    await prisma.car.update({ where: { id: deal.carId }, data: { status: "AVAILABLE" } });
  }
  revalidateAll();
}

/** Вернуть потерянную сделку в работу — в начало воронки. */
export async function reopenDeal(id: string) {
  await prisma.deal.update({ where: { id }, data: { stage: "NEW", closedAt: null } });
  revalidateAll();
}

export async function deleteDeal(id: string) {
  await prisma.deal.delete({ where: { id } });
  revalidateAll();
}

// ─── Задачи ────────────────────────────────────────────────────

export async function createTask(fd: FormData) {
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
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return;
  await prisma.task.update({ where: { id }, data: { done: !t.done } });
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function deleteTask(id: string) {
  await prisma.task.delete({ where: { id } });
  revalidatePath("/tasks");
  revalidatePath("/");
}
