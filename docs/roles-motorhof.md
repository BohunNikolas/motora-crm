# Роли и права MOTORHOF (спецификация заказчика, 20.07)

Заменяет упрощённый набор ADMIN/STAFF/READER. **Один пользователь может иметь несколько ролей — итоговые права = объединение (union) всех его ролей.**

## Роли

| Роль | Назначение |
|---|---|
| ADMIN | Полный системный доступ, управление пользователями/ролями/безопасностью |
| PARTNER | Учредитель: финансы, закупки, владельцы, согласования, отчёты |
| SALES | Продажи, клиенты, Termine, брони, продажи, фото и описание авто |
| TECHNICAL | AutoHub: диагностика, Pickerl, Serviceheft, ремонт, тех. фото и задачи |
| READ_ONLY | Просмотр без редактирования (опционально) |

Отдельные ACCOUNTING и PREPARATION — удалить (функции бухгалтера у ADMIN/PARTNER, фотографа — у SALES).

## Пользователи (назначение ролей)

| Пользователь | Роли |
|---|---|
| Иван | ADMIN + PARTNER + SALES |
| Виталик | PARTNER + SALES |
| Сергей | PARTNER + TECHNICAL |
| Наёмный продавец | SALES |
| Работник AutoHub | TECHNICAL |

## Капабилити-матрица (что реально проверяет код)

Права выражаются через `can(user, capability)` — true, если **хоть одна** роль пользователя даёт capability.

| Capability | ADMIN | PARTNER | SALES | TECHNICAL | READ_ONLY |
|---|:-:|:-:|:-:|:-:|:-:|
| **Видимость данных** | | | | | |
| see.acquisition (purchasePrice, einkauf24, Auktionsrechnung, закупочные счета, суммы расходов €) | ✓ | ✓ | ✗ | ✗ | по роли |
| see.internalPrice (e.U.→OG internalTransferPrice) | ✓ | ✓ | ✗ | ✗ | по роли |
| see.margin (маржа, differenzUstAmount €, прибыль компаний, стоимость склада по закупке) | ✓ | ✓ | ✗ | ✗ | по роли |
| see.minPrice (Mindestverkaufspreis) | ✓ | ✓ | ✓ | ✗ | по роли |
| see.salePrice (Verkaufspreis) | ✓ | ✓ | ✓ | ✗* | по роли |
| see.taxScheme (НАЗВАНИЕ режима, без суммы USt) | ✓ | ✓ | ✓ | ✗ | по роли |
| see.tech (VIN, пробег, Pickerl, Serviceheft, покрасы, диагностика, тех.фото) | ✓ | ✓ | ✓ | ✓ | по роли |
| see.clientFull (полные данные клиента) | ✓ | ✓ | ✓ | ✗ (огранич.) | по роли |
| **Действия** | | | | | |
| edit.carDescription (описание, комплектация, фото) | ✓ | ✓ | ✓ | ✗ | ✗ |
| edit.salePrice (не ниже minPrice) | ✓ | ✓ | ✓ | ✗ | ✗ |
| edit.minPrice | ✓ | ✓ | ✗ | ✗ | ✗ |
| sell.belowMin (продажа ниже минимума) | ✓ | ✓ | ✗ (нужен override PARTNER) | ✗ | ✗ |
| reserve (бронь + Anzahlung) | ✓ | ✓ | ✓ | ✗ | ✗ |
| sell (оформить продажу, Kaufvertrag, выдача, статус SOLD) | ✓ | ✓ | ✓ | ✗ | ✗ |
| edit.tech (диагностика, Pickerl, Serviceheft, покрасы, §57a) | ✓ | ✓† | ✗ | ✓ | ✗ |
| createKostenvoranschlag (смета ремонта — статус «на подтверждении») | ✓ | ✓ | ✗ | ✓ | ✗ |
| approveExpense (подтвердить смету AutoHub → расход) | ✓ | ✓ | ✗ | ✗ | ✗ |
| status.techFlow (IN_PREPARATION, IN_SERVICE, WAITING_FOR_PHOTOS, READY_FOR_SALE) | ✓ | ✓ | частично‡ | ✓ | ✗ |
| changeOwner (currentOwner) | ✓ | ✓ | ✗ | ✗ | ✗ |
| changeTaxScheme | ✓ | ✓ | ✗ | ✗ | ✗ |
| decideGewaehrleistung | ✓ | ✓ | ✗ | ✗ | ✗ |
| manageUsers / roles / security | ✓ | ✗ | ✗ | ✗ | ✗ |
| delete / restoreHistory | ✓ | ✗ | ✗ | ✗ | ✗ |

\* TECHNICAL не видит цены продажи и Mindestverkaufspreis — только техчасть.
† PARTNER технически может редактировать техчасть? По спецификации техчасть ведёт TECHNICAL; PARTNER — согласования. **Открытый вопрос** — уточнить, может ли чистый PARTNER править диагностику. Пока: edit.tech = TECHNICAL/ADMIN.
‡ SALES может ставить WAITING_FOR_PHOTOS и, после загрузки фото, READY_FOR_SALE (функция фотографа).

## Ключевые правила

1. **Скрытие — на сервере, не в UI.** SALES/TECHNICAL не получают запрещённые поля ни в HTML, ни через какой-либо серверный вызов. Единая точка — `redact(entity, viewer)` перед рендером + `can()` в каждом Server Action.
2. **Kostenvoranschlag → approval.** Смета TECHNICAL создаётся как PENDING и НЕ входит в маржу/расходы, пока PARTNER не подтвердит (APPROVED). finance.ts считает только подтверждённые расходы.
3. **Продажа ниже Mindestverkaufspreis** блокируется для SALES; требует override роли PARTNER с комментарием и записью в AuditLog.
4. **READ_ONLY** — только чтение (в рамках видимости своих ролей, если совмещена; сама по себе — базовый просмотр без правок).
