"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { putObject, deleteObject } from "./storage";
import {
  DEAL_STAGES,
  CAR_STATUS_ORDER,
  SALES_STATUS_SET,
  TECH_STATUS_SET,
  pickerlNeedsAttention,
  isPartnerOwner,
  internalInvoiceComplete,
} from "./format";

// Заголовок автозадачи Pickerl — по нему ищем дубликаты (§8.4).
const PICKERL_TITLE = "Пройти §57a Pickerl";

/** «?pickerl=ask», если Pickerl требует внимания и нет незакрытой задачи. */
async function pickerlAskSuffix(
  carId: string,
  data: { pickerlVorhanden: string; pickerlMonth: number | null; pickerlYear: number | null }
): Promise<string> {
  if (!pickerlNeedsAttention(data)) return "";
  const existing = await prisma.task.findFirst({
    where: { carId, done: false, title: PICKERL_TITLE },
  });
  return existing ? "" : "?pickerl=ask";
}
import { getSessionUser, audit } from "./auth";
import { can, type AuthUser, type Capability } from "./authz";
import { Decimal } from "./finance";

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
  const vinRaw = str(fd, "vin");
  return {
    make: str(fd, "make") ?? "—",
    model: str(fd, "model") ?? "—",
    year: num(fd, "year") ?? new Date().getFullYear(),
    erstzulassung: date(fd, "erstzulassung"),
    mileage: num(fd, "mileage") ?? 0,
    vin: vinRaw ? vinRaw.toUpperCase() : null, // нормализация VIN (§8.1)
    color: str(fd, "color"),
    transmission: str(fd, "transmission"),
    fuel: str(fd, "fuel"),
    leistung: num(fd, "leistung"),
    voranmeldungen: num(fd, "voranmeldungen"),
    keysCount: num(fd, "keysCount"),
    purchaseDate: date(fd, "purchaseDate"),
    // engineVol больше не в форме (§6.2), но поле в БД остаётся — не трогаем при апдейте.
    purchasePrice,
    listPrice,
    status: str(fd, "status") ?? "PURCHASED",
    notes: str(fd, "notes"),
    // Serviceheft (§8.2)
    serviceheft: str(fd, "serviceheft") ?? "UNBEKANNT",
    lastServiceDate: date(fd, "lastServiceDate"),
    lastServiceMileage: num(fd, "lastServiceMileage"),
    serviceComment: str(fd, "serviceComment"),
    // Nachlackierungen (§8.3)
    nachlackierungen: str(fd, "nachlackierungen") ?? "UNBEKANNT",
    nachlackierungenParts:
      str(fd, "nachlackierungen") === "JA"
        ? (fd.getAll("nachlackierungenParts") as string[])
        : [],
    nachlackierungenComment: str(fd, "nachlackierungenComment"),
    // Pickerl (§8.4)
    pickerlVorhanden: str(fd, "pickerlVorhanden") ?? "UNBEKANNT",
    pickerlMonth: num(fd, "pickerlMonth"),
    pickerlYear: num(fd, "pickerlYear"),
    pickerlComment: str(fd, "pickerlComment"),
    // Налоги/закупка
    taxScheme: str(fd, "taxScheme") ?? "DIFFERENZBESTEUERUNG",
    // §11.2: для Auktion §24-Einkaufspreis по умолчанию = Fahrzeugpreis, а не invoiceTotal.
    einkaufspreisGemaess24:
      money(fd, "einkaufspreisGemaess24") ??
      (str(fd, "purchaseChannel") === "AUKTION" ? money(fd, "auctionVehiclePrice") ?? purchasePrice : purchasePrice),
    plannedSalePriceGross: money(fd, "plannedSalePriceGross") ?? listPrice,
    minimumSalePriceGross: money(fd, "minimumSalePriceGross"),
    arrivalDate: date(fd, "arrivalDate"),
    // Владелец и внутренняя продажа e.U. → OG (§9). Партнёрские поля значимы только
    // для Mriya/A Motors/AutoHub — для MOTORHOF_OG обнуляем, чтобы не смешивать данные.
    ...ownerDataFromForm(fd),
    // Условные поля закупки по каналу (§11). Поля неактуальных каналов зануляются.
    ...channelDataFromForm(fd),
  };
}

