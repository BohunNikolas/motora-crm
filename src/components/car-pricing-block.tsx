"use client";

import { useState } from "react";
import {
  CURRENT_OWNER,
  PRICING_CHANNEL_LABEL,
  PURCHASE_CHANNEL_ORDER,
  TAX_SCHEME,
  TAX_SCHEME_ORDER,
  isPartnerOwner,
} from "@/lib/format";

/**
 * Ценовой блок формы авто (правки-1, П14): владелец × канал × налоговый режим
 * определяют набор полей; финальная закупочная, аукционный сбор и НДС считаются
 * на лету для контроля ввода. Источник истины по формулам — finance.ts (сервер
 * пересчитывает всё сам, live-цифры здесь только для отображения).
 *
 * Формулы (batch-1-plan.md):
 *  - финальная закупочная: Приват/Хендлер = закупочная (+наценка у партнёров);
 *    Аукцион = цена аукциона + транспорт (+наценка);
 *  - аукционный сбор = цена аукциона − цена автомобиля;
 *  - дифф. НДС = (план − база) × 0.2; база: Аукцион — цена автомобиля, иначе финальная;
 *  - Regel: НДС = нетто × 0.2, брутто = нетто + НДС.
 */
export type PricingDefaults = {
  currentOwner: string;
  taxScheme: string;
  purchaseChannel: string;
  purchaseDate: string;
  purchasePrice: string;
  auctionInvoiceTotal: string;
  auctionVehiclePrice: string;
  auctionTransportCost: string;
  supplier: string; // auctionSupplier | haendlerSupplier — по каналу
  fictitiousMarkup: string;
  plannedSalePriceGross: string;
  plannedSalePriceNet: string;
  minimumSalePriceGross: string;
};

