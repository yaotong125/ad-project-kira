"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CLASSIFICATION_CODES } from "@/features/invoices/copy-data";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Input, Select } from "@/shared/ui/form-controls";
import {
  changeFiscalYearEndAction,
  removeOrgAssetAction,
  updateProfileAction,
  uploadOrgAssetAction,
  type ProfilePayload,
} from "./actions";
import { ENTITY_TYPE_LABELS, MY_STATES, type OrgProfile } from "./constants";
import { SettingsHeader } from "./settings-header";


const TEXTAREA =
  "w-full resize-y rounded-[var(--radius)] border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-muted disabled:opacity-50 focus:border-ink focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ink)_10%,transparent)]";

function AssetUpload({
  orgSlug,
  kind,
  label,
  emptyLabel,
  uploadLabel,
  hint,
  initialUrl,
  boxClass,
  disabled,
}: {
  orgSlug: string;
  kind: "logo" | "payment_qr";
  label: string;
  emptyLabel: string;
  uploadLabel: string;
  hint: string;
  initialUrl: string | null;
  boxClass: string;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("orgSlug", orgSlug);
    fd.set("kind", kind);
    fd.set("file", file);
    start(async () => {
      const r = await uploadOrgAssetAction(fd);
      if (r.ok) setUrl(r.url);
      else setError(r.error);
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <div className="flex items-center gap-4">
        {url ? (
          <div className={cn("relative overflow-hidden rounded border border-border bg-surface", boxClass)}>
            <Image src={url} alt={label} fill unoptimized className="object-contain p-1" />
          </div>
        ) : (
          <span
            className={cn(
              "flex items-center justify-center rounded border border-dashed border-border text-center text-[11.5px] text-muted",
              boxClass,
            )}
          >
            {emptyLabel}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            disabled={disabled || pending}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || pending}
            aria-busy={pending}
            onClick={() => inputRef.current?.click()}
          >
            {pending ? "Uploading…" : uploadLabel}
          </Button>
          {url && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                start(async () => {
                  const r = await removeOrgAssetAction(orgSlug, kind);
                  if (r.ok) setUrl(null);
                  else setError(r.error);
                });
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="m-0 text-[11.5px] text-muted">{hint}</p>
      {error && (
        <p role="alert" className="m-0 text-[12px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

export function SettingsProfileClient({
  profile,
  isOwner,
}: {
  profile: OrgProfile;
  isOwner: boolean;
}) {
  const router = useRouter();
  const base = `/${profile.slug}`;

  const [form, setForm] = useState<ProfilePayload>({
    legalName: profile.legalName,
    ssmNumber: profile.ssmNumber,
    sstNumber: profile.sstNumber,
    registrationType: profile.registrationType === "BRN" ? "" : profile.registrationType,
    tin: profile.tin,
    address: profile.address,
    postcode: profile.postcode,
    city: profile.city,
    state: profile.state,
    defaultPricingMode: profile.defaultPricingMode,
    phone: profile.phone,
    msicCode: profile.msicCode,
    businessActivityDescription: profile.businessActivityDescription,
    defaultClassificationCode: profile.defaultClassificationCode,
    myinvoisMandateEffectiveOn: profile.myinvoisMandateEffectiveOn,
    bankName: profile.bankName,
    bankAccountName: profile.bankAccountName,
    bankAccountNumber: profile.bankAccountNumber,
    duitnowId: profile.duitnowId,
    paymentNote: profile.paymentNote,
  });

  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [fyeEnd, setFyeEnd] = useState(profile.fiscalYearEnd);
  const [fyeStart, setFyeStart] = useState(profile.firstYearStart);
  const [fyePending, startFye] = useTransition();
  const [fyeError, setFyeError] = useState<string | null>(null);
  const [fyeSaved, setFyeSaved] = useState(false);

  const set = <K extends keyof ProfilePayload>(key: K, value: ProfilePayload[K]) => {
    setSaved(false);
    setSaveError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader base={base} legalName={profile.legalName} sub="Workspace" active="profile" />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="m-0 text-[13.5px] font-semibold text-ink">Entity profile</h2>
          <p className="m-0 mt-1 max-w-prose text-[12.5px] text-muted">
            Owner-only. The LHDN TIN is your tax identification number. The SST registration number, if present, drives
            SST-02 return generation. SSM is the Companies Commission of Malaysia identifier used on MBRS filings.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-col gap-6">
            <AssetUpload
              orgSlug={profile.slug}
              kind="logo"
              label="Invoice logo"
              emptyLabel="No logo"
              uploadLabel="Upload logo…"
              hint="PNG or JPEG, up to 2 MB. Shown on invoice PDFs."
              initialUrl={profile.logoUrl}
              boxClass="h-14 w-[140px]"
              disabled={!isOwner}
            />

            <AssetUpload
              orgSlug={profile.slug}
              kind="payment_qr"
              label="Payment QR"
              emptyLabel="No QR"
              uploadLabel="Upload QR…"
              hint="DuitNow, TNG or your bank's QR. PNG or JPEG, up to 2 MB. Shown on quick-invoice PDFs under Payment details."
              initialUrl={profile.paymentQrUrl}
              boxClass="h-20 w-20"
              disabled={!isOwner}
            />

            <form
              className="flex flex-col gap-4 border-t border-border pt-5"
              onSubmit={(e) => {
                e.preventDefault();
                setSaveError(null);
                setSaved(false);
                startSave(async () => {
                  const r = await updateProfileAction(profile.slug, form);
                  if (r.ok) {
                    setSaved(true);
                    router.refresh();
                  } else {
                    setSaveError(r.error);
                  }
                });
              }}
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor="legalName" className="text-[13px] font-medium text-ink-2">
                  Legal name<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                </label>
                <Input
                  id="legalName"
                  name="legalName"
                  required
                  disabled={!isOwner || saving}
                  value={form.legalName}
                  onChange={(e) => set("legalName", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ssmNumber" className="text-[13px] font-medium text-ink-2">
                    SSM number
                  </label>
                  <Input
                    id="ssmNumber"
                    name="ssmNumber"
                    placeholder="e.g. 202401012345"
                    disabled={!isOwner || saving}
                    value={form.ssmNumber}
                    onChange={(e) => set("ssmNumber", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="sstNumber" className="text-[13px] font-medium text-ink-2">
                    SST number
                  </label>
                  <Input
                    id="sstNumber"
                    name="sstNumber"
                    placeholder="W10-1234-12345678"
                    disabled={!isOwner || saving}
                    value={form.sstNumber}
                    onChange={(e) => set("sstNumber", e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="registrationType" className="text-[13px] font-medium text-ink-2">
                  Registration type
                </label>
                <Select
                  id="registrationType"
                  name="registrationType"
                  aria-describedby="registrationType-message"
                  disabled={!isOwner || saving}
                  value={form.registrationType}
                  onChange={(e) => set("registrationType", e.target.value)}
                >
                  <option value="">Business (SSM / BRN)</option>
                  <option value="NRIC">Individual, NRIC (MyKad)</option>
                  <option value="PASSPORT">Individual, Passport</option>
                  <option value="ARMY">Individual, Army</option>
                </Select>
                <p id="registrationType-message" className="m-0 text-[13px] text-muted">
                  What the SSM number above is, for e-Invoicing. Leave as a business (SSM/BRN) unless you invoice as an
                  individual or sole-proprietor, then choose NRIC and enter your MyKad (12 digits) as the SSM number. If
                  you have no SSM registration at all, LHDN does not allow submitting through an intermediary, so Kira
                  cannot e-invoice for you.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="tin" className="text-[13px] font-medium text-ink-2">
                  LHDN TIN
                </label>
                <Input
                  id="tin"
                  name="tin"
                  placeholder="C1234567890"
                  aria-describedby="tin-message"
                  disabled={!isOwner || saving}
                  value={form.tin}
                  onChange={(e) => set("tin", e.target.value)}
                />
                <p id="tin-message" className="m-0 text-[13px] text-muted">
                  Your LHDN tax identification number.
                </p>
              </div>

              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <span className="text-[13px] font-medium text-ink-2">Business address (shown on invoices)</span>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="address" className="text-[13px] font-medium text-ink-2">
                    Address
                  </label>
                  <textarea
                    id="address"
                    name="address"
                    rows={2}
                    maxLength={500}
                    placeholder="optional"
                    className={TEXTAREA}
                    disabled={!isOwner || saving}
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="postcode" className="text-[13px] font-medium text-ink-2">
                      Postcode
                    </label>
                    <Input
                      id="postcode"
                      name="postcode"
                      placeholder="optional"
                      disabled={!isOwner || saving}
                      value={form.postcode}
                      onChange={(e) => set("postcode", e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="city" className="text-[13px] font-medium text-ink-2">
                      City
                    </label>
                    <Input
                      id="city"
                      name="city"
                      placeholder="optional"
                      aria-describedby="city-message"
                      disabled={!isOwner || saving}
                      value={form.city}
                      onChange={(e) => set("city", e.target.value)}
                    />
                    <p id="city-message" className="m-0 text-[13px] text-muted">
                      LHDN requires a city for e-Invoicing.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="state" className="text-[13px] font-medium text-ink-2">
                      State
                    </label>
                    <Select
                      id="state"
                      name="state"
                      disabled={!isOwner || saving}
                      value={form.state}
                      onChange={(e) => set("state", e.target.value)}
                    >
                      <option value="">Select state</option>
                      {MY_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="defaultPricingMode" className="text-[13px] font-medium text-ink-2">
                  Default pricing
                </label>
                <Select
                  id="defaultPricingMode"
                  name="defaultPricingMode"
                  aria-describedby="defaultPricingMode-message"
                  disabled={!isOwner || saving}
                  value={form.defaultPricingMode}
                  onChange={(e) => set("defaultPricingMode", e.target.value as "exclusive" | "inclusive")}
                >
                  <option value="exclusive">Exclude SST</option>
                  <option value="inclusive">Include SST</option>
                </Select>
                <p id="defaultPricingMode-message" className="m-0 text-[13px] text-muted">
                  New sales invoices start with this setting. You can change it on each invoice before you record it.
                  Other documents use exclusive prices for now.
                </p>
              </div>

              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <span className="text-[13px] font-medium text-ink-2">e-Invoice (MyInvois)</span>
                <p className="m-0 text-[11.5px] text-muted">
                  Required by LHDN before you can e-invoice. All optional here: set them when you are ready to
                  e-invoice.
                </p>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="phone" className="text-[13px] font-medium text-ink-2">
                    Phone number
                  </label>
                  <Input
                    id="phone"
                    name="phone"
                    placeholder="+60312345678"
                    aria-describedby="phone-message"
                    disabled={!isOwner || saving}
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                  <p id="phone-message" className="m-0 text-[13px] text-muted">
                    LHDN requires a contact number for e-invoicing (8-20 digits, optional leading +).
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="msicCode" className="text-[13px] font-medium text-ink-2">
                      MSIC code
                    </label>
                    <Input
                      id="msicCode"
                      name="msicCode"
                      placeholder="62010"
                      aria-describedby="msicCode-message"
                      disabled={!isOwner || saving}
                      value={form.msicCode}
                      onChange={(e) => set("msicCode", e.target.value)}
                    />
                    <p id="msicCode-message" className="m-0 text-[13px] text-muted">
                      5-digit Malaysia Standard Industrial Classification code.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="businessActivityDescription" className="text-[13px] font-medium text-ink-2">
                      Business activity
                    </label>
                    <Input
                      id="businessActivityDescription"
                      name="businessActivityDescription"
                      placeholder="e.g. Computer programming activities"
                      disabled={!isOwner || saving}
                      value={form.businessActivityDescription}
                      onChange={(e) => set("businessActivityDescription", e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="defaultClassificationCode" className="text-[13px] font-medium text-ink-2">
                    Default classification code
                  </label>
                  <Select
                    id="defaultClassificationCode"
                    name="defaultClassificationCode"
                    aria-describedby="defaultClassificationCode-message"
                    disabled={!isOwner || saving}
                    value={form.defaultClassificationCode}
                    onChange={(e) => set("defaultClassificationCode", e.target.value)}
                  >
                    <option value="">Select classification code</option>
                    {CLASSIFICATION_CODES.map(([code, desc]) => (
                      <option key={code} value={code}>
                        {code} · {desc}
                      </option>
                    ))}
                  </Select>
                  <p id="defaultClassificationCode-message" className="m-0 text-[13px] text-muted">
                    Applied to every invoice line unless overridden on that line.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="myinvoisMandateEffectiveOn" className="text-[13px] font-medium text-ink-2">
                    e-Invoice mandate start
                  </label>
                  <Input
                    id="myinvoisMandateEffectiveOn"
                    name="myinvoisMandateEffectiveOn"
                    type="date"
                    min="2024-08-01"
                    aria-describedby="myinvoisMandateEffectiveOn-message"
                    disabled={!isOwner || saving}
                    value={form.myinvoisMandateEffectiveOn}
                    onChange={(e) => set("myinvoisMandateEffectiveOn", e.target.value)}
                  />
                  <p id="myinvoisMandateEffectiveOn-message" className="m-0 text-[13px] text-muted">
                    The date your business had to start issuing e-Invoices. Used only by the monthly compliance check,
                    which stays off until you set it.
                  </p>
                </div>
                <div className="text-[11.5px] text-muted">
                  <p className="m-0 mb-1">LHDN phased this in by annual turnover:</p>
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                    <li>More than RM100 million · 2024-08-01</li>
                    <li>RM25 million to RM100 million · 2025-01-01</li>
                    <li>RM5 million to RM25 million · 2025-07-01</li>
                    <li>RM3 million to RM5 million in YA2022 · 2026-01-01</li>
                    <li>
                      Under RM3 million in YA2022 but not exempt, or first reached RM3 million in YA2023 to YA2025 ·
                      2026-07-01
                    </li>
                  </ul>
                  <p className="m-0 mt-1">Check which phase applies to you if you are unsure. We do not set this for you.</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <span className="text-[13px] font-medium text-ink-2">Payment details (shown on invoices)</span>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="bankName" className="text-[13px] font-medium text-ink-2">
                      Bank
                    </label>
                    <Input
                      id="bankName"
                      name="bankName"
                      placeholder="Maybank"
                      disabled={!isOwner || saving}
                      value={form.bankName}
                      onChange={(e) => set("bankName", e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="bankAccountName" className="text-[13px] font-medium text-ink-2">
                      Account name
                    </label>
                    <Input
                      id="bankAccountName"
                      name="bankAccountName"
                      disabled={!isOwner || saving}
                      value={form.bankAccountName}
                      onChange={(e) => set("bankAccountName", e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="bankAccountNumber" className="text-[13px] font-medium text-ink-2">
                      Account number
                    </label>
                    <Input
                      id="bankAccountNumber"
                      name="bankAccountNumber"
                      disabled={!isOwner || saving}
                      value={form.bankAccountNumber}
                      onChange={(e) => set("bankAccountNumber", e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="duitnowId" className="text-[13px] font-medium text-ink-2">
                      DuitNow ID
                    </label>
                    <Input
                      id="duitnowId"
                      name="duitnowId"
                      aria-describedby="duitnowId-message"
                      disabled={!isOwner || saving}
                      value={form.duitnowId}
                      onChange={(e) => set("duitnowId", e.target.value)}
                    />
                    <p id="duitnowId-message" className="m-0 text-[13px] text-muted">
                      Optional.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="paymentNote" className="text-[13px] font-medium text-ink-2">
                    Payment note
                  </label>
                  <Input
                    id="paymentNote"
                    name="paymentNote"
                    placeholder="Please quote the invoice number on your transfer."
                    aria-describedby="paymentNote-message"
                    disabled={!isOwner || saving}
                    value={form.paymentNote}
                    onChange={(e) => set("paymentNote", e.target.value)}
                  />
                  <p id="paymentNote-message" className="m-0 text-[13px] text-muted">
                    Optional line under the bank details.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-[13px] text-muted">Owner-only. Changes apply immediately.</span>
                  {saved && (
                    <span role="status" className="text-[13px] font-medium text-positive">
                      Profile saved.
                    </span>
                  )}
                  {saveError && (
                    <span role="alert" className="text-[13px] text-negative">
                      {saveError}
                    </span>
                  )}
                </div>
                <Button type="submit" size="sm" disabled={!isOwner || saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-[13.5px] font-semibold text-ink">Fixed at bootstrap</h2>
        <div className="rounded-lg border border-border bg-surface p-5">
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-8 gap-y-2.5 text-[12.5px]">
            <dt className="text-muted">Slug</dt>
            <dd className="num m-0 text-ink">{profile.slug}</dd>
            <dt className="text-muted">Business type</dt>
            <dd className="m-0 text-ink">{ENTITY_TYPE_LABELS[profile.entityType] ?? profile.entityType}</dd>
            <dt className="text-muted">Fiscal year-end</dt>
            <dd className="num m-0 text-ink">{profile.fiscalYearEnd}</dd>
            <dt className="text-muted">Accounting standard</dt>
            <dd className="m-0 text-ink">MPERS</dd>
          </dl>
          <p className="m-0 mt-3 border-t border-border pt-3 text-[11.5px] text-muted">
            Slug, business type, and standard are set at bootstrap and cannot be changed in v1.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-[13.5px] font-semibold text-ink">Fiscal year-end</h2>
        <div className="rounded-lg border border-border bg-surface p-5">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setFyeError(null);
              setFyeSaved(false);
              startFye(async () => {
                const r = await changeFiscalYearEndAction(profile.slug, fyeEnd, fyeStart);
                if (r.ok) {
                  setFyeSaved(true);
                  router.refresh();
                } else {
                  setFyeError(r.error);
                }
              });
            }}
          >
            <p className="m-0 text-[12.5px] text-muted">
              Correct a fiscal year-end entered wrongly at setup. This regenerates your accounting periods, so it is
              only allowed before any transaction is posted and while no period is closed.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fye-new" className="text-[13px] font-medium text-ink-2">
                  New fiscal year-end<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                </label>
                <Input
                  id="fye-new"
                  name="fiscalYearEnd"
                  type="date"
                  required
                  disabled={!isOwner || fyePending}
                  value={fyeEnd}
                  onChange={(e) => {
                    setFyeSaved(false);
                    setFyeEnd(e.target.value);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fye-start" className="text-[13px] font-medium text-ink-2">
                  Commencement date
                </label>
                <Input
                  id="fye-start"
                  name="fiscalYearStart"
                  type="date"
                  aria-describedby="fye-start-message"
                  disabled={!isOwner || fyePending}
                  value={fyeStart}
                  onChange={(e) => {
                    setFyeSaved(false);
                    setFyeStart(e.target.value);
                  }}
                />
                <p id="fye-start-message" className="m-0 text-[13px] text-muted">
                  Optional — for a long first year (up to 18 months). Leave blank for a normal 12-month year.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={!isOwner || fyePending}>
                {fyePending ? "Updating…" : "Change fiscal year-end"}
              </Button>
              {!profile.canChangeFye && (
                <span className="text-[12px] text-muted">
                  Locked because transactions have been posted or a period is closed.
                </span>
              )}
              {fyeSaved && (
                <span role="status" className="text-[12.5px] font-medium text-positive">
                  Fiscal year-end updated and periods regenerated.
                </span>
              )}
              {fyeError && (
                <span role="alert" className="text-[12.5px] text-negative">
                  {fyeError}
                </span>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
