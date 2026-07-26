-- Фаза 4b: расширение Task до полной модели §15.1.
-- Булев `done` заменяется на `status` (5 состояний), добавляются type/priority/
-- description/completedAt/updatedAt и связи с User (ответственный, автор).
-- Существующие 10 задач сохраняются через backfill.

-- 1. Новые колонки. type/priority/status с дефолтами (совпадают со схемой),
--    updatedAt временно nullable — заполним backfill'ом, затем NOT NULL.
ALTER TABLE "Task" ADD COLUMN "type"             TEXT NOT NULL DEFAULT 'ALLGEMEIN';
ALTER TABLE "Task" ADD COLUMN "description"      TEXT;
ALTER TABLE "Task" ADD COLUMN "priority"         TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Task" ADD COLUMN "status"           TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "Task" ADD COLUMN "completedAt"      TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "updatedAt"        TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "assignedToUserId" TEXT;
ALTER TABLE "Task" ADD COLUMN "createdById"      TEXT;

-- 2. Backfill из старых данных.
--    type: задача с авто → FAHRZEUG, иначе ALLGEMEIN (§15.1).
UPDATE "Task" SET "type" = CASE WHEN "carId" IS NOT NULL THEN 'FAHRZEUG' ELSE 'ALLGEMEIN' END;
--    status/completedAt из булева done: done → DONE (завершена в момент создания), иначе OPEN.
UPDATE "Task"
   SET "status"      = CASE WHEN "done" THEN 'DONE' ELSE 'OPEN' END,
       "completedAt" = CASE WHEN "done" THEN "createdAt" ELSE NULL END;
--    updatedAt инициализируем датой создания.
UPDATE "Task" SET "updatedAt" = "createdAt";

-- 3. updatedAt обязателен после заполнения.
ALTER TABLE "Task" ALTER COLUMN "updatedAt" SET NOT NULL;

-- 4. Старый булев done больше не нужен.
ALTER TABLE "Task" DROP COLUMN "done";

-- 5. Внешние ключи на User (при удалении пользователя — задачи не удаляются, связь обнуляется).
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Индексы для частых выборок на странице задач (§15.2: статус, ответственный, срок).
CREATE INDEX "Task_status_idx"           ON "Task"("status");
CREATE INDEX "Task_assignedToUserId_idx" ON "Task"("assignedToUserId");
CREATE INDEX "Task_dueDate_idx"          ON "Task"("dueDate");
