"use client";

import { useState } from "react";
import {
  CURRENT_OWNER,
  PARTNER_OWNERS,
  TAX_SCHEME,
  TAX_SCHEME_ORDER,
  INTERNAL_INVOICE_PAYMENT,
} from "@/lib/format";

// Владелец авто (§9). Для партнёрских компаний (Mriya / A Motors / AutoHub)
// раскрывается блок внутренней продажи e.U. → OG. Клиентский компонент — только
// ради условного показа блока; сами поля submit'ятся в родительскую server-форму.
export type OwnerDefaults = {
  currentOwner: string;
  partnerPurchasePrice: string;
  partnerAcquisitionCost: string;
  plannedInternalTransferPrice: string;
  actualInternalTransferPrice: string;
  internalInvoiceNumber: string;
  internalInvoiceDate: string;
  internalInvoiceTaxScheme: string;
  internalInvoicePaymentStatus: string;
};

export function CarOwnerFields({ defaults }: { defaults: OwnerDefaults }) {
  const [owner, setOwner] = useState(defaults.currentOwner || "MOTORHOF_OG");
  const isPartner = (PARTNER_OWNERS as readonly string[]).includes(owner);

  return (
    <>
      <div>
        <label className="label" htmlFor="currentOwner">Владелец</label>
        <select
          id="currentOwner"
          name="currentOwner"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="field"
        >
          {Object.entries(CURRENT_OWNER).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
        </select>
      </div>

      {isPartner && (
        <div className="col-span-4 rounded-xl border border-line bg-surface-2 p-4">
          <h3 className="mb-1 text-[14px] font-bold">Внутренняя продажа e.U. → OG (§9)</h3>
          <p className="mb-4 text-[12px] text-muted">
            Результат поставщика и результат MOTORHOF OG считаются раздельно. Фактический
            внутренний Verkaufspreis — себестоимость OG. Файл счёта (Rechnung e.U. → OG)
            загружается в карточке авто.
          </p>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="label" htmlFor="partnerPurchasePrice">Закупка поставщика €</label>
              <input id="partnerPurchasePrice" name="partnerPurchasePrice" type="number" step="0.01" min={0} defaultValue={defaults.partnerPurchasePrice} className="field mono" placeholder="10000" />
            </div>
            <div>
              <label className="label" htmlFor="partnerAcquisitionCost">Общая стоимость приобр. €</label>
              <input id="partnerAcquisitionCost" name="partnerAcquisitionCost" type="number" step="0.01" min={0} defaultValue={defaults.partnerAcquisitionCost} className="field mono" placeholder="= закупке" />
            </div>
            <div>
              <label className="label" htmlFor="plannedInternalTransferPrice">Плановый внутр. Verkaufspreis €</label>
              <input id="plannedInternalTransferPrice" name="plannedInternalTransferPrice" type="number" step="0.01" min={0} defaultValue={defaults.plannedInternalTransferPrice} className="field mono" placeholder="12000" />
            </div>
            <div>
              <label className="label" htmlFor="actualInternalTransferPrice">Фактический внутр. Verkaufspreis €</label>
              <input id="actualInternalTransferPrice" name="actualInternalTransferPrice" type="number" step="0.01" min={0} defaultValue={defaults.actualInternalTransferPrice} className="field mono" placeholder="—" />
            </div>

            <div>
              <label className="label" htmlFor="internalInvoiceNumber">№ внутр. счёта</label>
              <input id="internalInvoiceNumber" name="internalInvoiceNumber" defaultValue={defaults.internalInvoiceNumber} className="field mono" placeholder="RE-2026-001" />
            </div>
            <div>
              <label className="label" htmlFor="internalInvoiceDate">Дата внутр. счёта</label>
              <input id="internalInvoiceDate" name="internalInvoiceDate" type="date" defaultValue={defaults.internalInvoiceDate} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="internalInvoiceTaxScheme">Режим внутр. счёта</label>
              <select id="internalInvoiceTaxScheme" name="internalInvoiceTaxScheme" defaultValue={defaults.internalInvoiceTaxScheme || "DIFFERENZBESTEUERUNG"} className="field">
                {TAX_SCHEME_ORDER.map((k) => (<option key={k} value={k}>{TAX_SCHEME[k]}</option>))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="internalInvoicePaymentStatus">Оплата внутр. счёта</label>
              <select id="internalInvoicePaymentStatus" name="internalInvoicePaymentStatus" defaultValue={defaults.internalInvoicePaymentStatus || "OPEN"} className="field">
                {Object.entries(INTERNAL_INVOICE_PAYMENT).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
