"use client";

import { useState } from "react";
import { PURCHASE_CHANNEL, PURCHASE_CHANNEL_ORDER, IMPORT_ZONE, SURCHARGE_BY } from "@/lib/format";

// Условные поля закупки по каналу (§11). Клиентский компонент — ради показа блока
// нужного канала; поля submit'ятся в родительскую server-форму, лишние зануляются
// на сервере (channelDataFromForm). Финансовая часть (Einkaufspreis, §24, план/мин.
// цена) — в секции «Налоги и закупка» выше; здесь — специфика канала.
export type ChannelDefaults = {
  purchaseChannel: string;
  // Auktion
  auctionVehiclePrice: string;
  auctionFeeNet: string;
  auctionFeeVat: string;
  auctionTransportCost: string;
  auctionOtherFees: string;
  auctionInvoiceTotal: string;
  auctionInvoiceNumber: string;
  auctionSupplier: string;
  auctionCountry: string;
  // Händler
  haendlerSupplier: string;
  haendlerInvoiceNumber: string;
  haendlerInvoiceDate: string;
  haendlerPurchaseNet: string;
  haendlerPurchaseVat: string;
  haendlerPurchaseGross: string;
  haendlerVorsteuerAusgewiesen: boolean;
  // Inzahlungnahme
  tradeInEstimatedValue: string;
  tradeInCreditValue: string;
  tradeInSurcharge: string;
  tradeInSurchargeBy: string;
  // Import
  importCountry: string;
  importZone: string;
  importCurrency: string;
  importExchangeRate: string;
  importInvoiceAmount: string;
  importTransportCost: string;
  importZoll: string;
  importEust: string;
  importNova: string;
  importOtherCosts: string;
};

const money = { type: "number", step: "0.01", min: 0 } as const;

