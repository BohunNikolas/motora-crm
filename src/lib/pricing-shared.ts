/**
 * Константы и «лёгкие» формулы ценообразования, общие для сервера и браузера.
 *
 * Модуль намеренно НЕ импортирует Prisma/Decimal: его тянет клиентский
 * компонент формы авто для live-подсказок. Точные денежные расчёты
 * (Decimal, округление half-up) остаются в finance.ts, который импортирует
 * эти же константы — чтобы автонаценка на клиенте и на сервере совпадала.
 */

/** Ставка НДС по умолчанию, % (хранение в настройке — позже). */
export const VAT_RATE_DEFAULT = 20;

// ─── Автоподбор фиктивной наценки e.U. (правки-2) ────────────────
// Процент от реальной закупки — «трейдерский интерес» между независимыми
// компаниями (Fremdvergleich); пол — чтобы на дешёвых лотах наценка не
// выглядела символической. Значение подставляется в форму и редактируется.

export const MARKUP_RATE_PCT = 5;
export const MARKUP_MIN = 250;
export const MARKUP_ROUND_STEP = 10;

/** Подпись правила под полем наценки — единый текст для формы и карточки. */
export const MARKUP_RULE_HINT = `авто: ${MARKUP_RATE_PCT}% от закупки, мин. € ${MARKUP_MIN}`;

/**
 * Автонаценка для live-подсказки в браузере (JS-числа — только для показа,
 * сервер пересчитывает через suggestedMarkup() на Decimal).
 */
export function suggestedMarkupJs(realCost: number): number {
  if (!Number.isFinite(realCost) || realCost <= 0) return MARKUP_MIN;
  const pct = (realCost * MARKUP_RATE_PCT) / 100;
  const stepped = Math.ceil(pct / MARKUP_ROUND_STEP) * MARKUP_ROUND_STEP;
  return Math.max(MARKUP_MIN, stepped);
}
