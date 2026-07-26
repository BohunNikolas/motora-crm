/**
 * Тестовые данные MOTORHOF CRM (автосалон в Австрии).
 * Запуск: npm run seed  (полностью перезаписывает базу)
 *
 * Данные подобраны под австрийский рынок: популярные модели, телефоны +43,
 * источники Willhaben/AutoScout24. Набор содержит граничные случаи для отчётов:
 *  - продажа в ПРОШЛОМ месяце → не в выручке текущего
 *  - закупка (PURCHASE) в этом месяце → не выручка, это расход
 *  - закрытая сделка без суммы → маржа не считается
 *  - потерянные сделки → не в работе и не в выручке
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

// Предохранитель: сид стирает базу целиком. На локальной это норма, на боевой —
// катастрофа. Поэтому для удалённой базы требуем явный флаг --force.
const url = process.env.DATABASE_URL ?? "file:./dev.db";
const isLocal =
  url.startsWith("file:") || url.includes("localhost") || url.includes("127.0.0.1");

if (!isLocal && !process.argv.includes("--force")) {
  console.error("⛔ DATABASE_URL указывает на удалённую базу.");
  console.error("   Сид УДАЛИТ из неё все данные: авто, клиентов, сделки, задачи.");
  console.error("   Если это точно то, что нужно: npm run seed -- --force");
  process.exit(1);
}

const day = (offset) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

const dueDay = (offset) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

/** Дата в прошлом месяце (20-е число) — для проверки границы месяца */
const lastMonth = () => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setMonth(d.getMonth() - 1, 20);
  return d;
};