/**
 * Условные поля закупки (§11). Возвращает purchaseChannel + поля выбранного канала;
 * поля остальных каналов — null/false, чтобы не смешивать данные разных каналов.
 */
function channelDataFromForm(fd: FormData) {
  const purchaseChannel = str(fd, "purchaseChannel");
  const empty = {
    auctionVehiclePrice: null, auctionFeeNet: null, auctionFeeVat: null,
    auctionTransportCost: null, auctionOtherFees: null, auctionInvoiceTotal: null,
    auctionInvoiceNumber: null, auctionSupplier: null, auctionCountry: null,
    haendlerSupplier: null, haendlerInvoiceNumber: null, haendlerInvoiceDate: null,
    haendlerPurchaseNet: null, haendlerPurchaseVat: null, haendlerPurchaseGross: null,
    haendlerVorsteuerAusgewiesen: false,
    tradeInEstimatedValue: null, tradeInCreditValue: null, tradeInSurcharge: null,
    tradeInSurchargeBy: null,
    importCountry: null, importZone: null, importCurrency: null, importExchangeRate: null,
    importInvoiceAmount: null, importTransportCost: null, importZoll: null, importEust: null,
    importNova: null, importOtherCosts: null,
  } as const;

  if (purchaseChannel === "AUKTION") {
    return {
      purchaseChannel, ...empty,
      auctionVehiclePrice: money(fd, "auctionVehiclePrice"),
      auctionFeeNet: money(fd, "auctionFeeNet"),
      auctionFeeVat: money(fd, "auctionFeeVat"),
      auctionTransportCost: money(fd, "auctionTransportCost"),
      auctionOtherFees: money(fd, "auctionOtherFees"),
      auctionInvoiceTotal: money(fd, "auctionInvoiceTotal"),
      auctionInvoiceNumber: str(fd, "auctionInvoiceNumber"),
      auctionSupplier: str(fd, "auctionSupplier"),
      auctionCountry: str(fd, "auctionCountry"),
    };
  }
  if (purchaseChannel === "HAENDLER") {
    return {
      purchaseChannel, ...empty,
      haendlerSupplier: str(fd, "haendlerSupplier"),
      haendlerInvoiceNumber: str(fd, "haendlerInvoiceNumber"),
      haendlerInvoiceDate: date(fd, "haendlerInvoiceDate"),
      haendlerPurchaseNet: money(fd, "haendlerPurchaseNet"),
      haendlerPurchaseVat: money(fd, "haendlerPurchaseVat"),
      haendlerPurchaseGross: money(fd, "haendlerPurchaseGross"),
      haendlerVorsteuerAusgewiesen: str(fd, "haendlerVorsteuerAusgewiesen") === "1",
    };
  }
  if (purchaseChannel === "INZAHLUNGNAHME") {
    return {
      purchaseChannel, ...empty,
      tradeInEstimatedValue: money(fd, "tradeInEstimatedValue"),
      tradeInCreditValue: money(fd, "tradeInCreditValue"),
      tradeInSurcharge: money(fd, "tradeInSurcharge"),
      tradeInSurchargeBy: str(fd, "tradeInSurchargeBy"),
    };
  }
  if (purchaseChannel === "IMPORT") {
    return {
      purchaseChannel, ...empty,
      importCountry: str(fd, "importCountry"),
      importZone: str(fd, "importZone"),
      importCurrency: str(fd, "importCurrency")?.toUpperCase() ?? null,
      importExchangeRate: money(fd, "importExchangeRate"),
      importInvoiceAmount: money(fd, "importInvoiceAmount"),
      importTransportCost: money(fd, "importTransportCost"),
      importZoll: money(fd, "importZoll"),
      importEust: money(fd, "importEust"),
      importNova: money(fd, "importNova"),
      importOtherCosts: money(fd, "importOtherCosts"),
    };
  }
  // PRIVAT или канал не выбран — только базовые поля.
  return { purchaseChannel, ...empty };
}

