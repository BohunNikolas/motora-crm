/**
 * Тестовые данные MOTORA CRM.
 * Запуск: npm run seed  (полностью перезаписывает базу)
 *
 * Набор специально содержит граничные случаи, на которых врут отчёты:
 *  - продажа, закрытая в ПРОШЛОМ месяце → не должна попасть в выручку месяца
 *  - закупка (PURCHASE), закрытая в этом месяце → не выручка, это расход
 *  - закрытая сделка без суммы → маржа не считается
 *  - потерянные сделки → не в работе и не в выручке
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

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
  await p.task.deleteMany();
  await p.deal.deleteMany();
  await p.expense.deleteMany();
  await p.car.deleteMany();
  await p.client.deleteMany();

  const car = (data, expenses = []) =>
    p.car.create({ data: { ...data, expenses: { create: expenses } } });

  const [camry, rio, solaris, polo, mazda, octavia, duster, qashqai, rav4, focus] =
    await Promise.all([
      car(
        { make: "Toyota", model: "Camry", year: 2019, mileage: 92000, vin: "JTNBE46K473012345",
          color: "Чёрный", transmission: "АКПП", fuel: "Бензин", engineVol: 2.5,
          purchasePrice: 12000, listPrice: 15500, status: "AVAILABLE",
          notes: "Один владелец, сервисная книжка." },
        [{ title: "Замена колодок", amount: 250 }, { title: "Химчистка салона", amount: 180 }]
      ),
      car(
        { make: "Kia", model: "Rio", year: 2017, mileage: 78000, color: "Белый",
          transmission: "МКПП", fuel: "Бензин", engineVol: 1.6,
          purchasePrice: 7000, listPrice: 9200, status: "AVAILABLE" },
        [{ title: "Полировка кузова", amount: 150 }]
      ),
      car(
        { make: "Hyundai", model: "Solaris", year: 2018, mileage: 64000, color: "Серебристый",
          transmission: "АКПП", fuel: "Бензин", engineVol: 1.6,
          purchasePrice: 8000, listPrice: 10500, status: "PREP",
          notes: "Ждём стойки, потом на мойку." },
        [{ title: "Замена стоек", amount: 320 }, { title: "Развал-схождение", amount: 90 }]
      ),
      car(
        { make: "Volkswagen", model: "Polo", year: 2019, mileage: 55000, color: "Синий",
          transmission: "АКПП", fuel: "Бензин", engineVol: 1.6,
          purchasePrice: 9000, listPrice: 11800, status: "AVAILABLE" }
      ),
      car(
        { make: "Mazda", model: "6", year: 2016, mileage: 110000, color: "Красный",
          transmission: "АКПП", fuel: "Бензин", engineVol: 2.0,
          purchasePrice: 10000, listPrice: 13000, status: "RESERVED",
          notes: "Бронь до пятницы, залог внесён." },
        [{ title: "Ремонт кондиционера", amount: 400 }]
      ),
      car(
        { make: "Skoda", model: "Octavia", year: 2020, mileage: 41000, color: "Серый",
          transmission: "Робот", fuel: "Дизель", engineVol: 2.0,
          purchasePrice: 14000, listPrice: 17500, status: "AVAILABLE" },
        [{ title: "Замена масла и фильтров", amount: 260 }]
      ),
      car(
        { make: "Renault", model: "Duster", year: 2018, mileage: 87000, color: "Оранжевый",
          transmission: "МКПП", fuel: "Бензин", engineVol: 2.0,
          purchasePrice: 8500, listPrice: 11000, status: "PREP" },
        [{ title: "Химчистка", amount: 180 }]
      ),
      // Продан в этом месяце
      car(
        { make: "Nissan", model: "Qashqai", year: 2017, mileage: 95000, color: "Белый",
          transmission: "Вариатор", fuel: "Бензин", engineVol: 2.0,
          purchasePrice: 11000, listPrice: 14200, status: "SOLD" },
        [{ title: "Замена ремня ГРМ", amount: 300 }]
      ),
      // Продан в этом месяце
      car(
        { make: "Toyota", model: "RAV4", year: 2018, mileage: 72000, color: "Чёрный",
          transmission: "АКПП", fuel: "Бензин", engineVol: 2.0,
          purchasePrice: 15000, listPrice: 19000, status: "SOLD" },
        [{ title: "Новая резина", amount: 500 }]
      ),
      // Продан в ПРОШЛОМ месяце — не должен попасть в выручку текущего
      car(
        { make: "Ford", model: "Focus", year: 2015, mileage: 130000, color: "Зелёный",
          transmission: "МКПП", fuel: "Бензин", engineVol: 1.6,
          purchasePrice: 6000, listPrice: 8000, status: "SOLD" },
        [{ title: "Сварка порогов", amount: 220 }]
      ),
    ]);

  const clientData = [
    ["Андрей Петров", "+7 900 123-45-67", "a.petrov@mail.ru", "BUYER", "Авито", "Ищет седан до $16 000, готов на трейд-ин"],
    ["Марина Соколова", "+7 921 555-11-02", null, "SELLER", "Рекомендация", "Продаёт Kia Rio 2017"],
    ["Игорь Ковальчук", "+7 903 777-88-99", "igor.k@gmail.com", "BOTH", "Авто.ру", "Меняет Solaris на кроссовер"],
    ["Елена Дорошенко", "+7 916 234-56-78", "e.dor@yandex.ru", "BUYER", "Сайт", null],
    ["Сергей Мельник", "+7 905 888-12-34", null, "BUYER", "Проходящий", "Смотрел Octavia, думает"],
    ["Ольга Кравец", "+7 926 445-67-89", "o.kravets@mail.ru", "BUYER", "Авито", "Нужен автомат, бюджет до $12 000"],
    ["Дмитрий Волошин", "+7 999 111-22-33", null, "SELLER", "Рекомендация", "Хочет сдать Duster"],
    ["Наталья Гуменюк", "+7 912 777-00-11", "n.gum@gmail.com", "BUYER", "Авто.ру", null],
    ["Виктор Лысенко", "+7 908 333-44-55", null, "BOTH", "Сайт", "Постоянный клиент, третья машина"],
    ["Алина Шевчук", "+7 967 222-99-88", "alina.sh@mail.ru", "BUYER", "Другое", "Пришла по рекламе в Телеграме"],
  ];

  const clients = await Promise.all(
    clientData.map(([name, phone, email, type, source, notes]) =>
      p.client.create({ data: { name, phone, email, type, source, notes } })
    )
  );
  const [andrey, marina, igor, elena, sergey, olga, dmitry, natalia, viktor, alina] = clients;

  await Promise.all([
    // ── В работе: по одной-две на каждом этапе воронки ──
    p.deal.create({ data: { clientId: andrey.id, carId: camry.id, type: "SALE", stage: "NEW", amount: 15500, notes: "Звонил с Авито, хочет посмотреть в выходные", createdAt: day(-1) } }),
    p.deal.create({ data: { clientId: alina.id, carId: polo.id, type: "SALE", stage: "NEW", amount: 11800, createdAt: day(-2) } }),
    p.deal.create({ data: { clientId: olga.id, carId: rio.id, type: "SALE", stage: "CONTACT", amount: 9200, notes: "Перезвонить после обеда", createdAt: day(-4) } }),
    p.deal.create({ data: { clientId: sergey.id, carId: octavia.id, type: "SALE", stage: "TEST_DRIVE", amount: 17500, notes: "Тест-драйв в субботу", createdAt: day(-6) } }),
    p.deal.create({ data: { clientId: natalia.id, carId: mazda.id, type: "SALE", stage: "NEGOTIATION", amount: 12500, notes: "Торгуется, просит скидку $500", createdAt: day(-8) } }),
    p.deal.create({ data: { clientId: viktor.id, carId: mazda.id, type: "SALE", stage: "CONTRACT", amount: 13000, notes: "Залог внесён, договор в пятницу", createdAt: day(-3) } }),
    // Трейд-ин в работе
    p.deal.create({ data: { clientId: igor.id, carId: duster.id, type: "TRADE_IN", stage: "CONTACT", amount: 10500, notes: "Меняет Solaris с доплатой", createdAt: day(-5) } }),

    // ── Закрыто в ЭТОМ месяце → выручка и маржа ──
    p.deal.create({ data: { clientId: elena.id, carId: qashqai.id, type: "SALE", stage: "DONE", amount: 14000, createdAt: day(-20), closedAt: day(-9) } }),
    p.deal.create({ data: { clientId: viktor.id, carId: rav4.id, type: "SALE", stage: "DONE", amount: 18500, createdAt: day(-25), closedAt: day(-4) } }),

    // ── Закрыто в ПРОШЛОМ месяце → в выручку текущего попасть НЕ должно ──
    p.deal.create({ data: { clientId: dmitry.id, carId: focus.id, type: "SALE", stage: "DONE", amount: 7800, createdAt: day(-45), closedAt: lastMonth() } }),

    // ── Закупка, закрыта в этом месяце → это не выручка ──
    p.deal.create({ data: { clientId: marina.id, carId: rio.id, type: "PURCHASE", stage: "DONE", amount: 7000, createdAt: day(-30), closedAt: day(-12) } }),

    // ── Потеряны ──
    p.deal.create({ data: { clientId: sergey.id, carId: solaris.id, type: "SALE", stage: "LOST", amount: 10500, notes: "Ушёл к конкурентам", createdAt: day(-14), closedAt: day(-7) } }),
    p.deal.create({ data: { clientId: olga.id, type: "SALE", stage: "LOST", notes: "Не выходит на связь", createdAt: day(-18), closedAt: day(-10) } }),
  ]);

  await p.task.createMany({
    data: [
      { title: "Перезвонить Андрею по Camry — обещал ответ", dueDate: dueDay(-3), clientId: andrey.id, carId: camry.id },
      { title: "Отдать документы в банк по Qashqai", dueDate: dueDay(-1), clientId: elena.id },
      { title: "Тест-драйв Octavia в 15:00", dueDate: dueDay(0), clientId: sergey.id, carId: octavia.id },
      { title: "Подписать договор с Виктором", dueDate: dueDay(0), clientId: viktor.id, carId: mazda.id },
      { title: "Выставить Polo на Авито", dueDate: dueDay(1), carId: polo.id },
      { title: "Забрать стойки для Solaris", dueDate: dueDay(2), carId: solaris.id },
      { title: "Записать Duster на химчистку", dueDate: dueDay(5), carId: duster.id },
      { title: "Найти зимнюю резину под Camry", dueDate: null, carId: camry.id },
      { title: "Оплатить рекламу на Авито", dueDate: dueDay(-8), done: true },
      { title: "Забрать RAV4 с мойки", dueDate: dueDay(-5), done: true, carId: rav4.id },
    ],
  });

  console.log("Готово:");
  console.log("  авто:    ", await p.car.count());
  console.log("  клиенты: ", await p.client.count());
  console.log("  сделки:  ", await p.deal.count());
  console.log("  задачи:  ", await p.task.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
