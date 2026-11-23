"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import type { Lang } from "@/shared/i18n";
import { Button, buttonClass } from "@/shared/ui/button";
import { FormField, Input, Select } from "@/shared/ui/form-controls";
import { createContactAction, updateContactAction } from "./actions";
import { contactErrors, ct, STATES, type ContactValues } from "./copy";

const TEXTAREA =
  "w-full resize-y rounded-[var(--radius)] border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-muted disabled:opacity-50 focus:border-ink focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ink)_10%,transparent)]";

/**
 * lejar.ai's contact form (chunk 3-otq6om7hscp, observed 2026-11-22): "Add contact" on /contacts and
 * "Edit contact" on a contact's page. The card carries data-flow="contact-form" for Learn's guided flow.
 */
export function ContactForm({
  orgSlug,
  lang,
  initial,
  contactId,
  closeHref,
  readOnly = false,
}: {
  orgSlug: string;
  lang: Lang;
  initial: ContactValues;
  contactId?: string;
  closeHref?: string;
  readOnly?: boolean;
}) {
  const t = (k: Parameters<typeof ct>[1]) => ct(lang, k);
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactValues, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const editing = Boolean(contactId);

  const set = <K extends keyof ContactValues>(k: K) => (e: { target: { value: string } }) => {
    setSaved(false);
    setV((x) => ({ ...x, [k]: e.target.value as ContactValues[K] }));
  };
  const field = (k: keyof ContactValues, label: string, control: ReactElement, hint?: string, required?: boolean, className?: string) => (
    <FormField label={label} htmlFor={k} hint={hint} required={required} className={className}>
      {control}
    </FormField>
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = contactErrors(v, lang);
    setErrors(found);
    setError(null);
    if (Object.keys(found).length > 0) return;
    start(async () => {
      const r = editing ? await updateContactAction(orgSlug, contactId!, v) : await createContactAction(orgSlug, v);
      if (!r.ok) {
        setError(r.error);
        if (r.fields) setErrors(r.fields);
        return;
      }
      if (editing) {
        setSaved(true);
        router.refresh();
      } else {
        router.push(`/${orgSlug}/contacts?added=1`);
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4 outline-none">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold text-ink">
          {editing ? (readOnly ? ct(lang, "contacts.detail.viewTitle") : ct(lang, "contacts.detail.editTitle")) : t("contacts.list.addTitle")}
        </h2>
        {closeHref && (
          <Link href={closeHref} className={buttonClass("ghost", "sm")}>
            <X size={13} aria-hidden="true" />
            {t("contacts.form.cancel")}
          </Link>
        )}
      </div>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <fieldset disabled={readOnly || pending} className="contents">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {field("name", t("contacts.form.name"), <Input type="text" placeholder={t("contacts.form.namePlaceholder")} value={v.name} onChange={set("name")} />, undefined, true, "sm:col-span-2")}
            {field(
              "contactType",
              t("contacts.form.type"),
              <Select value={v.contactType} onChange={set("contactType")}>
                <option value="customer">{ct(lang, "contacts.type.customer")}</option>
                <option value="supplier">{ct(lang, "contacts.type.supplier")}</option>
                <option value="both">{t("contacts.form.typeBoth")}</option>
              </Select>,
            )}
            {field(
              "tradeClassification",
              t("contacts.form.classification"),
              <Select value={v.tradeClassification} onChange={set("tradeClassification")}>
                <option value="trade">{t("contacts.form.trade")}</option>
                <option value="non_trade">{t("contacts.form.nonTrade")}</option>
              </Select>,
              t("contacts.form.classificationHint"),
            )}
            {field(
              "taxResidency",
              t("contacts.form.taxResidency"),
              <Select value={v.taxResidency} onChange={set("taxResidency")}>
                <option value="resident">{t("contacts.form.resident")}</option>
                <option value="non_resident">{t("contacts.form.nonResident")}</option>
              </Select>,
              t("contacts.form.taxResidencyHint"),
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {field("taxIdentificationNumber", t("contacts.form.tin"), <Input type="text" placeholder={t("contacts.form.optional")} value={v.taxIdentificationNumber} onChange={set("taxIdentificationNumber")} />, t("contacts.form.tinHint"))}
            {field("email", t("contacts.form.email"), <Input type="email" placeholder={t("contacts.form.optional")} value={v.email} onChange={set("email")} />)}
            {field("phone", t("contacts.form.phone"), <Input type="text" placeholder={t("contacts.form.optional")} value={v.phone} onChange={set("phone")} />)}
          </div>
          {field("address", t("contacts.form.address"), <textarea rows={2} maxLength={500} placeholder={t("contacts.form.optional")} className={TEXTAREA} value={v.address} onChange={set("address")} />, t("contacts.form.addressHint"))}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {field("postcode", t("contacts.form.postcode"), <Input type="text" placeholder={t("contacts.form.optional")} value={v.postcode} onChange={set("postcode")} />)}
            {field(
              "state",
              t("contacts.form.state"),
              <Select value={v.state} onChange={set("state")}>
                <option value="">{t("contacts.form.selectState")}</option>
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>,
            )}
            {field("sstNumber", t("contacts.form.sst"), <Input type="text" placeholder={t("contacts.form.optional")} value={v.sstNumber} onChange={set("sstNumber")} />, t("contacts.form.sstHint"))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {field("city", t("contacts.form.city"), <Input type="text" placeholder={t("contacts.form.optional")} value={v.city} onChange={set("city")} />, t("contacts.form.cityHint"))}
            {field("registrationNumber", t("contacts.form.registrationNumber"), <Input type="text" placeholder={t("contacts.form.optional")} value={v.registrationNumber} onChange={set("registrationNumber")} />, t("contacts.form.registrationNumberHint"))}
            {field(
              "registrationType",
              t("contacts.form.registrationType"),
              <Select value={v.registrationType} onChange={set("registrationType")}>
                <option value="">{t("contacts.form.selectType")}</option>
                <option value="BRN">{t("contacts.form.reg.brn")}</option>
                <option value="NRIC">{t("contacts.form.reg.nric")}</option>
                <option value="PASSPORT">{t("contacts.form.reg.passport")}</option>
                <option value="ARMY">{t("contacts.form.reg.army")}</option>
              </Select>,
              t("contacts.form.registrationTypeHint"),
            )}
          </div>
          {field(
            "defaultPaymentTermsDays",
            t("contacts.form.terms"),
            <Input type="number" min={0} step={1} placeholder={t("contacts.form.termsPlaceholder")} value={v.defaultPaymentTermsDays} onChange={set("defaultPaymentTermsDays")} />,
            t("contacts.form.termsHint"),
          )}
        </fieldset>
        {Object.keys(errors).length > 0 && (
          <ul role="alert" className="m-0 list-disc pl-5 text-[13px] text-negative">
            {Object.values(errors).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {error && Object.keys(errors).length === 0 && (
          <p role="alert" className="text-[13px] text-negative">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="rounded border border-positive/30 bg-positive-soft px-3 py-2 text-[13px] text-positive">
            {lang === "ms" ? "Kenalan disimpan." : "Contact saved."}
          </p>
        )}
        {!readOnly && (
          <div className="flex items-center justify-end gap-3" data-flow="contact-save">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? (editing ? t("contacts.form.saving") : t("contacts.form.creating")) : editing ? t("contacts.form.saveChanges") : t("contacts.form.addContact")}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
