"use client";

import Link from "next/link";
import { useState } from "react";
import {
  EXPENSE_CATEGORY,
  EXPENSE_CATEGORY_ORDER,
  EXPENSE_PAYMENT_STATUS,
  PAYMENT_METHOD,
  CURRENT_OWNER,
} from "@/lib/format";

// Расход §14.1. Клиентский компонент — для живого расчёта net/USt из gross+ставки
// (§14.1) и показа поля «Оплачено» только для частичной оплаты.
export type ExpenseDefaults = {
  title: string;
  category: string;
  amountGross: string;
  vatRate: string;
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  paymentDate: string;
  paymentMethod: string;
  paymentStatus: string;
  paidAmount: string;
  ownerCompany: string;
  responsibleUserId: string;
  carId: string;
  comment: string;
  alreadyIncludedInAcquisitionCost: boolean;
};

const eur = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });

export function ExpenseForm({
  defaults,
  action,
  submitLabel,
  cars,
  users,
  warrantyCaseId,
}: {
  defaults: ExpenseDefaults;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  cars: { id: string; label: string }[];
  users: { id: string; name: string }[];
  warrantyCaseId?: string;
}) {
  const [gross, setGross] = useState(defaults.amountGross);
  const [rate, setRate] = useState(defaults.vatRate || "20");
  const [pay, setPay] = useState(defaults.paymentStatus || "UNPAID");

  const g = parseFloat(gross.replace(",", ".")) || 0;
  const r = parseFloat(rate) || 0;
  const vat = g * (r / (100 + r));
  const net = g - vat;

  return (
    <form action={action} className="flex flex-col gap-5">
      {warrantyCaseId && <input type="hidden" name="warrantyCaseId" value={warrantyCaseId} />}
      <section className="panel p-5">
        <h2 className="mb-4 text-[15px] font-bold">Расход</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-2">
            <label className="label" htmlFor="title">Название *</label>
            <input id="title" name="title" required defaultValue={defaults.title} className="field" placeholder="Замена тормозных колодок" />
          </div>
          <div>
            <label className="label" htmlFor="category">Категория *</label>
            <select id="category" name="category" defaultValue={defaults.category || "SONSTIGES"} className="field">
              {EXPENSE_CATEGORY_ORDER.map((k) => (<option key={k} value={k}>{EXPENSE_CATEGORY[k]}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="carId">Автомобиль</label>
            <select id="carId" name="carId" defaultValue={defaults.carId} className="field">
              <option value="">— без авто</option>
              {cars.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="amountGross">Сумма brutto * €</label>
            <input id="amountGross" name="amountGross" type="number" step="0.01" min={0} required value={gross} onChange={(e) => setGross(e.target.value)} className="field mono" placeholder="360" />
          </div>
          <div>
            <label className="label" htmlFor="vatRate">Ставка USt, %</label>
            <input id="vatRate" name="vatRate" type="number" min={0} max={99} value={rate} onChange={(e) => setRate(e.target.value)} className="field mono" />
          </div>
          <div>
            <span className="label">Netto (расчёт)</span>
            <div className="field mono flex items-center bg-surface-2 text-muted">{eur.format(net)}</div>
          </div>
          <div>
            <span className="label">USt (расчёт)</span>
            <div className="field mono flex items-center bg-surface-2 text-muted">{eur.format(vat)}</div>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="alreadyIncludedInAcquisitionCost" value="1" defaultChecked={defaults.alreadyIncludedInAcquisitionCost} />
          <span className="text-muted">Уже включён в полную стоимость приобретения (не вычитать второй раз, §12.1)</span>
        </label>
      </section>

      <section className="panel p-5">
        <h2 className="mb-4 text-[15px] font-bold">Счёт и оплата</h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="label" htmlFor="supplier">Поставщик</label>
            <input id="supplier" name="supplier" defaultValue={defaults.supplier} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="invoiceNumber">№ счёта</label>
            <input id="invoiceNumber" name="invoiceNumber" defaultValue={defaults.invoiceNumber} className="field mono" />
          </div>
          <div>
            <label className="label" htmlFor="invoiceDate">Дата счёта</label>
            <input id="invoiceDate" name="invoiceDate" type="date" defaultValue={defaults.invoiceDate} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="ownerCompany">Владелец расхода</label>
            <select id="ownerCompany" name="ownerCompany" defaultValue={defaults.ownerCompany} className="field">
              <option value="">—</option>
              {Object.entries(CURRENT_OWNER).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="paymentStatus">Статус оплаты</label>
            <select id="paymentStatus" name="paymentStatus" value={pay} onChange={(e) => setPay(e.target.value)} className="field">
              {Object.entries(EXPENSE_PAYMENT_STATUS).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
            </select>
          </div>
          {pay === "PARTIALLY_PAID" && (
            <div>
              <label className="label" htmlFor="paidAmount">Оплачено €</label>
              <input id="paidAmount" name="paidAmount" type="number" step="0.01" min={0} defaultValue={defaults.paidAmount} className="field mono" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="paymentMethod">Способ оплаты</label>
            <select id="paymentMethod" name="paymentMethod" defaultValue={defaults.paymentMethod} className="field">
              <option value="">—</option>
              {Object.entries(PAYMENT_METHOD).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="paymentDate">Дата оплаты</label>
            <input id="paymentDate" name="paymentDate" type="date" defaultValue={defaults.paymentDate} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="responsibleUserId">Ответственный</label>
            <select id="responsibleUserId" name="responsibleUserId" defaultValue={defaults.responsibleUserId} className="field">
              <option value="">—</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
          </div>
        </div>
        <textarea name="comment" rows={2} defaultValue={defaults.comment} className="field mt-4 resize-y" placeholder="Комментарий" />
      </section>

      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary">{submitLabel}</button>
        <Link href="/expenses" className="btn btn-ghost">Отмена</Link>
      </div>
    </form>
  );
}