export function CarChannelFields({ defaults }: { defaults: ChannelDefaults }) {
  const [channel, setChannel] = useState(defaults.purchaseChannel || "");
  const d = defaults;

  return (
    <>
      <div>
        <label className="label" htmlFor="purchaseChannel">Канал закупки</label>
        <select
          id="purchaseChannel"
          name="purchaseChannel"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="field"
        >
          <option value="">—</option>
          {PURCHASE_CHANNEL_ORDER.map((k) => (<option key={k} value={k}>{PURCHASE_CHANNEL[k]}</option>))}
        </select>
      </div>

      {channel === "PRIVAT" && (
        <div className="col-span-4 rounded-xl border border-line bg-surface-2 p-4 text-[13px] text-muted">
          <b className="text-ink">Privat.</b> Einkaufspreis, §24, плановая и мин. цена — в полях выше.
          Kaufvertrag и продавец-клиент — в документах и (фаза 3e) в продаже.
          Default taxScheme: Differenzbesteuerung.
        </div>
      )}

      {channel === "AUKTION" && (
        <div className="col-span-4 rounded-xl border border-line bg-surface-2 p-4">
          <h3 className="mb-1 text-[14px] font-bold">Auktion (§11.2)</h3>
          <p className="mb-4 text-[12px] text-muted">
            Базой приобретения служит Auktionsrechnung gesamt; Einkaufspreis §24 (поле выше) по
            умолчанию = Fahrzeugpreis. Комиссии уже входят в gesamt — не добавляйте их ещё и
            отдельным расходом (двойной учёт).
          </p>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="label" htmlFor="auctionVehiclePrice">Fahrzeugpreis €</label>
              <input id="auctionVehiclePrice" name="auctionVehiclePrice" {...money} defaultValue={d.auctionVehiclePrice} className="field mono" placeholder="10000" />
            </div>
            <div>
              <label className="label" htmlFor="auctionFeeNet">Auktionsgebühr netto €</label>
              <input id="auctionFeeNet" name="auctionFeeNet" {...money} defaultValue={d.auctionFeeNet} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="auctionFeeVat">USt на комиссию €</label>
              <input id="auctionFeeVat" name="auctionFeeVat" {...money} defaultValue={d.auctionFeeVat} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="auctionInvoiceTotal">Auktionsrechnung gesamt €</label>
              <input id="auctionInvoiceTotal" name="auctionInvoiceTotal" {...money} defaultValue={d.auctionInvoiceTotal} className="field mono" placeholder="10800" />
            </div>
            <div>
              <label className="label" htmlFor="auctionTransportCost">Transportkosten €</label>
              <input id="auctionTransportCost" name="auctionTransportCost" {...money} defaultValue={d.auctionTransportCost} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="auctionOtherFees">Sonstige Gebühren €</label>
              <input id="auctionOtherFees" name="auctionOtherFees" {...money} defaultValue={d.auctionOtherFees} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="auctionInvoiceNumber">№ счёта</label>
              <input id="auctionInvoiceNumber" name="auctionInvoiceNumber" defaultValue={d.auctionInvoiceNumber} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="auctionSupplier">Поставщик</label>
              <input id="auctionSupplier" name="auctionSupplier" defaultValue={d.auctionSupplier} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="auctionCountry">Страна</label>
              <input id="auctionCountry" name="auctionCountry" defaultValue={d.auctionCountry} className="field" placeholder="AT / DE …" />
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-line bg-surface p-3">
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" name="auctionOverride" value="1" className="mt-0.5" />
              <span className="text-muted">Разрешить сохранение, если Auktionsrechnung gesamt меньше Fahrzeugpreis (admin override — нужна причина).</span>
            </label>
            <input name="auctionOverrideReason" className="field mt-2" placeholder="Причина override (если ставите галочку)" />
          </div>
        </div>
      )}

      {channel === "HAENDLER" && (
        <div className="col-span-4 rounded-xl border border-line bg-surface-2 p-4">
          <h3 className="mb-4 text-[14px] font-bold">Händler (§11.3)</h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="label" htmlFor="haendlerSupplier">Поставщик</label>
              <input id="haendlerSupplier" name="haendlerSupplier" defaultValue={d.haendlerSupplier} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="haendlerInvoiceNumber">№ счёта</label>
              <input id="haendlerInvoiceNumber" name="haendlerInvoiceNumber" defaultValue={d.haendlerInvoiceNumber} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="haendlerInvoiceDate">Дата счёта</label>
              <input id="haendlerInvoiceDate" name="haendlerInvoiceDate" type="date" defaultValue={d.haendlerInvoiceDate} className="field" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="haendlerVorsteuerAusgewiesen" value="1" defaultChecked={d.haendlerVorsteuerAusgewiesen} />
                <span>Vorsteuer выделена</span>
              </label>
            </div>
            <div>
              <label className="label" htmlFor="haendlerPurchaseNet">Purchase netto €</label>
              <input id="haendlerPurchaseNet" name="haendlerPurchaseNet" {...money} defaultValue={d.haendlerPurchaseNet} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="haendlerPurchaseVat">Purchase USt €</label>
              <input id="haendlerPurchaseVat" name="haendlerPurchaseVat" {...money} defaultValue={d.haendlerPurchaseVat} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="haendlerPurchaseGross">Purchase brutto €</label>
              <input id="haendlerPurchaseGross" name="haendlerPurchaseGross" {...money} defaultValue={d.haendlerPurchaseGross} className="field mono" />
            </div>
          </div>
          <p className="mt-3 text-[12px] text-muted">Einkaufspreis §24 (если Differenzbesteuerung) — поле выше.</p>
        </div>
      )}

      {channel === "INZAHLUNGNAHME" && (
        <div className="col-span-4 rounded-xl border border-line bg-surface-2 p-4">
          <h3 className="mb-4 text-[14px] font-bold">Inzahlungnahme / трейд-ин (§11.4)</h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="label" htmlFor="tradeInEstimatedValue">Оценочная стоимость €</label>
              <input id="tradeInEstimatedValue" name="tradeInEstimatedValue" {...money} defaultValue={d.tradeInEstimatedValue} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="tradeInCreditValue">Зачётная стоимость €</label>
              <input id="tradeInCreditValue" name="tradeInCreditValue" {...money} defaultValue={d.tradeInCreditValue} className="field mono" placeholder="база приобретения" />
            </div>
            <div>
              <label className="label" htmlFor="tradeInSurcharge">Доплата €</label>
              <input id="tradeInSurcharge" name="tradeInSurcharge" {...money} defaultValue={d.tradeInSurcharge} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="tradeInSurchargeBy">Кто доплачивает</label>
              <select id="tradeInSurchargeBy" name="tradeInSurchargeBy" defaultValue={d.tradeInSurchargeBy} className="field">
                <option value="">—</option>
                {Object.entries(SURCHARGE_BY).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-muted">Клиент и связанная продажа другого авто — в фазе 3e (Sale).</p>
        </div>
      )}

      {channel === "IMPORT" && (
        <div className="col-span-4 rounded-xl border border-line bg-surface-2 p-4">
          <h3 className="mb-1 text-[14px] font-bold">Import (§11.5)</h3>
          <p className="mb-4 text-[12px] text-muted">
            Применимость Differenzbesteuerung к импорту автоматически НЕ решается — при нехватке
            данных ставьте taxScheme = «Не определён» (UNGEKLAERT). Валюта/курс — справочно, база в EUR.
          </p>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="label" htmlFor="importCountry">Страна</label>
              <input id="importCountry" name="importCountry" defaultValue={d.importCountry} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="importZone">Зона</label>
              <select id="importZone" name="importZone" defaultValue={d.importZone} className="field">
                <option value="">—</option>
                {Object.entries(IMPORT_ZONE).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="importCurrency">Валюта счёта</label>
              <input id="importCurrency" name="importCurrency" defaultValue={d.importCurrency} className="field mono uppercase" placeholder="EUR" />
            </div>
            <div>
              <label className="label" htmlFor="importExchangeRate">Курс к EUR</label>
              <input id="importExchangeRate" name="importExchangeRate" type="number" step="0.000001" min={0} defaultValue={d.importExchangeRate} className="field mono" placeholder="1.0" />
            </div>
            <div>
              <label className="label" htmlFor="importInvoiceAmount">Сумма счёта (валюта)</label>
              <input id="importInvoiceAmount" name="importInvoiceAmount" {...money} defaultValue={d.importInvoiceAmount} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="importTransportCost">Транспорт €</label>
              <input id="importTransportCost" name="importTransportCost" {...money} defaultValue={d.importTransportCost} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="importZoll">Zoll €</label>
              <input id="importZoll" name="importZoll" {...money} defaultValue={d.importZoll} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="importEust">Einfuhrumsatzsteuer €</label>
              <input id="importEust" name="importEust" {...money} defaultValue={d.importEust} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="importNova">NoVA €</label>
              <input id="importNova" name="importNova" {...money} defaultValue={d.importNova} className="field mono" />
            </div>
            <div>
              <label className="label" htmlFor="importOtherCosts">Прочие расходы €</label>
              <input id="importOtherCosts" name="importOtherCosts" {...money} defaultValue={d.importOtherCosts} className="field mono" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