async function main() {
  // Порядок важен: сначала зависимые сущности
  await p.appointment.deleteMany();
  await p.warrantyCase.deleteMany();
  await p.sale.deleteMany();
  await p.task.deleteMany();
  await p.deal.deleteMany();
  await p.expense.deleteMany();
  await p.car.deleteMany();
  await p.client.deleteMany();

  const car = (data, expenses = []) =>
    p.car.create({
      data: {
        ...data,
        expenses: { create: expenses.map((e) => ({ title: e.title, amountGross: e.amount })) },
      },
    });

  // Австрийский топ б/у: Golf, Octavia, Tiguan, A4, 3er, Polo, Astra, Clio, Fabia, Focus.
  const [golf, fabia, astra, polo, a4, octavia, clio, tiguan, bmw, focus] =
    await Promise.all([
      car(
        { make: "Volkswagen", model: "Golf", year: 2019, mileage: 78000, vin: "WVWZZZ1KZAW123456",
          color: "Серый", transmission: "МКПП", fuel: "Дизель", engineVol: 2.0,
          purchasePrice: 16500, listPrice: 19900, status: "READY_FOR_SALE",
          notes: "Один владелец, сервисная книжка полная." },
        [{ title: "Замена колодок", amount: 250 }, { title: "Химчистка салона", amount: 180 }]
      ),
      car(
        { make: "Skoda", model: "Fabia", year: 2018, mileage: 64000, color: "Белый",
          transmission: "МКПП", fuel: "Бензин", engineVol: 1.0,
          purchasePrice: 9500, listPrice: 12200, status: "READY_FOR_SALE" },
        [{ title: "Полировка кузова", amount: 150 }]
      ),
      car(
        { make: "Opel", model: "Astra", year: 2018, mileage: 89000, color: "Серебристый",
          transmission: "АКПП", fuel: "Дизель", engineVol: 1.6,
          purchasePrice: 11000, listPrice: 13900, status: "IN_PREPARATION",
          notes: "Ждём стойки, потом на мойку." },
        [{ title: "Замена стоек", amount: 320 }, { title: "Развал-схождение", amount: 90 }]
      ),
      car(
        { make: "Volkswagen", model: "Polo", year: 2019, mileage: 52000, color: "Синий",
          transmission: "АКПП", fuel: "Бензин", engineVol: 1.0,
          purchasePrice: 11000, listPrice: 13800, status: "READY_FOR_SALE" }
      ),
      car(
        { make: "Audi", model: "A4 Avant", year: 2017, mileage: 112000, color: "Чёрный",
          transmission: "АКПП", fuel: "Дизель", engineVol: 2.0,
          purchasePrice: 18000, listPrice: 22500, status: "RESERVED",
          notes: "Бронь до пятницы, залог внесён." },
        [{ title: "Ремонт кондиционера", amount: 400 }]
      ),
      car(
        { make: "Skoda", model: "Octavia", year: 2020, mileage: 41000, color: "Серый",
          transmission: "Робот", fuel: "Дизель", engineVol: 2.0,
          purchasePrice: 17000, listPrice: 20900, status: "READY_FOR_SALE" },
        [{ title: "Замена масла и фильтров", amount: 260 }]
      ),
      car(
        { make: "Renault", model: "Clio", year: 2018, mileage: 71000, color: "Красный",
          transmission: "МКПП", fuel: "Бензин", engineVol: 0.9,
          purchasePrice: 8500, listPrice: 10900, status: "IN_PREPARATION" },
        [{ title: "Химчистка", amount: 180 }]
      ),
      // Продан в этом месяце
      car(
        { make: "Volkswagen", model: "Tiguan", year: 2017, mileage: 98000, color: "Белый",
          transmission: "АКПП", fuel: "Дизель", engineVol: 2.0,
          purchasePrice: 15500, listPrice: 18900, status: "SOLD" },
        [{ title: "Замена ремня ГРМ", amount: 300 }]
      ),
      // Продан в этом месяце
      car(
        { make: "BMW", model: "320d", year: 2018, mileage: 84000, color: "Чёрный",
          transmission: "АКПП", fuel: "Дизель", engineVol: 2.0,
          purchasePrice: 19000, listPrice: 23500, status: "SOLD" },
        [{ title: "Новая резина", amount: 500 }]
      ),
      // Продан в ПРОШЛОМ месяце — не должен попасть в выручку текущего
      car(
        { make: "Ford", model: "Focus", year: 2016, mileage: 121000, color: "Тёмно-синий",
          transmission: "МКПП", fuel: "Дизель", engineVol: 1.5,
          purchasePrice: 7500, listPrice: 9900, status: "SOLD" },
        [{ title: "Сварка порогов", amount: 220 }]
      ),
    ]);

  // Клиенты — австрийские имена, телефоны +43, e-mail на местных доменах.
  const clientData = [
    ["Thomas Gruber", "+43 664 1234501", "t.gruber@gmx.at", "BUYER", "WILLHABEN", "Ищет универсал до € 20.000, предпочитает дизель"],
    ["Anna Bauer", "+43 660 2345602", null, "SELLER", "EMPFEHLUNG", "Продаёт Skoda Fabia 2018"],
    ["Michael Huber", "+43 676 3456703", "m.huber@gmail.com", "BOTH", "AUTOSCOUT24", "Меняет Astra на кроссовер"],
    ["Sabine Wagner", "+43 699 4567804", "s.wagner@aon.at", "BUYER", "WEBSITE", null],
    ["Andreas Pichler", "+43 664 5678905", null, "BUYER", "LAUFKUNDSCHAFT", "Смотрел Octavia, думает"],
    ["Julia Steiner", "+43 660 6789006", "j.steiner@a1.net", "BUYER", "WILLHABEN", "Нужен автомат, бюджет до € 15.000"],
    ["Markus Hofer", "+43 676 7890107", null, "SELLER", "EMPFEHLUNG", "Хочет сдать Clio"],
    ["Christina Mayer", "+43 699 8901208", "c.mayer@gmx.at", "BUYER", "AUTOSCOUT24", null],
    ["Stefan Berger", "+43 664 9012309", null, "BOTH", "WEBSITE", "Постоянный клиент, третья машина у нас"],
    ["Katharina Fuchs", "+43 660 0123410", "k.fuchs@gmail.com", "BUYER", "SOCIAL_MEDIA", "Пришла по рекламе в Instagram"],
  ];

  const clients = await Promise.all(
    clientData.map(([name, phone, email, type, source, notes]) =>
      p.client.create({ data: { name, phone, email, type, source, notes } })
    )
  );
  const [thomas, anna, michael, sabine, andreas, julia, markus, christina, stefan, katharina] = clients;

  // Продажи (§18, источник истины по продажам/маржа). Проданные авто связываем
  // с покупателями; бронь — RESERVED. financialSnapshot замораживает маржу.
  const emp = await p.user.findFirst({ where: { active: true } });
  const snap = (gross, margin, scheme = "DIFFERENZBESTEUERUNG") => ({ salePriceGross: gross, finalMargin: margin, taxScheme: scheme });
  await Promise.all([
    p.sale.create({ data: { carId: tiguan.id, clientId: sabine.id, stage: "COMPLETED", saleDate: day(-5), actualSalePriceGross: 18900, paymentStatus: "PAID", paymentMethod: "TRANSFER", saleCategory: "B2C", employeeUserId: emp?.id, financialSnapshot: snap(18900, 2683.33) } }),
    p.sale.create({ data: { carId: bmw.id, clientId: christina.id, stage: "COMPLETED", saleDate: day(-3), actualSalePriceGross: 23500, paymentStatus: "PAID", paymentMethod: "FINANCING", saleCategory: "B2C", employeeUserId: emp?.id, financialSnapshot: snap(23500, 3416.67) } }),
    p.sale.create({ data: { carId: focus.id, clientId: michael.id, stage: "COMPLETED", saleDate: lastMonth(), actualSalePriceGross: 9900, paymentStatus: "PAID", paymentMethod: "CASH", saleCategory: "B2C", employeeUserId: emp?.id, financialSnapshot: snap(9900, 2016.67) } }),
    p.sale.create({ data: { carId: a4.id, clientId: stefan.id, stage: "RESERVED", reservedAt: day(-2), reservationExpiresAt: day(3), anzahlung: 700, reservationPaymentMethod: "CASH", reservationComment: "Залог внесён, ждёт одобрения кредита" } }),
  ]);

  await Promise.all([
    // ── В работе: по одной-две на каждом этапе воронки (legacy Deal, UI снят) ──
    p.deal.create({ data: { clientId: thomas.id, carId: golf.id, type: "SALE", stage: "NEW", amount: 19900, notes: "Обращение с Willhaben, хочет посмотреть в выходные", createdAt: day(-1) } }),
    p.deal.create({ data: { clientId: katharina.id, carId: polo.id, type: "SALE", stage: "NEW", amount: 13800, createdAt: day(-2) } }),
    p.deal.create({ data: { clientId: julia.id, carId: fabia.id, type: "SALE", stage: "CONTACT", amount: 12200, notes: "Перезвонить после обеда", createdAt: day(-4) } }),
    p.deal.create({ data: { clientId: andreas.id, carId: octavia.id, type: "SALE", stage: "TEST_DRIVE", amount: 20900, notes: "Тест-драйв в субботу", createdAt: day(-6) } }),
    p.deal.create({ data: { clientId: christina.id, carId: a4.id, type: "SALE", stage: "NEGOTIATION", amount: 22000, notes: "Торгуется, просит скидку € 500", createdAt: day(-8) } }),
    p.deal.create({ data: { clientId: stefan.id, carId: a4.id, type: "SALE", stage: "CONTRACT", amount: 22500, notes: "Залог внесён, договор в пятницу", createdAt: day(-3) } }),
    // Трейд-ин в работе
    p.deal.create({ data: { clientId: michael.id, carId: clio.id, type: "TRADE_IN", stage: "CONTACT", amount: 10900, notes: "Меняет Astra с доплатой", createdAt: day(-5) } }),

    // ── Закрыто в ЭТОМ месяце → выручка и маржа ──
    p.deal.create({ data: { clientId: sabine.id, carId: tiguan.id, type: "SALE", stage: "DONE", amount: 18900, createdAt: day(-20), closedAt: day(-9) } }),
    p.deal.create({ data: { clientId: christina.id, carId: bmw.id, type: "SALE", stage: "DONE", amount: 23500, createdAt: day(-25), closedAt: day(-4) } }),

    // ── Закрыто в ПРОШЛОМ месяце → в выручку текущего попасть НЕ должно ──
    p.deal.create({ data: { clientId: markus.id, carId: focus.id, type: "SALE", stage: "DONE", amount: 9900, createdAt: day(-45), closedAt: lastMonth() } }),

    // ── Закупка, закрыта в этом месяце → это не выручка ──
    p.deal.create({ data: { clientId: anna.id, carId: fabia.id, type: "PURCHASE", stage: "DONE", amount: 9500, createdAt: day(-30), closedAt: day(-12) } }),

    // ── Потеряны ──
    p.deal.create({ data: { clientId: andreas.id, carId: astra.id, type: "SALE", stage: "LOST", amount: 13900, notes: "Ушёл к конкурентам", createdAt: day(-14), closedAt: day(-7) } }),
    p.deal.create({ data: { clientId: julia.id, type: "SALE", stage: "LOST", notes: "Не выходит на связь", createdAt: day(-18), closedAt: day(-10) } }),
  ]);

  await p.task.createMany({
    data: [
      // type: с авто → FAHRZEUG, иначе ALLGEMEIN (§15.1). Разные приоритеты/статусы для демо.
      { title: "Перезвонить Thomas по Golf — обещал ответ", type: "FAHRZEUG", priority: "HIGH", dueDate: dueDay(-3), clientId: thomas.id, carId: golf.id },
      { title: "Отдать документы в банк по Tiguan", type: "ALLGEMEIN", priority: "URGENT", dueDate: dueDay(-1), clientId: sabine.id },
      { title: "Тест-драйв Octavia в 15:00", type: "FAHRZEUG", priority: "MEDIUM", status: "IN_PROGRESS", dueDate: dueDay(0), clientId: andreas.id, carId: octavia.id },
      { title: "Подписать договор со Stefan", type: "FAHRZEUG", priority: "HIGH", dueDate: dueDay(0), clientId: stefan.id, carId: a4.id },
      { title: "Выставить Polo на Willhaben", type: "FAHRZEUG", priority: "LOW", dueDate: dueDay(1), carId: polo.id },
      { title: "Забрать стойки для Astra", type: "FAHRZEUG", priority: "MEDIUM", status: "BLOCKED", dueDate: dueDay(2), carId: astra.id },
      { title: "Записать Clio на химчистку", type: "FAHRZEUG", priority: "LOW", dueDate: dueDay(5), carId: clio.id },
      { title: "Найти зимнюю резину под Golf", type: "FAHRZEUG", priority: "LOW", dueDate: null, carId: golf.id },
      { title: "Оплатить рекламу на Willhaben", type: "ALLGEMEIN", priority: "MEDIUM", status: "DONE", completedAt: day(-7), dueDate: dueDay(-8) },
      { title: "Забрать BMW с мойки", type: "FAHRZEUG", priority: "MEDIUM", status: "DONE", completedAt: day(-4), dueDate: dueDay(-5), carId: bmw.id },
    ],
  });

  // Термины календаря (§16). Время — «настенное» на ближайшие дни.
  const at = (offset, hh, mm) => { const d = new Date(); d.setHours(hh, mm, 0, 0); d.setDate(d.getDate() + offset); return d; };
  await p.appointment.createMany({
    data: [
      { clientName: thomas.name, phone: thomas.phone, clientId: thomas.id, carId: golf.id, employeeId: emp?.id, startAt: at(0, 10, 0), endAt: at(0, 10, 30), type: "BESICHTIGUNG", status: "BESTAETIGT" },
      { clientName: andreas.name, phone: andreas.phone, clientId: andreas.id, carId: octavia.id, employeeId: emp?.id, startAt: at(0, 14, 0), endAt: at(0, 15, 0), type: "PROBEFAHRT", status: "GEPLANT" },
      { clientName: stefan.name, phone: stefan.phone, clientId: stefan.id, carId: a4.id, employeeId: emp?.id, startAt: at(1, 11, 0), endAt: at(1, 11, 45), type: "ABHOLUNG", status: "GEPLANT" },
      { clientName: sabine.name, phone: sabine.phone, clientId: sabine.id, carId: tiguan.id, startAt: at(2, 16, 0), endAt: at(2, 16, 30), type: "BESICHTIGUNG", status: "GEPLANT" },
      { clientName: "Wolfgang Reiter", phone: "+43 660 7654321", startAt: at(-1, 9, 0), endAt: at(-1, 9, 30), type: "BESICHTIGUNG", status: "NICHT_ERSCHIENEN" },
    ],
  });

  // Гарантийные случаи (§19) по проданным авто.
  await p.warrantyCase.createMany({
    data: [
      { carId: focus.id, clientId: michael.id, complaintDescription: "Стук в передней подвеске на неровностях", status: "IN_REPAIR", responsibleUserId: emp?.id, workshop: "Werkstatt Müller", clientReportedAt: day(-4), openedAt: day(-4), deadline: day(3), diagnosis: "Изношены стойки стабилизатора", decision: "Замена по гарантии" },
      { carId: tiguan.id, clientId: sabine.id, complaintDescription: "Ошибка на панели — датчик давления в шинах", status: "RESOLVED", responsibleUserId: emp?.id, clientReportedAt: day(-15), openedAt: day(-15), diagnosis: "Неисправен датчик TPMS", decision: "Датчик заменён", finalCost: 120, resolvedAt: day(-10) },
    ],
  });

  console.log("Готово:");
  console.log("  авто:    ", await p.car.count());
  console.log("  клиенты: ", await p.client.count());
  console.log("  сделки:  ", await p.deal.count());
  console.log("  задачи:  ", await p.task.count());
  console.log("  термины: ", await p.appointment.count());
  console.log("  гарантия:", await p.warrantyCase.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
