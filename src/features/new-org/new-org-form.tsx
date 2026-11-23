"use client";

import { useMemo, useState, useTransition } from "react";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { FormField, Input, Select } from "@/shared/ui/form-controls";
import { UnsavedChangesGuard } from "@/shared/ui/unsaved-changes-guard";
import { createOrgAction } from "./actions";
import { t, type NewOrgKey } from "./copy";
import { CADENCE_MONTHS, defaultYearEnd, earlierYearOptions, todayInMalaysia, yearLabel } from "./fiscal";

const ENTITY: Record<string, { label: NewOrgKey; hint: NewOrgKey }> = {
  sole_prop: { label: "neworg.form.entityType.soleProp.label", hint: "neworg.form.entityType.soleProp.hint" },
  partnership: { label: "neworg.form.entityType.partnership.label", hint: "neworg.form.entityType.partnership.hint" },
  llp: { label: "neworg.form.entityType.llp.label", hint: "neworg.form.entityType.llp.hint" },
  sdn_bhd: { label: "neworg.form.entityType.sdnBhd.label", hint: "neworg.form.entityType.sdnBhd.hint" },
};
const CHANNEL_KEY: Record<string, string> = {
  google_search: "googleSearch", ai_assistant: "aiAssistant", online_ad: "onlineAd", facebook: "facebook",
  instagram: "instagram", tiktok: "tiktok", threads: "threads", x: "x", linkedin: "linkedin", youtube: "youtube",
  friend: "friend", accountant: "accountant", article: "article", event: "event", other: "other",
};
const REG_KEY: Record<string, string> = { BRN: "brn", NRIC: "nric", PASSPORT: "passport", ARMY: "army" };

const OPTION_CARD = "flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5";
const UNSAVED = {
  en: "This document has unsaved changes. Leave the page and lose them?",
  ms: "Dokumen ini mempunyai perubahan yang belum disimpan. Tinggalkan halaman dan buang perubahan itu?",
};

