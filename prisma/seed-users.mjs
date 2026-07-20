/**
 * Создание пользователей MOTORHOF (docs/roles-motorhof.md).
 * Запуск: node prisma/seed-users.mjs
 *
 * НАМЕРЕННО отдельно от основного сида: npm run seed перезаписывает данные,
 * а пользователи и их пароли должны переживать пере-сид.
 * Скрипт идемпотентен: существующих пользователей НЕ трогает (пароль не сбрасывает),
 * создаёт только отсутствующих.
 *
 * Email — временные заглушки .local (реальные домены заменим, когда будут).
 * Пароль временный: при первом входе система требует его сменить.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const p = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

// Читаемый временный пароль: MH-xxxx-xxxx (без похожих символов O0/l1)
function tempPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const chunk = (n) =>
    Array.from(randomBytes(n), (b) => abc[b % abc.length]).join("");
  return `MH-${chunk(4)}-${chunk(4)}`;
}

const USERS = [
  { email: "ivan@motorhof.local", name: "Иван", roles: ["ADMIN", "PARTNER", "SALES"] },
  { email: "vitalik@motorhof.local", name: "Виталик", roles: ["PARTNER", "SALES"] },
  { email: "sergey@motorhof.local", name: "Сергей", roles: ["PARTNER", "TECHNICAL"] },
  { email: "sales@motorhof.local", name: "Продавец", roles: ["SALES"] },
  { email: "autohub@motorhof.local", name: "AutoHub", roles: ["TECHNICAL"] },
];

const created = [];
for (const u of USERS) {
  const exists = await p.user.findUnique({ where: { email: u.email } });
  if (exists) {
    console.log(`  = ${u.email} уже существует — не трогаю`);
    continue;
  }
  const pw = tempPassword();
  await p.user.create({
    data: { ...u, passwordHash: hashPassword(pw), mustChangePassword: true },
  });
  created.push({ ...u, pw });
}

if (created.length) {
  console.log("\nСозданы пользователи (ВРЕМЕННЫЕ пароли — передать лично, при входе система потребует смену):\n");
  for (const u of created) {
    console.log(`  ${u.name.padEnd(10)} ${u.email.padEnd(28)} ${u.pw}   [${u.roles.join("+")}]`);
  }
} else {
  console.log("\nНовых пользователей нет.");
}
await p.$disconnect();
