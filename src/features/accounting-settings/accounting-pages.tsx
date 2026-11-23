import type { OrgContext } from "@/shared/org-context";
import { DocumentNumberingClient, ExchangeRatesClient, PriceBookClient } from "./accounting-client";
import { loadDocumentNumbering, loadExchangeRates, loadPriceBook } from "./load";
import { AccountingSettingsHeader } from "./sub-tabs";

export async function DocumentNumberingPage({ ctx }: { ctx: OrgContext }) {
  const rules = await loadDocumentNumbering(ctx.org.id);
  const canEdit = ctx.role === "owner" || ctx.role === "admin";
  return (
    <div className="flex flex-col gap-6">
      <AccountingSettingsHeader base={`/${ctx.org.slug}`} legalName={ctx.org.legal_name} sub="Numbering" activeSub="document-numbering" />
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="m-0 text-[13.5px] font-semibold text-ink">Document numbering</h2>
          <p className="m-0 mt-1 max-w-prose text-[12.5px] leading-[1.55] text-muted">
            Set the prefix, date pattern, digit padding, and next sequence number for each document type in {ctx.org.legal_name}. Changes apply to new drafts created going forward.
          </p>
        </div>
        <DocumentNumberingClient orgSlug={ctx.org.slug} rules={rules} canEdit={canEdit} />
      </section>
    </div>
  );
}

export async function PriceBookPage({ ctx }: { ctx: OrgContext }) {
  const { items, revenueAccounts } = await loadPriceBook(ctx.org.id);
  const canEdit = ctx.role !== "viewer";
  return (
    <div className="flex flex-col gap-6">
      <AccountingSettingsHeader base={`/${ctx.org.slug}`} legalName={ctx.org.legal_name} sub="Price book" activeSub="price-book" />
      <PriceBookClient orgSlug={ctx.org.slug} items={items} revenueAccounts={revenueAccounts} canEdit={canEdit} />
    </div>
  );
}

export async function ExchangeRatesPage({ ctx }: { ctx: OrgContext }) {
  const rates = await loadExchangeRates(ctx.org.id);
  const canEdit = ctx.role !== "viewer";
  return (
    <div className="flex flex-col gap-6">
      <AccountingSettingsHeader base={`/${ctx.org.slug}`} legalName={ctx.org.legal_name} sub="Exchange rates" activeSub="exchange-rates" />
      <ExchangeRatesClient orgSlug={ctx.org.slug} rates={rates} canEdit={canEdit} />
    </div>
  );
}
