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

function revalidateAll() {
  for (const p of ["/", "/cars", "/clients", "/deals", "/tasks"]) revalidatePath(p);
}

// ─── Автомобили ────────────────────────────────────────────────

export async function createCar(fd: FormData) {
  const car = await prisma.car.create({
    data: {
      make: str(fd, "make") ?? "—",
      model: str(fd, "model") ?? "—",
      year: num(fd, "year") ?? new Date().getFullYear(),
      mileage: num(fd, "mileage") ?? 0,
      vin: str(fd, "vin"),
      color: str(fd, "color"),
      transmission: str(fd, "transmission"),
      fuel: str(fd, "fuel"),
      engineVol: str(fd, "engineVol") ? parseFloat(str(fd, "engineVol")!.replace(",", ".")) : null,
      purchasePrice: num(fd, "purchasePrice") ?? 0,
      listPrice: num(fd, "listPrice") ?? 0,
      status: str(fd, "status") ?? "PREP",
      notes: str(fd, "notes"),
    },
  });
  revalidateAll();
  redirect(`/cars/${car.id}`);
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
    data: { carId, title: str(fd, "title") ?? "Расход", amount: num(fd, "amount") ?? 0 },
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

export async function deleteClient(id: string) {
  await prisma.client.delete({ where: { id } });
  revalidateAll();
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
      amount: num(fd, "amount"),
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
  await prisma.deal.update({ where: { id }, data: { stage: "LOST", closedAt: new Date() } });
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
      dueDate: due ? new Date(due) : null,
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
