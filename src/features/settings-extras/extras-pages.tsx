import { ArrowRight, Download } from "lucide-react";
import Link from "next/link";
import { SettingsHeader } from "@/features/settings/settings-header";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import {
  AiMemoryControls,
  ChangePasswordForm,
  CreateApiKeyForm,
  CreateWebhookForm,
  DeleteOrgDangerZone,
  LanguagePreferenceForm,
  MfaEnforcementToggle,
  RevokeApiKeyButton,
  WebhookRowActions,
} from "./extras-client";
import { loadApiKeys, loadDataAiSettings, loadSecuritySettings, loadWebhooks } from "./load";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const SUB = "shrink-0 whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors";

/** /{slug}/settings/api-keys */
export async function ApiKeysSettingsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const keys = await loadApiKeys(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const canAdmin = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <SettingsHeader base={base} legalName={ctx.org.legal_name} sub="API keys" active="api" />
        <div className="flex gap-1 overflow-x-auto pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link aria-current="page" href={`${base}/settings/api-keys`} className={cn(SUB, "bg-surface-2 text-ink")}>
            API keys
          </Link>
          <Link href={`${base}/settings/webhooks`} className={cn(SUB, "text-muted hover:bg-surface-2 hover:text-ink-2")}>
            Webhooks
          </Link>
        </div>
      </div>

      {canAdmin ? (
        <CreateApiKeyForm orgSlug={ctx.org.slug} />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[12.5px] text-muted">
          Only owners and admins can create or revoke API keys.
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[14px] font-semibold text-ink">API keys ({keys.length})</h2>
        {keys.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
            No API keys yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="api-keys-table">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>Name</th>
                  <th className={cn(TH, "text-left")}>Prefix</th>
                  <th className={cn(TH, "text-left")}>Scope</th>
                  <th className={cn(TH, "text-left")}>Status</th>
                  <th className={cn(TH, "text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t border-border transition-colors hover:bg-surface-2">
                    <td className={cn(TD, "font-medium text-ink")}>{k.name}</td>
                    <td className={cn(TD, "num text-ink-2")}>{k.keyPrefix}…</td>
                    <td className={TD}>
                      <span className="chip">{k.scope === "write" ? "Read & write" : "Read only"}</span>
                    </td>
                    <td className={TD}>
                      <span className={k.revokedAt ? "chip" : "chip pos"}>{k.revokedAt ? "Revoked" : "Active"}</span>
                    </td>
                    <td className={cn(TD, "text-right")}>
                      {canAdmin && !k.revokedAt ? <RevokeApiKeyButton orgSlug={ctx.org.slug} id={k.id} /> : <span className="text-muted">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** /{slug}/settings/webhooks */
export async function WebhooksSettingsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const hooks = await loadWebhooks(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const canAdmin = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <SettingsHeader base={base} legalName={ctx.org.legal_name} sub="Webhooks" active="api" />
        <div className="flex gap-1 overflow-x-auto pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link href={`${base}/settings/api-keys`} className={cn(SUB, "text-muted hover:bg-surface-2 hover:text-ink-2")}>
            API keys
          </Link>
          <Link aria-current="page" href={`${base}/settings/webhooks`} className={cn(SUB, "bg-surface-2 text-ink")}>
            Webhooks
          </Link>
        </div>
      </div>

      {canAdmin ? (
        <CreateWebhookForm orgSlug={ctx.org.slug} />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[12.5px] text-muted">
          Only owners and admins can manage webhooks.
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[14px] font-semibold text-ink">Endpoints ({hooks.length})</h2>
        {hooks.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
            No webhook endpoints configured yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="webhooks-table">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>Endpoint</th>
                  <th className={cn(TH, "text-left")}>Events</th>
                  <th className={cn(TH, "text-left")}>Status</th>
                  <th className={cn(TH, "text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hooks.map((w) => (
                  <tr key={w.id} className="border-t border-border transition-colors hover:bg-surface-2">
                    <td className={cn(TD, "py-2")}>
                      <div className="font-medium text-ink">{w.url}</div>
                      <div className="num text-[11.5px] text-muted">Secret {w.signingSecretPrefix}…</div>
                    </td>
                    <td className={cn(TD, "text-[12px] text-ink-2")}>{w.events.join(", ")}</td>
                    <td className={TD}>
                      <span className={w.enabled ? "chip pos" : "chip"}>{w.enabled ? "Active" : "Disabled"}</span>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-right")}>
                      {canAdmin ? <WebhookRowActions orgSlug={ctx.org.slug} id={w.id} enabled={w.enabled} /> : <span className="text-muted">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** /{slug}/settings/data */
export async function DataAiSettingsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadDataAiSettings(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const canAdmin = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader base={base} legalName={ctx.org.legal_name} sub="Data & AI" active="data" />

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div>
          <h2 className="m-0 text-[14px] font-semibold text-ink">Migrate from another system</h2>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            Bring opening balances across from Xero, Sage UBS, SQL Account, AutoCount, or a CSV template.
          </p>
        </div>
        <Link href={`${base}/migrate`} className={buttonClass("secondary", "sm")}>
          Open the migration wizard <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div>
          <h2 className="m-0 text-[14px] font-semibold text-ink">Export your data</h2>
          <p className="m-0 mt-1 max-w-xl text-[12.5px] text-muted">
            Download every record in {ctx.org.legal_name}: accounts, contacts, invoices, bills, journal entries, fixed
            assets, prepaids, stock items, MyInvois submissions, and activity log as JSON.
          </p>
        </div>
        {canAdmin ? (
          <a href={`${base}/settings/data/export`} className={buttonClass("secondary", "sm")}>
            <Download size={13} aria-hidden="true" /> Download JSON
          </a>
        ) : (
          <span className="text-[12px] text-muted">Only the owner or an admin can export.</span>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div>
          <h2 className="m-0 text-[14px] font-semibold text-ink">Kira memory</h2>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            Kira keeps short chat summaries so Ask Kira can answer from what it already knows about your books.
          </p>
        </div>
        <AiMemoryControls
          orgSlug={ctx.org.slug}
          initialEnabled={data.aiMemoryEnabled}
          chatCount={data.chatCount}
          canAdmin={canAdmin}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-negative/30 bg-surface p-5">
        <h2 className="m-0 text-[14px] font-semibold text-negative">Danger zone</h2>
        <DeleteOrgDangerZone orgSlug={ctx.org.slug} legalName={ctx.org.legal_name} isOwner={ctx.role === "owner"} />
      </section>
    </div>
  );
}

/** /{slug}/settings/account */
export async function AccountSecuritySettingsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const sec = await loadSecuritySettings(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader base={base} legalName={ctx.org.legal_name} sub="Account & security" active="account" />

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div>
          <h2 className="m-0 text-[14px] font-semibold text-ink">Language</h2>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            Sets your display language across workspaces you belong to.
          </p>
        </div>
        <LanguagePreferenceForm orgSlug={ctx.org.slug} initialLang={ctx.lang} />
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div>
          <h2 className="m-0 text-[14px] font-semibold text-ink">Account &amp; password</h2>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            Signed in as <strong className="text-ink">{ctx.email}</strong> ({ctx.role} on {ctx.org.legal_name}).
          </p>
        </div>
        <ChangePasswordForm />
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="m-0 text-[14px] font-semibold text-ink">Two-factor authentication (2FA)</h2>
            <p className="m-0 mt-1 max-w-xl text-[12.5px] text-muted">
              Two-factor authentication adds a rotating code from an authenticator app (Google Authenticator, 1Password,
              or Authy) when you sign in.
            </p>
          </div>
          <span className={sec.mfaEnrolledCount > 0 ? "chip pos" : "chip"}>
            {sec.mfaEnrolledCount > 0 ? `${sec.mfaEnrolledCount} authenticator active` : "Not enrolled"}
          </span>
        </div>
        <MfaEnforcementToggle
          orgSlug={ctx.org.slug}
          initialRequired={sec.requireMfaForAdmins}
          isOwner={ctx.role === "owner"}
        />
      </section>
    </div>
  );
}
