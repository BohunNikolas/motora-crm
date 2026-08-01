"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { putObject, deleteObject } from "./storage";
import {
  CAR_STATUS_ORDER,
  SALES_STATUS_SET,
  TECH_STATUS_SET,
  SALE_FLOW_STATUSES,
  TASK_OPEN_STATUSES,
  APPOINTMENT_BLOCKING_STATUSES,
  fmtDateTime,
  fmtTime,
  pickerlNeedsAttention,
  isPartnerOwner,
  internalInvoiceComplete,
  buildSaleSnapshot,
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
    where: { carId, status: { in: TASK_OPEN_STATUSES }, title: PICKERL_TITLE },
  });
  return existing ? "" : "?pickerl=ask";
}
import { getSessionUser, audit } from "./auth";
import { can, type AuthUser, type Capability } from "./authz";
import { Decimal, splitGrossVat, regelVat } from "./finance";

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
  for (const p of ["/", "/cars", "/clients", "/tasks"]) revalidatePath(p);
}

// ─── Автомобили ────────────────────────────────────────────────

// Общая сборка данных авто из формы. Деньги — строки для Decimal.
// einkaufspreis24 по умолчанию = закупка, плановая цена = цена продажи (§22).
/**
 * Данные авто из формы (правки-1, Э3). Год не пишется (В5); цены — по новой
 * модели канал×владелец×режим (П14): для Regel брутто/план считаются из НЕТТО,
 * listPrice поддерживается = плановому брутто (его показывают списки/продажа).
 */
function carDataFromForm(fd: FormData) {
  const vinRaw = str(fd, "vin");
  const channel = str(fd, "purchaseChannel") ?? "PRIVAT";
  const taxScheme = str(fd, "taxScheme") === "REGELBESTEUERUNG" ? "REGELBESTEUERUNG" : "DIFFERENZBESTEUERUNG";

  // План продажи: Diff — брутто из формы; Regel — НЕТТО из формы, брутто считается (В10).
  const plannedNet = taxScheme === "REGELBESTEUERUNG" ? money(fd, "plannedSalePriceNet") : null;
  const plannedGross =
    taxScheme === "REGELBESTEUERUNG"
      ? plannedNet != null
        ? regelVat(plannedNet).gross.toString()
        : null
      : money(fd, "plannedSalePriceGross");

  return {
    make: str(fd, "make") ?? "—",
    model: str(fd, "model") ?? "—",
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
    // Закупочная: у Аукциона отдельного поля нет (финальная считается из
    // цены аукциона + транспорта) — легаси-колонка NOT NULL, пишем 0.
    purchasePrice: channel === "AUKTION" ? "0" : money(fd, "purchasePrice") ?? "0",
    listPrice: plannedGross ?? "0",
    status: str(fd, "status") ?? "PURCHASED",
    notes: str(fd, "notes"),
    // Serviceheft (§8.2): детали значимы только когда книга есть (В7).
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
    // Налоги/цены (правки-1)
    taxScheme,
    plannedSalePriceGross: plannedGross,
    plannedSalePriceNet: plannedNet,
    minimumSalePriceGross: money(fd, "minimumSalePriceGross"),
    arrivalDate: date(fd, "arrivalDate"),
    ...ownerDataFromForm(fd),
    ...channelDataFromForm(fd),
  };
}

/**
 * Условные поля закупки (правки-1, В8): каналов три — Приват/Аукцион/Хендлер.
 * Поля невыбранных каналов и легаси-каналов (трейд-ин/импорт) зануляются,
 * чтобы не смешивать данные.
 */
function channelDataFromForm(fd: FormData) {
  const raw = str(fd, "purchaseChannel");
  const purchaseChannel = raw === "AUKTION" || raw === "HAENDLER" ? raw : "PRIVAT";
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
      auctionInvoiceTotal: money(fd, "auctionInvoiceTotal"),   // цена аукциона (общая)
      auctionVehiclePrice: money(fd, "auctionVehiclePrice"),   // цена автомобиля (база НДС)
      auctionTransportCost: money(fd, "auctionTransportCost"), // транспортировка
      auctionSupplier: str(fd, "auctionSupplier"),
    };
  }
  if (purchaseChannel === "HAENDLER") {
    return {
      purchaseChannel, ...empty,
      haendlerSupplier: str(fd, "haendlerSupplier"),
    };
  }
  return { purchaseChannel, ...empty };
}

