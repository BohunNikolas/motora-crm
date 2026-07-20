/**
 * Авторизация MOTORHOF — капабилити-матрица из docs/roles-motorhof.md.
 *
 * Принципы:
 *  - права выражаются капабилити, НЕ проверками `if role === ...` по коду;
 *  - у пользователя несколько ролей, итог = union капабилити всех ролей;
 *  - проверка ВСЕГДА server-side: `can()` в Server Actions, флаги видимости
 *    (`viewerFlags`) в серверных компонентах ДО рендера — так запрещённые
 *    цифры физически не попадают в HTML (redaction, а не прятание в CSS).
 */

export type Role = "ADMIN" | "PARTNER" | "SALES" | "TECHNICAL" | "READ_ONLY";

export type Capability =
  // Видимость
  | "see.acquisition" // закупка, einkauf24, Auktionsrechnung, закупочные счета, суммы расходов €
  | "see.internalPrice" // внутренний Verkaufspreis e.U.→OG, результаты компаний (§9)
  | "see.margin" // маржа, Differenz-USt €, прибыль компаний, стоимость склада по закупке
  | "see.minPrice" // Mindestverkaufspreis
  | "see.salePrice" // Verkaufspreis / суммы сделок
  | "see.taxScheme" // НАЗВАНИЕ налогового режима (без суммы)
  | "see.deals" // раздел сделок/воронки
  | "see.clientFull" // полные данные клиентов
  // Действия
  | "edit.car" // создание/правка карточки авто (полная форма с деньгами)
  | "edit.carDescription" // описание/фото (SALES; отдельная форма — фаза 3)
  | "edit.salePrice" // менять цену продажи (не ниже минимума)
  | "edit.minPrice"
  | "edit.tech" // диагностика, Pickerl, Serviceheft (только TECHNICAL/ADMIN — решение 20.07)
  | "sell" // брони, продажи, движение сделок
  | "sell.belowMin" // подтверждать продажу ниже минимума
  | "expense.add" // добавлять расход (сразу APPROVED)
  | "expense.addPending" // добавлять смету (PENDING, Kostenvoranschlag)
  | "expense.approve" // подтверждать смету
  | "task.manage" // создавать/закрывать задачи
  | "client.manage" // создавать/править клиентов
  | "status.sales" // статусы RESERVED/SOLD (+ фото-статусы в фазе 3)
  | "status.tech" // статусы подготовки (PREP/AVAILABLE, в фазе 3 — 4 техстатуса)
  | "owner.change" // менять currentOwner
  | "tax.change" // менять taxScheme
  | "delete.any" // удаление и восстановление истории
  | "users.manage" // пользователи, роли, безопасность
  | "audit.view";

const CAPS: Record<Role, Capability[]> = {
  ADMIN: [
    "see.acquisition", "see.internalPrice", "see.margin", "see.minPrice", "see.salePrice", "see.taxScheme",
    "see.deals", "see.clientFull",
    "edit.car", "edit.carDescription", "edit.salePrice", "edit.minPrice", "edit.tech",
    "sell", "sell.belowMin",
    "expense.add", "expense.addPending", "expense.approve",
    "task.manage", "client.manage", "status.sales", "status.tech",
    "owner.change", "tax.change", "delete.any", "users.manage", "audit.view",
  ],
  PARTNER: [
    "see.acquisition", "see.internalPrice", "see.margin", "see.minPrice", "see.salePrice", "see.taxScheme",
    "see.deals", "see.clientFull",
    "edit.car", "edit.carDescription", "edit.salePrice", "edit.minPrice",
    "sell", "sell.belowMin",
    "expense.add", "expense.addPending", "expense.approve",
    "task.manage", "client.manage", "status.sales", "status.tech",
    "owner.change", "tax.change", "audit.view",
    // НЕТ: edit.tech (решение 20.07), delete.any, users.manage
  ],
  SALES: [
    "see.minPrice", "see.salePrice", "see.taxScheme", "see.deals", "see.clientFull",
    "edit.carDescription", "edit.salePrice",
    "sell",
    "task.manage", "client.manage", "status.sales",
    // НЕТ: see.acquisition, see.margin, edit.tech, expense.*, owner/tax, delete
  ],
  TECHNICAL: [
    "edit.tech", "expense.addPending", "task.manage", "status.tech",
    // Видит техчасть (базовая видимость авто есть у всех вошедших),
    // НЕТ: цен продажи, минимума, финансов, сделок, полных данных клиентов
  ],
  READ_ONLY: [
    "see.salePrice", "see.taxScheme", "see.deals",
    // только просмотр: ни одной мутирующей капабилити
  ],
};

export type AuthUser = { id: string; email: string; name: string; roles: string[] };

export function can(user: AuthUser | null, cap: Capability): boolean {
  if (!user) return false;
  return user.roles.some((r) => CAPS[r as Role]?.includes(cap));
}

/**
 * Флаги видимости для серверных компонентов — вычислить ОДИН раз в начале
 * страницы и рендерить условно. Запрещённое не сериализуется в RSC-payload.
 */
export function viewerFlags(user: AuthUser | null) {
  return {
    seeAcquisition: can(user, "see.acquisition"),
    seeInternalPrice: can(user, "see.internalPrice"),
    seeMargin: can(user, "see.margin"),
    seeMinPrice: can(user, "see.minPrice"),
    seeSalePrice: can(user, "see.salePrice"),
    seeTaxScheme: can(user, "see.taxScheme"),
    seeDeals: can(user, "see.deals"),
    canSell: can(user, "sell"),
    canEditCar: can(user, "edit.car"),
    canEditTech: can(user, "edit.tech"),
    canApproveExpense: can(user, "expense.approve"),
    canAddExpense: can(user, "expense.add") || can(user, "expense.addPending"),
    canManageTasks: can(user, "task.manage"),
    canManageClients: can(user, "client.manage"),
    canDelete: can(user, "delete.any"),
    isAdmin: can(user, "users.manage"),
  };
}

export type ViewerFlags = ReturnType<typeof viewerFlags>;
