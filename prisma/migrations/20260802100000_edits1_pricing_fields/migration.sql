-- Правки-1 Э2 (batch-1-plan.md): поля новой модели ценообразования.
-- fictitiousMarkup — фиктивная наценка партнёрских владельцев (В9);
-- plannedSalePriceNet — план-НЕТТО для Regelbesteuerung (В10);
-- year → nullable (В5: главная дата — erstzulassung, год легаси).

-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "fictitiousMarkup" DECIMAL(12,2),
ADD COLUMN     "plannedSalePriceNet" DECIMAL(12,2),
ALTER COLUMN "year" DROP NOT NULL;

-- Данные (В11): «Не определён» удалён из UI — существующие переводим в Differenz.
UPDATE "Car" SET "taxScheme" = 'DIFFERENZBESTEUERUNG' WHERE "taxScheme" = 'UNGEKLAERT';