/**
 * Владелец (правки-1, В9): вместо внутреннего счёта e.U.→OG — фиктивная наценка
 * у партнёрских компаний. Легаси-поля внутреннего счёта не трогаем (история).
 */
function ownerDataFromForm(fd: FormData) {
  const currentOwner = str(fd, "currentOwner") ?? "MOTORHOF_OG";
  return {
    currentOwner,
    fictitiousMarkup: isPartnerOwner(currentOwner) ? money(fd, "fictitiousMarkup") : null,
  };
}

/** Состояние формы авто (П9): ошибка + введённые значения для восстановления. */
export type CarFormState = { error: string | null; values?: Record<string, string> };

/** Слепок значений формы для возврата при ошибке (multi-значения — через запятую). */
function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") out[k] = k in out ? `${out[k]},${v}` : v;
  }
  return out;
}

/**
 * Валидация формы авто (Э3): обязательность всех полей, кроме заметок,
 * комментариев и даты поступления (В4), плюс прежние проверки-override.
 * Возвращает человекочитаемый текст ошибки или null.
 */
function validateCarForm(data: ReturnType<typeof carDataFromForm>, fd: FormData): string | null {
  const missing: string[] = [];
  const req = (ok: unknown, label: string) => { if (!ok) missing.push(label); };

  req(data.make !== "—", "Marke");
  req(data.model !== "—", "Modell");
  req(data.vin, "VIN");
  req(data.erstzulassung, "Дата постановки на учёт");
  req(num(fd, "mileage") != null, "Kilometerstand");
  req(data.leistung != null, "Leistung");
  req(data.transmission, "Getriebe");
  req(data.fuel, "Kraftstoff");
  req(data.color, "Farbe");
  req(data.voranmeldungen != null, "Voranmeldungen");
  req(data.keysCount != null, "Ключей");
  req(data.purchaseDate, "Дата покупки");
  req(data.minimumSalePriceGross, "Минимальная цена продажи");

  if (data.taxScheme === "REGELBESTEUERUNG") req(data.plannedSalePriceNet, "Плановая цена НЕТТО");
  else req(data.plannedSalePriceGross, "Плановая цена продажи");

  if (data.purchaseChannel === "AUKTION") {
    req(data.auctionInvoiceTotal, "Цена аукциона");
    req(data.auctionVehiclePrice, "Цена автомобиля");
    req(data.auctionTransportCost, "Транспортировка");
    req(data.auctionSupplier, "Поставщик");
  } else {
    req(money(fd, "purchasePrice"), "Закупочная цена");
    if (data.purchaseChannel === "HAENDLER") req(data.haendlerSupplier, "Поставщик");
  }
  if (isPartnerOwner(data.currentOwner)) req(data.fictitiousMarkup, "Фиктивная наценка");

  // Сервисная книга есть → детали обязательны (В7).
  if (["VOLLSTAENDIG", "TEILWEISE", "DIGITAL"].includes(data.serviceheft)) {
    req(data.lastServiceDate, "Последний сервис");
    req(data.lastServiceMileage != null, "Пробег на сервисе");
  }
  if (missing.length) return `Заполните обязательные поля: ${missing.join(", ")}.`;

  // Pickerl = Ja → месяц и год обязательны (§8.4)
  if (data.pickerlVorhanden === "JA" && (data.pickerlMonth == null || data.pickerlYear == null)) {
    return "Pickerl отмечен как «Да» — укажите Begutachtungsmonat и Begutachtungsjahr.";
  }
  // Дата поступления раньше даты покупки → нужен явный override с причиной (§8.1)
  if (
    data.arrivalDate &&
    data.purchaseDate &&
    data.arrivalDate < data.purchaseDate &&
    !(str(fd, "dateOverride") === "1" && str(fd, "dateOverrideReason"))
  ) {
    return "Дата поступления раньше даты покупки. Поставьте галочку override и укажите причину в секции «Основные данные».";
  }
  // Аукцион: цена аукциона не может быть меньше цены автомобиля без override (§11.2).
  if (
    data.purchaseChannel === "AUKTION" &&
    data.auctionInvoiceTotal != null &&
    data.auctionVehiclePrice != null &&
    new Decimal(data.auctionInvoiceTotal).lt(new Decimal(data.auctionVehiclePrice)) &&
    !(str(fd, "auctionOverride") === "1" && str(fd, "auctionOverrideReason"))
  ) {
    return "Цена аукциона меньше цены автомобиля. Поставьте галочку override и укажите причину в ценовом блоке.";
  }
  return null;
}