/**
 * Поля владельца/внутреннего счёта (§9). Для собственных авто OG партнёрские
 * значения зануляются — «не смешивать результаты компаний».
 */
function ownerDataFromForm(fd: FormData) {
  const currentOwner = str(fd, "currentOwner") ?? "MOTORHOF_OG";
  if (!isPartnerOwner(currentOwner)) {
    return {
      currentOwner,
      partnerPurchasePrice: null,
      partnerAcquisitionCost: null,
      plannedInternalTransferPrice: null,
      actualInternalTransferPrice: null,
      internalInvoiceNumber: null,
      internalInvoiceDate: null,
      internalInvoiceTaxScheme: null,
      internalInvoicePaymentStatus: "OPEN",
      awaitingInternalInvoice: false,
    };
  }
  const actualInternalTransferPrice = money(fd, "actualInternalTransferPrice");
  const internalInvoiceNumber = str(fd, "internalInvoiceNumber");
  return {
    currentOwner,
    partnerPurchasePrice: money(fd, "partnerPurchasePrice"),
    partnerAcquisitionCost: money(fd, "partnerAcquisitionCost"),
    plannedInternalTransferPrice: money(fd, "plannedInternalTransferPrice"),
    actualInternalTransferPrice,
    internalInvoiceNumber,
    internalInvoiceDate: date(fd, "internalInvoiceDate"),
    internalInvoiceTaxScheme: str(fd, "internalInvoiceTaxScheme"),
    internalInvoicePaymentStatus: str(fd, "internalInvoicePaymentStatus") ?? "OPEN",
    // Внутренний счёт заполнили (цена + номер) → снимаем пометку «ожидает» (§9).
    awaitingInternalInvoice:
      actualInternalTransferPrice != null && !!internalInvoiceNumber ? false : undefined,
  };
}

/**
 * Валидация формы (§8). Возвращает код ошибки для redirect или null.
 * ferror-коды разбираются на странице формы.
 */
function validateCarForm(data: ReturnType<typeof carDataFromForm>, fd: FormData): string | null {
  // Pickerl = Ja → месяц и год обязательны (§8.4)
  if (data.pickerlVorhanden === "JA" && (data.pickerlMonth == null || data.pickerlYear == null)) {
    return "pickerl-date";
  }
  // Дата поступления раньше даты покупки → нужен явный override с причиной (§8.1)
  if (
    data.arrivalDate &&
    data.purchaseDate &&
    data.arrivalDate < data.purchaseDate &&
    !(str(fd, "dateOverride") === "1" && str(fd, "dateOverrideReason"))
  ) {
    return "date-order";
  }
  // Auktion (§11.2): Auktionsrechnung gesamt не может быть меньше Fahrzeugpreis без
  // admin override с причиной (форму открывают только edit.car — ADMIN/PARTNER).
  if (
    data.purchaseChannel === "AUKTION" &&
    data.auctionInvoiceTotal != null &&
    data.auctionVehiclePrice != null &&
    new Decimal(data.auctionInvoiceTotal).lt(new Decimal(data.auctionVehiclePrice)) &&
    !(str(fd, "auctionOverride") === "1" && str(fd, "auctionOverrideReason"))
  ) {
    return "auction-below";
  }
  return null;
}

export async function createCar(fd: FormData) {
  const user = await requireCan("edit.car");
  const data = carDataFromForm(fd);
  const err = validateCarForm(data, fd);
  if (err) redirect(`/cars/new?ferror=${err}`);

  const car = await prisma.car.create({ data });
  await audit(user.id, "Car", car.id, "create", {
    after: { make: data.make, model: data.model, status: data.status },
    reason: str(fd, "dateOverrideReason") ?? str(fd, "auctionOverrideReason") ?? undefined,
  });
  revalidateAll();
  // Если Pickerl требует внимания и нет открытой задачи — предложить создать (§8.4)
  redirect(`/cars/${car.id}${await pickerlAskSuffix(car.id, data)}`);
}