const eur = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const num = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function CarPricingBlock({ defaults }: { defaults: PricingDefaults }) {
  const [owner, setOwner] = useState(defaults.currentOwner || "MOTORHOF_OG");
  const [scheme, setScheme] = useState(defaults.taxScheme || "DIFFERENZBESTEUERUNG");
  const [channel, setChannel] = useState(
    PURCHASE_CHANNEL_ORDER.includes(defaults.purchaseChannel) ? defaults.purchaseChannel : "PRIVAT"
  );
  const [purchase, setPurchase] = useState(defaults.purchasePrice);
  const [aTotal, setATotal] = useState(defaults.auctionInvoiceTotal);
  const [aVehicle, setAVehicle] = useState(defaults.auctionVehiclePrice);
  const [aTransport, setATransport] = useState(defaults.auctionTransportCost);
  const [markup, setMarkup] = useState(defaults.fictitiousMarkup);
  const [planGross, setPlanGross] = useState(defaults.plannedSalePriceGross);
  const [planNet, setPlanNet] = useState(defaults.plannedSalePriceNet);

  const partner = isPartnerOwner(owner);
  const isAuction = channel === "AUKTION";
  const isRegel = scheme === "REGELBESTEUERUNG";

  // Live-расчёт (дублирует finance.ts только для показа).
  const markupN = partner ? num(markup) : 0;
  const finalPurchase = isAuction
    ? num(aTotal) + num(aTransport) + markupN
    : num(purchase) + markupN;
  const auctionFee = num(aTotal) - num(aVehicle);
  const regelVat = num(planNet) * 0.2;
  const regelGross = num(planNet) + regelVat;
  const planForVat = isRegel ? regelGross : num(planGross);
  const vatBase = isAuction ? num(aVehicle) : finalPurchase;
  const diffVat = Math.max(0, planForVat - vatBase) * 0.2;

  return (
    <section className="panel p-5">
      <h2 className="mb-1 text-[15px] font-bold">Владелец, налоги и цены</h2>
      <p className="mb-4 text-[13px] text-muted">
        Набор полей зависит от владельца, канала закупки и налогового режима. Расчётные значения
        обновляются на лету; сервер пересчитывает их заново при сохранении.
      </p>

      <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="label" htmlFor="currentOwner">Владелец *</label>
          <select id="currentOwner" name="currentOwner" required value={owner} onChange={(e) => setOwner(e.target.value)} className="field">
            {Object.entries(CURRENT_OWNER).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="taxScheme">Налоговый режим *</label>
          <select id="taxScheme" name="taxScheme" required value={scheme} onChange={(e) => setScheme(e.target.value)} className="field">
            {TAX_SCHEME_ORDER.map((k) => (<option key={k} value={k}>{TAX_SCHEME[k]}</option>))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="purchaseChannel">Канал закупки *</label>
          <select id="purchaseChannel" name="purchaseChannel" required value={channel} onChange={(e) => setChannel(e.target.value)} className="field">
            {PURCHASE_CHANNEL_ORDER.map((k) => (<option key={k} value={k}>{PRICING_CHANNEL_LABEL[k]}</option>))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="purchaseDate">Дата покупки *</label>
          <input id="purchaseDate" name="purchaseDate" type="date" required defaultValue={defaults.purchaseDate} className="field" />
        </div>

        {/* ── Закупка по каналу ── */}
        {!isAuction && (
          <div>
            <label className="label" htmlFor="purchasePrice">Закупочная цена * €</label>
            <input id="purchasePrice" name="purchasePrice" type="number" step="0.01" min={0} required value={purchase} onChange={(e) => setPurchase(e.target.value)} className="field mono" placeholder="12000" />
          </div>
        )}
        {isAuction && (
          <>
            <div>
              <label className="label" htmlFor="auctionInvoiceTotal">Цена аукциона (общая) * €</label>
              <input id="auctionInvoiceTotal" name="auctionInvoiceTotal" type="number" step="0.01" min={0} required value={aTotal} onChange={(e) => setATotal(e.target.value)} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="auctionVehiclePrice">Цена автомобиля * €</label>
              <input id="auctionVehiclePrice" name="auctionVehiclePrice" type="number" step="0.01" min={0} required value={aVehicle} onChange={(e) => setAVehicle(e.target.value)} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="auctionTransportCost">Транспортировка * €</label>
              <input id="auctionTransportCost" name="auctionTransportCost" type="number" step="0.01" min={0} required value={aTransport} onChange={(e) => setATransport(e.target.value)} className="field mono" />
            </div>
            <div>
              <span className="label">Аукционный сбор (расчёт)</span>
              <div className="field mono flex items-center bg-surface-2 text-muted">{eur.format(auctionFee)}</div>
            </div>
          </>
        )}
        {(isAuction || channel === "HAENDLER") && (
          <div>
            <label className="label" htmlFor={isAuction ? "auctionSupplier" : "haendlerSupplier"}>Поставщик *</label>
            <input
              id={isAuction ? "auctionSupplier" : "haendlerSupplier"}
              name={isAuction ? "auctionSupplier" : "haendlerSupplier"}
              required
              defaultValue={defaults.supplier}
              className="field"
              placeholder="Autobid / имя дилера"
            />
          </div>
        )}
        {partner && (
          <div>
            <label className="label" htmlFor="fictitiousMarkup">Фиктивная наценка * €</label>
            <input id="fictitiousMarkup" name="fictitiousMarkup" type="number" step="0.01" min={0} required value={markup} onChange={(e) => setMarkup(e.target.value)} className="field mono" placeholder="0" />
          </div>
        )}

        {/* ── Цены продажи ── */}
        {!isRegel ? (
          <div>
            <label className="label" htmlFor="plannedSalePriceGross">Плановая цена продажи * €</label>
            <input id="plannedSalePriceGross" name="plannedSalePriceGross" type="number" step="0.01" min={0} required value={planGross} onChange={(e) => setPlanGross(e.target.value)} className="field mono" placeholder="15500" />
          </div>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="plannedSalePriceNet">Плановая цена НЕТТО * €</label>
              <input id="plannedSalePriceNet" name="plannedSalePriceNet" type="number" step="0.01" min={0} required value={planNet} onChange={(e) => setPlanNet(e.target.value)} className="field mono" placeholder="12500" />
            </div>
            <div>
              <span className="label">НДС 20% (расчёт)</span>
              <div className="field mono flex items-center bg-surface-2 text-muted">{eur.format(regelVat)}</div>
            </div>
            <div>
              <span className="label">Цена БРУТТО (расчёт)</span>
              <div className="field mono flex items-center bg-surface-2 text-muted">{eur.format(regelGross)}</div>
            </div>
          </>
        )}
        <div>
          <label className="label" htmlFor="minimumSalePriceGross">Минимальная цена продажи * €</label>
          <input id="minimumSalePriceGross" name="minimumSalePriceGross" type="number" step="0.01" min={0} required defaultValue={defaults.minimumSalePriceGross} className="field mono" />
        </div>

        {/* ── Расчётные итоги ── */}
        <div>
          <span className="label">Финальная закупочная (расчёт)</span>
          <div className="field mono flex items-center bg-surface-2 text-muted">{eur.format(finalPurchase)}</div>
        </div>
        {!isRegel && (
          <div>
            <span className="label">Дифф. НДС (расчёт)</span>
            <div className="field mono flex items-center bg-surface-2 text-muted">{eur.format(diffVat)}</div>
          </div>
        )}
      </div>

      {/* Аукцион: gesamt < цены автомобиля — только с override и причиной (§11.2). */}
      {isAuction && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" name="auctionOverride" value="1" className="mt-0.5" />
            <span className="text-muted">Разрешить цену аукциона ниже цены автомобиля (нужна причина).</span>
          </label>
          <input name="auctionOverrideReason" className="field mt-2" placeholder="Причина override (если ставите галочку)" />
        </div>
      )}

      {/* §18.2: правка финансов уже проданного авто — только admin override с причиной. */}
      <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" name="soldOverride" value="1" className="mt-0.5" />
          <span className="text-muted">Разрешить правку финансов у уже проданного авто (admin override — нужна причина).</span>
        </label>
        <input name="soldOverrideReason" className="field mt-2" placeholder="Причина override (если ставите галочку)" />
      </div>
    </section>
  );
}