export async function createCar(_prev: CarFormState, fd: FormData): Promise<CarFormState> {
  const user = await requireCan("edit.car");
  const data = carDataFromForm(fd);
  const err = validateCarForm(data, fd);
  if (err) return { error: err, values: formValues(fd) };

  const car = await prisma.car.create({ data });
  await audit(user.id, "Car", car.id, "create", {
    after: { make: data.make, model: data.model, status: data.status },
    reason: str(fd, "dateOverrideReason") ?? str(fd, "auctionOverrideReason") ?? undefined,
  });
  revalidateAll();
  // Если Pickerl требует внимания и нет открытой задачи — предложить создать (§8.4)
  redirect(`/cars/${car.id}${await pickerlAskSuffix(car.id, data)}`);
}

export async function updateCar(id: string, _prev: CarFormState, fd: FormData): Promise<CarFormState> {
  const user = await requireCan("edit.car");
  const data = carDataFromForm(fd);
  const err = validateCarForm(data, fd);
  if (err) return { error: err, values: formValues(fd) };

  const before = await prisma.car.findUnique({ where: { id } });

  // §18.2: после завершённой продажи ключевые финансовые поля нельзя менять задним
  // числом без admin override (снимок продажи заморожен, но исходные поля защищаем).
  if (before) {
    const sold = await prisma.sale.findFirst({ where: { carId: id, stage: "COMPLETED" } });
    const financialChanged =
      before.purchasePrice.toString() !== data.purchasePrice ||
      (before.plannedSalePriceGross?.toString() ?? null) !== (data.plannedSalePriceGross ?? null) ||
      (before.plannedSalePriceNet?.toString() ?? null) !== (data.plannedSalePriceNet ?? null) ||
      (before.auctionInvoiceTotal?.toString() ?? null) !== (data.auctionInvoiceTotal ?? null) ||
      (before.fictitiousMarkup?.toString() ?? null) !== (data.fictitiousMarkup ?? null) ||
      (before.minimumSalePriceGross?.toString() ?? null) !== (data.minimumSalePriceGross ?? null) ||
      before.taxScheme !== data.taxScheme;
    if (sold && financialChanged && !(str(fd, "soldOverride") === "1" && str(fd, "soldOverrideReason"))) {
      return {
        error: "Авто уже продано — правка финансовых полей задним числом требует admin override (галочка + причина в ценовом блоке).",
        values: formValues(fd),
      };
    }
  }

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
    reason: str(fd, "dateOverrideReason") ?? str(fd, "auctionOverrideReason") ?? str(fd, "soldOverrideReason") ?? undefined,
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
    where: { carId, status: { in: TASK_OPEN_STATUSES }, title: PICKERL_TITLE },
  });
  if (!existing) {
    // Срок — 1-е число месяца Begutachtung; если месяца нет, через 2 недели.
    const due =
      car.pickerlMonth && car.pickerlYear
        ? new Date(`${car.pickerlYear}-${String(car.pickerlMonth).padStart(2, "0")}-01T00:00:00`)
        : new Date(Date.now() + 14 * 86_400_000);
    await prisma.task.create({
      data: {
        title: PICKERL_TITLE,
        type: "FAHRZEUG",
        priority: "HIGH", // §57a-Begutachtung — срочная задача по авто
        status: "OPEN",
        carId,
        dueDate: due,
        createdById: user.id,
      },
    });
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
  // Бронь и продажа (RESERVED/SOLD) ставятся только через поток §18 (reserveCar/
  // completeSale) — там собираются обязательные поля и financial snapshot.
  if (SALE_FLOW_STATUSES.includes(status)) {
    throw new Error("Бронь и продажа оформляются в разделе «Продажа» карточки авто");
  }
  const allowed = new Set<string>();
  if (can(user, "edit.car")) CAR_STATUS_ORDER.forEach((s) => allowed.add(s));
  if (can(user, "status.sales")) SALES_STATUS_SET.forEach((s) => allowed.add(s));
  if (can(user, "status.tech")) TECH_STATUS_SET.forEach((s) => allowed.add(s));
  allowed.delete("RESERVED");
  allowed.delete("SOLD");
  if (!allowed.has(status)) throw new Error("Ваша роль не может установить этот статус");

  const before = await prisma.car.findUnique({ where: { id }, select: { status: true } });
  if (!before) return;
  await prisma.car.update({ where: { id }, data: { status } });
  await audit(user.id, "Car", id, "status", {
    before: { status: before.status },
    after: { status },
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

// ─── Бронь и продажа (§18) ─────────────────────────────────────

/** Бронь авто (§18.1). Обязательны клиент и срок действия; авто → RESERVED. */
export async function reserveCar(carId: string, fd: FormData) {
  const user = await requireCan("sell"); // капабилити "sell" покрывает брони и продажи
  const clientId = str(fd, "clientId");
  const expires = date(fd, "reservationExpiresAt");
  if (!clientId || !expires) redirect(`/cars/${carId}?serror=reserve-fields`);

  // Одна активная бронь на авто: сначала отменить старую (§18.1).
  const active = await prisma.sale.findFirst({ where: { carId, stage: "RESERVED" } });
  if (active) redirect(`/cars/${carId}?serror=already-reserved`);

  const sale = await prisma.sale.create({
    data: {
      carId,
      clientId,
      stage: "RESERVED",
      reservedAt: date(fd, "reservedAt") ?? new Date(),
      reservationExpiresAt: expires,
      anzahlung: money(fd, "anzahlung"),
      reservationPaymentMethod: str(fd, "reservationPaymentMethod"),
      reservationComment: str(fd, "reservationComment"),
    },
  });
  await prisma.car.update({ where: { id: carId }, data: { status: "RESERVED" } });
  await audit(user.id, "Sale", sale.id, "reserve", {
    after: { carId, clientId, expiresAt: expires.toISOString() },
  });
  revalidateAll();
  redirect(`/cars/${carId}`);
}

/**
 * Продажа авто (§18.2). Обязательные поля, financial snapshot (замораживает маржу),
 * Mindestverkaufspreis-блок с override, освобождение парковки, автозакрытие задач,
 * §9 awaitingInternalInvoice для партнёрских авто. Активная бронь конвертируется в продажу.
 */
export async function completeSale(carId: string, fd: FormData) {
  const user = await requireCan("sell");
  const car = await prisma.car.findUnique({ where: { id: carId }, include: { expenses: true } });
  if (!car) redirect("/cars");

  const clientId = str(fd, "clientId");
  const salePrice = money(fd, "actualSalePriceGross");
  const saleDate = date(fd, "saleDate") ?? new Date();
  const paymentStatus = str(fd, "paymentStatus");
  const paymentMethod = str(fd, "paymentMethod");
  const deliveryDate = date(fd, "deliveryDate");
  const mileageAtSale = num(fd, "mileageAtSale") ?? car.mileage;
  const saleCategory = str(fd, "saleCategory");
  // Обязательные поля §18.2.
  if (!clientId || !salePrice || !paymentStatus || !paymentMethod || !deliveryDate || !saleCategory) {
    redirect(`/cars/${carId}?serror=sale-fields`);
  }

  // Mindestverkaufspreis (§13): продажа ниже минимума — блок для SALES, override PARTNER/ADMIN.
  let overrideReason: string | undefined;
  if (car.minimumSalePriceGross != null && new Decimal(salePrice!).lt(car.minimumSalePriceGross)) {
    if (!can(user, "sell.belowMin")) redirect(`/cars/${carId}?serror=below-min`);
    overrideReason = `Продажа ниже Mindestverkaufspreis (${car.minimumSalePriceGross.toString()}) за ${salePrice} — override PARTNER/ADMIN`;
  }

  const snapshot = buildSaleSnapshot(car, new Decimal(salePrice!));
  const saleData = {
    clientId,
    stage: "COMPLETED",
    actualSalePriceGross: salePrice,
    saleDate,
    paymentStatus,
    paymentMethod,
    deliveryDate,
    mileageAtSale,
    saleCategory,
    taxSchemeSnapshot: car.taxScheme,
    employeeUserId: str(fd, "employeeUserId") ?? user.id,
    financialSnapshot: snapshot as unknown as object,
  };

  // Активная бронь → конвертируем в продажу; иначе новая запись.
  const active = await prisma.sale.findFirst({ where: { carId, stage: "RESERVED" } });
  const sale = active
    ? await prisma.sale.update({ where: { id: active.id }, data: saleData })
    : await prisma.sale.create({ data: { carId, ...saleData } });

  // §9: партнёрское авто без завершённого внутр. счёта → «ожидает внутренний счёт».
  const awaitingInvoice = isPartnerOwner(car.currentOwner) && !internalInvoiceComplete(car);
  const freeParking = car.parkingRow || car.parkingSpot != null;
  await prisma.car.update({
    where: { id: carId },
    data: {
      status: "SOLD",
      awaitingInternalInvoice: awaitingInvoice,
      ...(freeParking ? { parkingRow: null, parkingSpot: null } : {}),
    },
  });
  if (freeParking) {
    await prisma.parkingMove.create({
      data: { carId, fromRow: car.parkingRow, fromSpot: car.parkingSpot, toRow: null, toSpot: null, userId: user.id },
    });
  }
  // §18.2: закрыть незавершённые подготовительные задачи по авто.
  await prisma.task.updateMany({
    where: { carId, status: { in: TASK_OPEN_STATUSES } },
    data: { status: "DONE", completedAt: new Date() },
  });

  await audit(user.id, "Sale", sale.id, overrideReason ? "sell-below-min-override" : "sell", {
    after: { carId, clientId, salePrice, finalMargin: snapshot.finalMargin, awaitingInternalInvoice: awaitingInvoice || undefined },
    reason: overrideReason,
  });
  revalidateAll();
  redirect(`/cars/${carId}`);
}

/** Отмена активной брони (§18.1): soft (CANCELLED) + возврат авто в продажу с аудитом. */
export async function cancelSale(saleId: string, carId: string) {
  const user = await requireCan("sell");
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) return;
  if (sale.stage !== "RESERVED") {
    // Завершённую продажу нельзя отменить обычной кнопкой (§21 soft-delete — только admin).
    throw new Error("Отменить можно только активную бронь");
  }
  await prisma.sale.update({ where: { id: saleId }, data: { stage: "CANCELLED", cancelledAt: new Date() } });
  // §18.1: не переводить статус автоматически без записи в историю — пишем аудит.
  await prisma.car.update({ where: { id: carId }, data: { status: "READY_FOR_SALE" } });
  await audit(user.id, "Sale", saleId, "cancel-reservation", { before: { stage: "RESERVED" }, after: { stage: "CANCELLED" } });
  revalidateAll();
  redirect(`/cars/${carId}`);
}

export async function addExpense(carId: string, fd: FormData) {
  const user = await requireCan("expense.add", "expense.addPending");
  // Kostenvoranschlag: у кого нет права прямого расхода (TECHNICAL) — смета PENDING,
  // в маржу попадёт только после подтверждения PARTNER/ADMIN (roles-motorhof.md §2).
  const approvalStatus = can(user, "expense.add") ? "APPROVED" : "PENDING";
  const gross = money(fd, "amount") ?? "0";
  const vatRate = 20;
  const { net } = splitGrossVat(gross, vatRate); // §14.1: net/USt из gross+ставки
  const exp = await prisma.expense.create({
    data: {
      carId,
      title: str(fd, "title") ?? "Расход",
      amountGross: gross,
      amountNet: net.toString(),
      vatRate,
      category: str(fd, "category") ?? "WERKSTATT",
      approvalStatus,
      createdById: user.id,
    },
  });
  await audit(user.id, "Expense", exp.id, "create", {
    after: { carId, title: exp.title, amountGross: exp.amountGross.toString(), approvalStatus },
  });
  revalidatePath(`/cars/${carId}`);
  revalidatePath("/cars");
  revalidatePath("/expenses");
  revalidatePath("/");
}

// ─── Расходы: полная модель (§14) ──────────────────────────────

/** Сбор данных расхода из формы страницы «Расходы»; net/USt считаются из gross+ставки. */
function expenseDataFromForm(fd: FormData) {
  const gross = money(fd, "amountGross") ?? "0";
  const vatRate = num(fd, "vatRate") ?? 20;
  const { net } = splitGrossVat(gross, vatRate);
  const paymentStatus = str(fd, "paymentStatus") ?? "UNPAID";
  return {
    title: str(fd, "title") ?? "Расход",
    category: str(fd, "category") ?? "SONSTIGES",
    amountGross: gross,
    amountNet: net.toString(),
    vatRate,
    supplier: str(fd, "supplier"),
    invoiceNumber: str(fd, "invoiceNumber"),
    invoiceDate: date(fd, "invoiceDate"),
    paymentDate: date(fd, "paymentDate"),
    paymentMethod: str(fd, "paymentMethod"),
    paymentStatus,
    // Оплачено полностью → paidAmount = gross; частично → из формы; не оплачено → null.
    paidAmount:
      paymentStatus === "PAID" ? gross : paymentStatus === "PARTIALLY_PAID" ? money(fd, "paidAmount") : null,
    ownerCompany: str(fd, "ownerCompany"),
    responsibleUserId: str(fd, "responsibleUserId"),
    comment: str(fd, "comment"),
    carId: str(fd, "carId"),
    alreadyIncludedInAcquisitionCost: str(fd, "alreadyIncludedInAcquisitionCost") === "1",
  };
}

export async function createExpense(fd: FormData) {
  const user = await requireCan("expense.add");
  const data = expenseDataFromForm(fd);
  // Привязка к гарантийному случаю (§19) — только при создании из него.
  const exp = await prisma.expense.create({ data: { ...data, warrantyCaseId: str(fd, "warrantyCaseId"), approvalStatus: "APPROVED", createdById: user.id } });
  await audit(user.id, "Expense", exp.id, "create", {
    after: { title: exp.title, category: exp.category, amountGross: exp.amountGross.toString(), carId: exp.carId },
  });
  revalidateAll();
  revalidatePath("/expenses");
  redirect("/expenses");
}

export async function updateExpense(id: string, fd: FormData) {
  const user = await requireCan("expense.add");
  const data = expenseDataFromForm(fd);
  await prisma.expense.update({ where: { id }, data });
  await audit(user.id, "Expense", id, "update", { after: { title: data.title, amountGross: data.amountGross } });
  revalidateAll();
  revalidatePath("/expenses");
  if (data.carId) revalidatePath(`/cars/${data.carId}`);
  redirect("/expenses");
}

/** Отмена расхода — soft (§21): помечаем cancelled, физически не удаляем. */
export async function cancelExpense(id: string) {
  const user = await requireCan("expense.add");
  const exp = await prisma.expense.update({ where: { id }, data: { cancelled: true } });
  await audit(user.id, "Expense", id, "cancel", { before: { title: exp.title, amountGross: exp.amountGross.toString() } });
  revalidateAll();
  revalidatePath("/expenses");
  if (exp.carId) revalidatePath(`/cars/${exp.carId}`);
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

// ─── Сделки (§17) ──────────────────────────────────────────────
// UI воронки Deal удалён в фазе 5c (§4). Модель Deal и её данные оставлены как
// legacy (безопасная миграция позже); server-actions создания/движения сделок
// убраны — управлять ими из интерфейса больше нельзя.

// ─── Задачи (§15) ──────────────────────────────────────────────

// Сборка данных задачи из формы (§15.1). Общая для create/update.
// FAHRZEUG-задача обязана иметь авто; иначе тип принудительно ALLGEMEIN.
function taskDataFromForm(fd: FormData) {
  const type = str(fd, "type") === "FAHRZEUG" ? "FAHRZEUG" : "ALLGEMEIN";
  const carId = str(fd, "carId");
  if (type === "FAHRZEUG" && !carId) {
    throw new Error("Задача по автомобилю должна быть привязана к авто (§15.1)");
  }
  return {
    type,
    title: str(fd, "title") ?? "Задача",
    description: str(fd, "description"),
    priority: str(fd, "priority") ?? "MEDIUM",
    dueDate: date(fd, "dueDate"),
    assignedToUserId: str(fd, "assignedToUserId"),
    // ALLGEMEIN может быть без авто; carId значим только для FAHRZEUG.
    carId: type === "FAHRZEUG" ? carId : null,
  };
}

export async function createTask(fd: FormData) {
  const user = await requireCan("task.manage");
  const status = str(fd, "status") ?? "OPEN";
  const task = await prisma.task.create({
    data: {
      ...taskDataFromForm(fd),
      status,
      completedAt: status === "DONE" ? new Date() : null,
      createdById: user.id,
      // Привязка к гарантийному случаю (§19) — только при создании из него.
      warrantyCaseId: str(fd, "warrantyCaseId"),
    },
  });
  await audit(user.id, "Task", task.id, "create", {
    after: { title: task.title, type: task.type, priority: task.priority, status: task.status, carId: task.carId },
  });
  revalidateAll();
}

export async function updateTask(id: string, fd: FormData) {
  const user = await requireCan("task.manage");
  const status = str(fd, "status") ?? "OPEN";
  await prisma.task.update({
    where: { id },
    data: {
      ...taskDataFromForm(fd),
      status,
      // completedAt держим согласованным со статусом: DONE → отметка времени, иначе снят.
      completedAt: status === "DONE" ? new Date() : null,
    },
  });
  await audit(user.id, "Task", id, "update", { after: { status } });
  revalidatePath("/tasks");
  revalidateAll();
  redirect("/tasks");
}

/** Сменить статус задачи (§15.1) — быстрое действие из списка/карточки. */
export async function setTaskStatus(id: string, status: string) {
  const user = await requireCan("task.manage");
  await prisma.task.update({
    where: { id },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });
  await audit(user.id, "Task", id, "status", { after: { status } });
  revalidatePath("/tasks");
  revalidatePath("/");
}

/** Отмена задачи — soft (§15.2/§21): статус CANCELLED, физически не удаляем, историю сохраняем. */
export async function cancelTask(id: string) {
  const user = await requireCan("task.manage");
  const t = await prisma.task.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit(user.id, "Task", id, "cancel", { before: { title: t.title } });
  revalidatePath("/tasks");
  revalidatePath("/");
}

// ─── Календарь (§16) ───────────────────────────────────────────

// datetime-local отдаёт «2026-07-26T14:30» без пояса — трактуем как настенное
// время (согласовано с показом, §16). Возврат null, если поле пустое.
const dateTime = (fd: FormData, key: string): Date | null => {
  const v = str(fd, key);
  return v ? new Date(v) : null;
};

/**
 * Проверка пересечений термина (§16.3), server-side. Занятость создаёт тот же
 * сотрудник ИЛИ то же авто; отменённые (ABGESAGT) не блокируют. Возвращает
 * первый конфликтующий термин или null. Полуоткрытые интервалы: касание границами — ок.
 */
async function findAppointmentConflict(
  startAt: Date,
  endAt: Date,
  employeeId: string | null,
  carId: string | null,
  selfId?: string
) {
  const or: Prisma.AppointmentWhereInput[] = [];
  if (employeeId) or.push({ employeeId });
  if (carId) or.push({ carId });
  if (or.length === 0) return null; // без сотрудника и авто конфликтовать нечему

  return prisma.appointment.findFirst({
    where: {
      ...(selfId ? { id: { not: selfId } } : {}),
      status: { in: APPOINTMENT_BLOCKING_STATUSES },
      startAt: { lt: endAt }, // пересечение полуоткрытых интервалов
      endAt: { gt: startAt },
      OR: or,
    },
    include: { employee: { select: { name: true } }, car: { select: { make: true, model: true, mhNumber: true } } },
  });
}

function appointmentDataFromForm(fd: FormData) {
  const startAt = dateTime(fd, "startAt");
  const endAt = dateTime(fd, "endAt");
  if (!startAt || !endAt) throw new Error("Укажите начало и конец термина");
  if (endAt.getTime() <= startAt.getTime()) throw new Error("Конец термина должен быть позже начала");
  const clientId = str(fd, "clientId");
  return {
    startAt,
    endAt,
    clientId,
    clientName: str(fd, "clientName") ?? "—", // снимок имени (§16.1)
    phone: str(fd, "phone"),
    carId: str(fd, "carId"),
    employeeId: str(fd, "employeeId"),
    type: str(fd, "type") ?? "BESICHTIGUNG",
    result: str(fd, "result"),
    reminderMinutesBefore: num(fd, "reminderMinutesBefore"),
    comment: str(fd, "comment"),
  };
}

// Текст конфликта для пользователя (§16.3): что именно занято и когда.
function conflictMessage(
  c: { startAt: Date; endAt: Date; clientName: string; employee: { name: string } | null; car: { make: string; model: string; mhNumber: number } | null },
  sameEmployee: boolean
): string {
  const who = sameEmployee && c.employee ? `Сотрудник ${c.employee.name}` : c.car ? `Авто ${c.car.make} ${c.car.model} (MH-${String(c.car.mhNumber).padStart(4, "0")})` : "Ресурс";
  return `${who} уже занят: ${fmtDateTime(c.startAt)}–${fmtTime(c.endAt)} (клиент ${c.clientName}). Выберите другое время.`;
}

export async function createAppointment(fd: FormData) {
  const user = await requireCan("task.manage");
  const data = appointmentDataFromForm(fd);
  const conflict = await findAppointmentConflict(data.startAt, data.endAt, data.employeeId, data.carId);
  if (conflict) throw new Error(conflictMessage(conflict, conflict.employeeId === data.employeeId));

  const appt = await prisma.appointment.create({ data: { ...data, status: "GEPLANT", createdById: user.id } });
  await audit(user.id, "Appointment", appt.id, "create", {
    after: { clientName: appt.clientName, type: appt.type, startAt: appt.startAt.toISOString(), carId: appt.carId, employeeId: appt.employeeId },
  });
  revalidatePath("/calendar");
  redirect("/calendar");
}

export async function updateAppointment(id: string, fd: FormData) {
  const user = await requireCan("task.manage");
  const data = appointmentDataFromForm(fd);
  const conflict = await findAppointmentConflict(data.startAt, data.endAt, data.employeeId, data.carId, id);
  if (conflict) throw new Error(conflictMessage(conflict, conflict.employeeId === data.employeeId));

  await prisma.appointment.update({ where: { id }, data });
  await audit(user.id, "Appointment", id, "update", { after: { startAt: data.startAt.toISOString(), type: data.type } });
  revalidatePath("/calendar");
  redirect("/calendar");
}

/** Сменить статус термина (§16.1): подтверждён / пришёл / отменён / не пришёл. */
export async function setAppointmentStatus(id: string, status: string) {
  const user = await requireCan("task.manage");
  await prisma.appointment.update({ where: { id }, data: { status } });
  await audit(user.id, "Appointment", id, "status", { after: { status } });
  revalidatePath("/calendar");
}

// ─── Гарантийные случаи (§19) ──────────────────────────────────

function warrantyDataFromForm(fd: FormData) {
  const carId = str(fd, "carId");
  if (!carId) throw new Error("Выберите проданный автомобиль");
  return {
    carId,
    clientId: str(fd, "clientId"),
    complaintDescription: str(fd, "complaintDescription") ?? "—",
    clientReportedAt: date(fd, "clientReportedAt"),
    responsibleUserId: str(fd, "responsibleUserId"),
    workshop: str(fd, "workshop"),
    deadline: date(fd, "deadline"),
    diagnosis: str(fd, "diagnosis"),
    decision: str(fd, "decision"),
    communicationNotes: str(fd, "communicationNotes"),
    finalCost: money(fd, "finalCost"),
  };
}

export async function createWarrantyCase(fd: FormData) {
  const user = await requireCan("task.manage");
  const data = warrantyDataFromForm(fd);
  const wc = await prisma.warrantyCase.create({ data: { ...data, status: "OPEN", createdById: user.id } });
  await audit(user.id, "WarrantyCase", wc.id, "create", { after: { carId: wc.carId, complaint: wc.complaintDescription } });
  revalidatePath("/warranty");
  revalidatePath("/");
  redirect(`/warranty/${wc.id}`);
}

export async function updateWarrantyCase(id: string, fd: FormData) {
  const user = await requireCan("task.manage");
  const data = warrantyDataFromForm(fd);
  await prisma.warrantyCase.update({ where: { id }, data });
  await audit(user.id, "WarrantyCase", id, "update", { after: { complaint: data.complaintDescription } });
  revalidatePath("/warranty");
  revalidatePath(`/warranty/${id}`);
  redirect(`/warranty/${id}`);
}

/**
 * Сменить статус случая (§19). При переходе в терминальный (RESOLVED/REJECTED/CLOSED)
 * фиксируем resolvedAt (если ещё не стоял); при возврате в работу — снимаем.
 */
export async function setWarrantyStatus(id: string, status: string) {
  const user = await requireCan("task.manage");
  const cur = await prisma.warrantyCase.findUnique({ where: { id }, select: { resolvedAt: true } });
  const terminal = ["RESOLVED", "REJECTED", "CLOSED"].includes(status);
  await prisma.warrantyCase.update({
    where: { id },
    data: { status, resolvedAt: terminal ? (cur?.resolvedAt ?? new Date()) : null },
  });
  await audit(user.id, "WarrantyCase", id, "status", { after: { status } });
  revalidatePath("/warranty");
  revalidatePath(`/warranty/${id}`);
  revalidatePath("/");
}