/** lejar.ai's NewOrgForm (chunk 606412), rebuilt with Kira's styling tokens. */
export function NewOrgForm({ lang }: { lang: Lang }) {
  const tr = (key: string) => t(lang, key as NewOrgKey);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [yearEnd, setYearEnd] = useState(() => defaultYearEnd());
  const [entityType, setEntityType] = useState("sdn_bhd");
  const [registrationType, setRegistrationType] = useState("BRN");
  const [channel, setChannel] = useState("");
  const [chartMode, setChartMode] = useState<"standard" | "migrating">("standard");
  const [pastChoice, setPastChoice] = useState<"" | "none" | "yes">("");
  const [pastIndex, setPastIndex] = useState("");
  const earlier = useMemo(() => earlierYearOptions(yearEnd), [yearEnd]);
  const pastFrom = pastChoice === "none" ? "none" : pastChoice === "yes" ? (earlier[Number(pastIndex)]?.startsOn ?? "") : "";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await createOrgAction(data);
      if (result.ok) {
        window.location.href = result.chartMode === "migrating" ? `/${result.slug}/migrate` : `/${result.slug}/getting-started`;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <UnsavedChangesGuard message={UNSAVED[lang]} />
      {lang === "ms" && <input type="hidden" name="lang" value="ms" />}

      <FormField label={tr("neworg.form.legalName.label")} htmlFor="legalName" required hint={tr("neworg.form.legalName.hint")}>
        <Input type="text" name="legalName" required placeholder={tr("neworg.form.legalName.placeholder")} />
      </FormField>

      <FormField
        label={tr("neworg.form.entityType.label")}
        htmlFor="entityType"
        required
        hint={`${tr(ENTITY[entityType].hint)} ${tr("neworg.form.entityType.permanenceNote")}`}
      >
        <Select name="entityType" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          {Object.entries(ENTITY).map(([value, k]) => (
            <option key={value} value={value}>
              {tr(k.label)}
            </option>
          ))}
        </Select>
      </FormField>

      <p className="rounded-[var(--radius)] border border-brand-border bg-brand-soft px-3 py-2.5 text-[12.5px] text-ink-2">
        <span className="font-semibold text-brand-ink">{tr("neworg.form.soleProp.calloutQuestion")}</span>{" "}
        {tr("neworg.form.soleProp.calloutChoosePrefix")} <span className="font-medium text-ink">{tr("neworg.form.soleProp.name")}</span>
        {tr("neworg.form.soleProp.calloutSuffix")}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={tr("neworg.form.fiscalYearEnd.label")} htmlFor="fiscalYearEnd" required hint={tr("neworg.form.fiscalYearEnd.hint")}>
          <Input type="date" name="fiscalYearEnd" required value={yearEnd} onChange={(e) => setYearEnd(e.target.value)} />
        </FormField>
        <FormField label={tr("neworg.form.cadence.label")} htmlFor="cadence" hint={tr("neworg.form.cadence.hint")}>
          <Select name="cadence" defaultValue="bimonthly">
            {Object.keys(CADENCE_MONTHS).map((c) => (
              <option key={c} value={c}>
                {tr(`neworg.form.cadence.${c}`)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {chartMode === "migrating" ? (
        <>
          <input type="hidden" name="pastRecordsFrom" value="none" />
          <p className="text-[12px] text-muted" data-testid="past-records-migrating">
            {tr("neworg.form.pastRecords.migrating")}
          </p>
        </>
      ) : (
        <fieldset className="flex flex-col gap-2" data-testid="past-records">
          <legend className="text-[13px] font-medium text-ink-2">{tr("neworg.form.pastRecords.legend")}</legend>
          <p className="text-[12px] text-muted">{tr("neworg.form.pastRecords.hint")}</p>
          <input type="hidden" name="pastRecordsFrom" value={pastFrom} />
          <label className={OPTION_CARD}>
            <input
              type="radio"
              name="pastRecordsChoice"
              value="none"
              required
              checked={pastChoice === "none"}
              onChange={() => {
                setPastChoice("none");
                setPastIndex("");
              }}
              className="accent-brand"
            />
            <span className="text-sm text-ink">{tr("neworg.form.pastRecords.none")}</span>
          </label>
          <label className={OPTION_CARD}>
            <input
              type="radio"
              name="pastRecordsChoice"
              value="yes"
              required
              checked={pastChoice === "yes"}
              onChange={() => setPastChoice("yes")}
              className="accent-brand"
            />
            <span className="text-sm text-ink">{tr("neworg.form.pastRecords.from")}</span>
            <Select
              aria-label={tr("neworg.form.pastRecords.yearLabel")}
              value={pastIndex}
              required={pastChoice === "yes"}
              onChange={(e) => {
                setPastIndex(e.target.value);
                if (e.target.value !== "") setPastChoice("yes");
              }}
            >
              <option value="">{tr("neworg.form.pastRecords.chooseYear")}</option>
              {earlier.map((y, i) => (
                <option key={y.startsOn} value={String(i)}>
                  {yearLabel(y, lang)}
                </option>
              ))}
            </Select>
          </label>
        </fieldset>
      )}

      <details className="rounded-lg border border-border bg-surface px-3 py-2">
        <summary className="cursor-pointer text-[13px] text-ink-2">{tr("neworg.form.fiscalYearStart.summary")}</summary>
        <div className="mt-3">
          <FormField label={tr("neworg.form.fiscalYearStart.label")} htmlFor="fiscalYearStart" hint={tr("neworg.form.fiscalYearStart.hint")}>
            <Input
              type="date"
              name="fiscalYearStart"
              max={todayInMalaysia()}
              onInvalid={(e) => {
                const details = e.currentTarget.closest("details");
                if (details) details.open = true;
              }}
            />
          </FormField>
        </div>
      </details>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-medium text-ink-2">{tr("neworg.form.chartMode.legend")}</legend>
        <input type="hidden" name="chartMode" value={chartMode} />
        {(["standard", "migrating"] as const).map((mode) => (
          <label key={mode} className={OPTION_CARD.replace("items-center", "items-start")}>
            <input
              type="radio"
              name="chartModeRadio"
              value={mode}
              checked={chartMode === mode}
              onChange={() => setChartMode(mode)}
              className="mt-0.5 accent-brand"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-ink">{tr(`neworg.form.chartMode.${mode}.title`)}</span>
              <span className="text-[12px] text-muted">{tr(`neworg.form.chartMode.${mode}.description`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <FormField label={tr("neworg.form.acquisitionChannel.label")} htmlFor="acquisitionChannel" required hint={tr("neworg.form.acquisitionChannel.hint")}>
        <Select name="acquisitionChannel" required value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">{tr("neworg.form.acquisitionChannel.placeholder")}</option>
          {Object.entries(CHANNEL_KEY).map(([value, k]) => (
            <option key={value} value={value}>
              {tr(`neworg.form.acquisitionChannel.${k}.label`)}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label={channel === "other" ? tr("neworg.form.acquisitionDetail.labelOther") : tr("neworg.form.acquisitionDetail.labelDefault")}
        htmlFor="acquisitionDetail"
        required={channel === "other"}
        hint={
          channel === ""
            ? tr("neworg.form.acquisitionDetail.hintUnanswered")
            : channel === "other"
              ? tr("neworg.form.acquisitionDetail.hintOther")
              : tr("neworg.form.acquisitionDetail.hintDefault")
        }
      >
        <Input
          type="text"
          name="acquisitionDetail"
          required={channel === "other"}
          maxLength={200}
          placeholder={
            channel === ""
              ? tr("neworg.form.acquisitionDetail.placeholderUnanswered")
              : tr(`neworg.form.acquisitionDetail.prompt.${CHANNEL_KEY[channel]}`)
          }
        />
      </FormField>

      <details className="rounded-lg border border-border bg-surface px-3 py-2">
        <summary className="cursor-pointer text-[13px] text-ink-2">{tr("neworg.form.registration.summary")}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <FormField
            label={tr("neworg.form.registrationType.label")}
            htmlFor="registrationType"
            hint={tr(`neworg.form.registrationType.${REG_KEY[registrationType]}.hint`)}
          >
            <Select name="registrationType" value={registrationType} onChange={(e) => setRegistrationType(e.target.value)}>
              {Object.entries(REG_KEY).map(([value, k]) => (
                <option key={value} value={value}>
                  {tr(`neworg.form.registrationType.${k}.label`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={tr(`neworg.form.registrationNumber.${REG_KEY[registrationType]}.label`)} htmlFor="ssmNumber">
            <Input type="text" name="ssmNumber" placeholder={tr(`neworg.form.registrationNumber.${REG_KEY[registrationType]}.placeholder`)} />
          </FormField>
          <p className="text-[12px] text-muted">{tr("neworg.form.registration.unregisteredNote")}</p>
          <FormField label={tr("neworg.form.sstNumber.label")} htmlFor="sstNumber" hint={tr("neworg.form.sstNumber.hint")}>
            <Input type="text" name="sstNumber" />
          </FormField>
          <FormField label={tr("neworg.form.tin.label")} htmlFor="tin" hint={tr("neworg.form.tin.hint")}>
            <Input type="text" name="tin" />
          </FormField>
        </div>
      </details>

      {error ? (
        <p role="alert" className="rounded border border-negative/30 bg-negative-soft px-3 py-2 text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? tr("neworg.form.submit.pending") : tr("neworg.form.submit.label")}
        </Button>
      </div>
    </form>
  );
}