export async function updateCar(id: string, fd: FormData) {
  const user = await requireCan("edit.car");
  const data = carDataFromForm(fd);
  const err = validateCarForm(data, fd);
  if (err) redirect(`/cars/${id}/edit?ferror=${err}`);

  const before = await prisma.car.findUnique({ where: { id } });
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
    reason: str(fd, "dateOverrideReason") ?? str(fd, "auctionOverrideReason") ?? undefined,
  });
  revalidateAll();
  redirect(`/cars/${id}${await pickerlAskSuffix(id, data)}`);
}

// ─── Фото и документы (§8.5) ───────────────────────────────────

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_FILE_BYTES = 12 * 1024 * 1024; // 12 МБ

/**
 * Загрузка файла авто через сервер (браузер → сервер → R2). kind = PHOTO | DOCUMENT.
 * Фото — SALES/TECHNICAL/ADMIN/PARTNER; документы — ADMIN/PARTNER/SALES.
 */
export async function uploadCarFile(carId: string, kind: string, fd: FormData) {
  const user =
    kind === "PHOTO"
      ? await requireCan("edit.carDescription", "edit.tech")
      : await requireCan("edit.car", "sell");

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`/cars/${carId}?ferror=nofile`);
  const f = file as File;
  const ext = ALLOWED_TYPES[f.type];
  if (!ext) redirect(`/cars/${carId}?ferror=filetype`);
  if (f.size > MAX_FILE_BYTES) redirect(`/cars/${carId}?ferror=filesize`);

  const docType = kind === "DOCUMENT" ? str(fd, "docType") ?? "SONSTIGES" : null;
  const key = `cars/${carId}/${kind.toLowerCase()}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await f.arrayBuffer());
  await putObject(key, buf, f.type);

  const rec = await prisma.carFile.create({
    data: {
      carId,
      kind,
      docType,
      key,
      filename: f.name.slice(0, 200),
      contentType: f.type,
      size: f.size,
      uploadedBy: user.id,
    },
  });
  await audit(user.id, "CarFile", rec.id, "upload", { after: { carId, kind, docType, filename: rec.filename } });
  revalidatePath(`/cars/${carId}`);
  revalidatePath("/cars");
}

/** Удаление файла — ADMIN/PARTNER (edit.car). Убирает и объект из хранилища. */
export async function deleteCarFile(id: string, carId: string) {
  const user = await requireCan("edit.car");
  const rec = await prisma.carFile.findUnique({ where: { id } });
  if (!rec) return;
  try {
    await deleteObject(rec.key);
  } catch {
    // объект мог не создаться/уже удалён — запись всё равно чистим
  }
  await prisma.carFile.delete({ where: { id } });
  await audit(user.id, "CarFile", id, "delete", { before: { filename: rec.filename, kind: rec.kind } });
  revalidatePath(`/cars/${carId}`);
  revalidatePath("/cars");
}

/** Создать автозадачу Pickerl (§8.4). Без дублей: одна незакрытая на авто. */
export async function createPickerlTask(carId: string) {
  const user = await requireCan("task.manage");
  const car = await prisma.car.findUnique({ where: { id: carId } });
  if (!car) return;
  const existing = await prisma.task.findFirst({
    where: { carId, done: false, title: PICKERL_TITLE },
  });
  if (!existing) {
    // Срок — 1-е число месяца Begutachtung; если месяца нет, через 2 недели.
    const due =
      car.pickerlMonth && car.pickerlYear
        ? new Date(`${car.pickerlYear}-${String(car.pickerlMonth).padStart(2, "0")}-01T00:00:00`)
        : new Date(Date.now() + 14 * 86_400_000);
    await prisma.task.create({ data: { title: PICKERL_TITLE, carId, dueDate: due } });
    await audit(user.id, "Task", carId, "pickerl-task");
  }
  revalidatePath(`/cars/${carId}`);
  revalidatePath("/tasks");
  revalidatePath("/");
  redirect(`/cars/${carId}`);
}

// Наборы статусов по ролям — в format.ts (единый источник для сервера и UI).
// ADMIN/PARTNER (edit.car) получают все статусы, включая приёмку (Куплен / В дороге).
export async function setCarStatus(id: string, status: string) {
  const user = await requireCan("status.sales", "status.tech", "edit.car");
  const allowed = new Set<string>();
  if (can(user, "edit.car")) CAR_STATUS_ORDER.forEach((s) => allowed.add(s));
  if (can(user, "status.sales")) SALES_STATUS_SET.forEach((s) => allowed.add(s));
  if (can(user, "status.tech")) TECH_STATUS_SET.forEach((s) => allowed.add(s));
  if (!allowed.has(status)) throw new Error("Ваша роль не может установить этот статус");

  const before = await prisma.car.findUnique({
    where: { id },
    select: {
      status: true, parkingRow: true, parkingSpot: true,
      currentOwner: true, actualInternalTransferPrice: true, internalInvoiceNumber: true,
    },
  });
  if (!before) return;

  // Продажа освобождает активное парковочное место, история сохраняется (§18.2).
  const freeParking = status === "SOLD" && (before.parkingRow || before.parkingSpot != null);
  // §9: продажа партнёрского авто без завершённого внутреннего счёта e.U.→OG →
  // пометка «ожидает внутренний счёт» (статус остаётся SOLD, незавершённость видна).
  const awaitingInvoice =
    status === "SOLD" &&
    isPartnerOwner(before.currentOwner) &&
    !internalInvoiceComplete(before);
  await prisma.car.update({
    where: { id },
    data: {
      status,
      ...(freeParking ? { parkingRow: null, parkingSpot: null } : {}),
      ...(status === "SOLD" ? { awaitingInternalInvoice: awaitingInvoice } : {}),
    },
  });
  if (freeParking) {
    await prisma.parkingMove.create({
      data: {
        carId: id,
        fromRow: before.parkingRow,
        fromSpot: before.parkingSpot,
        toRow: null,
        toSpot: null,
        userId: user.id,
      },
    });
  }
  await audit(user.id, "Car", id, "status", {
    before: { status: before.status },
    after: { status, awaitingInternalInvoice: awaitingInvoice || undefined },
    reason: awaitingInvoice ? "Партнёрское авто продано без внутреннего счёта e.U.→OG — ожидает счёт (§9)" : undefined,
  });
  revalidateAll();
}

/** Назначить/сменить парковочное место с записью в историю (§7). */
export async function assignParking(id: string, fd: FormData) {
  const user = await requireCan("edit.car", "status.sales", "status.tech");
  const rawRow = str(fd, "parkingRow");
  const row = rawRow ? rawRow.toUpperCase().slice(0, 1) : null;
  const spot = num(fd, "parkingSpot");

  if (row && !/^[A-Z]$/.test(row)) redirect(`/cars/${id}?perror=row`);
  if ((row && spot == null) || (!row && spot != null)) redirect(`/cars/${id}?perror=incomplete`);
  if (spot != null && spot <= 0) redirect(`/cars/${id}?perror=spot`);

  const before = await prisma.car.findUnique({
    where: { id },
    select: { parkingRow: true, parkingSpot: true },
  });
  if (!before) return;
  if (before.parkingRow === row && before.parkingSpot === spot) return; // без изменений

  try {
    await prisma.car.update({ where: { id }, data: { parkingRow: row, parkingSpot: spot } });
  } catch (e: unknown) {
    // Нарушение частичного уникального индекса — место занято другим активным авто.
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      redirect(`/cars/${id}?perror=taken`);
    }
    throw e;
  }
  await prisma.parkingMove.create({
    data: {
      carId: id,
      fromRow: before.parkingRow,
      fromSpot: before.parkingSpot,
      toRow: row,
      toSpot: spot,
      userId: user.id,
    },
  });
  await audit(user.id, "Car", id, "parking", {
    before: { row: before.parkingRow, spot: before.parkingSpot },
    after: { row, spot },
  });
  revalidatePath(`/cars/${id}`);
  revalidatePath("/cars");
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
    // §9: партнёрское авто без завершённого внутреннего счёта → пометка «ожидает».
    const awaitingInvoice =
      deal.car != null &&
      isPartnerOwner(deal.car.currentOwner) &&
      !internalInvoiceComplete(deal.car);
    await prisma.car.update({
      where: { id: deal.carId },
      data: { status: "SOLD", awaitingInternalInvoice: awaitingInvoice },
    });
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
