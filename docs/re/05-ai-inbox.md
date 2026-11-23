# Slice 5: AI Inbox (`/{slug}/inbox`) → review → record

Reverse engineered from lejar.ai on 2026-11-22. Sources:
- **REA:** DOM and screenshots of the empty inbox.
- **Playwright over the signed-in debugging Chrome:** one fictional receipt (Kedai Alat Tulis Cahaya, RM 45.80, cash) uploaded to the user's test entity **Kira Test Sdn Bhd** and analyzed, with the user's approval ("upload, don't record"). Its draft is still in that entity's inbox: Ready to review, not recorded.
- **Client chunks:**
  - `1yjjzu71g7hh9`: InboxFlow
  - `3bug2icf14zox` (module 977778): upload protocol
  - `2kg86gwcu_pjp`: BillForm
  - `0mw62597hoaq6`: journal entry form
  - `3--xjje9ff3dj`: the "AI drafted" check strip
- **i18n bundle:** `inbox.*`, `chat.upload.*`, `bills.form.*`.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Lejar's flow (observed)

1. **Inbox page.**
   - Title "AI Inbox", subtitle "{entity} · drop documents, photos or receipts; the AI drafts the transaction, you confirm".
   - A drop card (`card p-6 border-ai-soft bg-ai-soft/30`) with:
     - "Images or PDFs, up to 10 MB each, 20 at a time.";
     - an optional note box ("describe these documents to help the AI");
     - "Choose files".
   - Empty state "Nothing to review"; after the last row is handled, "Inbox clear.".
2. **Upload is free; reading is a separate step.**
   - `POST /api/inbox/uploads` sends `{orgSlug, files:[{sha256,name,size,contentType}]}`. Each file comes back as `status:"upload"` with a signed Supabase Storage URL, at `source-documents/{org_id}/{sha256}.{ext}`.
   - The browser `PUT`s the bytes.
   - `POST /api/inbox/uploads/complete` returns `{files:[{status:"stored",sourceDocumentId}], created:[{draftId}], duplicates, errors, statements, splitCandidates}`.
   - The row shows **Ready to analyze**, with the note "1 document is uploaded and waiting. Tap Analyze on the row to read it. Uploading alone costs nothing." and the buttons Analyze and Remove.
3. **Analyze.**
   - The Server Action `(orgSlug, draftId)` returns `{ok, draft:{status:"pending", draftType:"payment", aiSummary, confidence:0.85, documentDate:"2026-11-20", outOfPeriod:false}, duplicates}`. Lejar runs 3 at a time for "Analyze all".
   - The row shows **Ready to review** · summary · Suggested **Payment** · **85%**.
4. **Review links.**
   - Bill: `bills?aiDraft=` ("Review").
   - Sales invoice: `invoices?aiDraft=`.
   - Journal: `journal-entries?aiDraft=`.
   - Payment: "Record as journal entry" (`journal-entries?aiDraft=`), or **Match** against open bills and invoices when there are some.
   - Every row can be dismissed. Dismissed rows go to a "Dismissed (n)" section, where they can be restored.
5. **Journal entry review (observed for the cash receipt).**
   - The form is pre-filled: date from the document, reference `JV-202611-001`, the memo is the AI summary, and the lines are Dr `900-0000` / Cr `300-0900 Cash and Bank Balances` for 45.80. Lejar's AI chose a heading account here.
   - The source PDF is shown on the right, with "Open full size".
   - The banner reads "lejar drafted this entry. … Nothing is posted until you submit."
   - I did not click "Post entry".
6. **Bill form (observed empty, `bills?new=1`).**
   - Supplier combobox. "Bill number" BILL-YYYYMM-NNN, "Assigned when saved. Use my own number".
   - 14 currencies, bill date, due date with 30d/60d/90d buttons.
   - Payable account (400-0100 Trade Payables, under "Change").
   - Lines: description, account (default 700-0000 Cost of Sales), quantity, unit price, tax (No SST / SST 6% / 8% / Sales tax 5% / 10% / Exempt).
   - Withholding tax, notes, "Save draft", "Save & record".
   - On an AI draft the form shows an "AI drafted" strip: "High confidence" at ≥ 0.75, otherwise "Check the amounts before posting". It also flags printed totals that do not match the lines, and a second reading when two readings disagree.
7. **Extras in the code not built here:** document splitting for multi-bill PDFs, bank statements sent to Bank import, stock proposals, content duplicate checks ("same invoice number" / "same amount and date"), earlier-years banner, AI credit limits, the sample receipt, and client-side photo shrinking ("Made smaller to fit the AI read"). The shrinking is built.

## Kira's build

- **Database** (`supabase/migrations/20261122000400_ai_inbox.sql`):
  - Private bucket `source-documents`. Members can read it, and owners, admins and members can upload into their entity's folder.
  - Tables: `source_documents` (unique per entity + SHA-256), `ai_drafts` (Lejar's statuses), `contacts`, `bills` + `bill_lines`, `journal_entries` + `journal_lines`. They are read-only through RLS.
  - All writes go through role-checked functions:
    - `inbox_register_uploads`, `inbox_save_analysis`, `inbox_set_status`;
    - `record_bill`: posts Dr line accounts, Dr 400-1400 SST Input Tax, Cr payable;
    - `post_journal_entry`.
  - Postings must be balanced and fall in an open accounting period. Recording an inbox draft marks it recorded and checks Learn section 1.
- **Upload:** `src/app/api/inbox/uploads/route.ts` and `…/complete/route.ts` use Lejar's 3-step protocol. The server re-hashes the stored bytes before registering them. The browser side is in `src/features/inbox/upload-client.ts`.
- **AI** (`src/features/inbox/ai/read-document.ts`):
  - Claude **Opus 5.5** via `@anthropic-ai/sdk` `beta.messages.parse`, with Zod structured output, effort `medium` and server-side refusal `fallbacks: "default"`.
  - PDFs go as document blocks and photos as image blocks.
  - The prompt carries the entity's chart, so the AI picks account codes. Codes not in the chart fall back to 700-0000 (lines) or 300-0900 (cash).
  - It needs `ANTHROPIC_API_KEY` in `.env.local`. Without it, Analyze shows a set-up notice and the row stays waiting.
- **Pages:**
  - `/{slug}/inbox`: InboxFlow.
  - `/{slug}/bills`: totals, "Record a bill", list.
  - `/{slug}/journal-entries`: "Post a journal entry", posted list.
- **Texts:** Lejar's 103 `inbox.*` / `chat.upload.*` / `bills.form.*` strings (EN + BM, "Lejar" → "Kira"). The inbox's own labels are English-only, as on Lejar.

### Inferred / assumed

- **Bill numbers (inferred):** a drafted bill uses the supplier's document number as its bill number ("Use my own number" on), and any other bill gets BILL-YYYYMM-NNN.
- **Tax postings (inferred):** bill and payment tax post to 400-1400 SST Input Tax.
- **Cash receipts (inferred):** a paid receipt becomes Dr expense lines / Cr the cash account the AI read, defaulting to 300-0900 as on Lejar.
- **Learn section 1 (assumed):** it is checked by recording any inbox draft, as a bill or as a journal entry.
- **Left out (assumed), to come with the Bills slice:**
  - "Save draft";
  - foreign currencies (the form shows MYR only and warns on non-MYR documents);
  - stock, instalments, withholding tax;
  - editing and voiding bills, Match;
  - multi-select Remove.
- **Duplicates:** only exact same-file duplicates are caught ("This file is already in your inbox.").

## Verified (2026-11-22)

- **Setup:** real Supabase project, temporary @example.com user, and a local fake of the Anthropic Messages endpoint returning a canned reading (no API key was available).
- **Bill path:** sign-in → new entity → Learn "Start" section 1 → inbox → upload PDF (Ready to analyze) → Analyze (Ready to review, Bill, 92%).
  - Uploading the same file again was refused as already in the inbox.
  - Review opened the bill form pre-filled: supplier, number, dates, 3 lines; an invalid AI account code fell back to 700-0000. "AI drafted · High confidence · Matches the draft".
  - Save & record → Bill saved, RM45.80 outstanding.
- **Payment path:** a PNG with the note "PAID…" → Payment → "Record as journal entry" → Dr 800-1200 43.21, Dr 400-1400 2.59 / Cr 300-1000 45.80 → posted.
- **Results:** the inbox was clear, Learn showed "1 of 7 checked", and the ledger balanced (Dr 91.60 = Cr 91.60).
- **Request to Claude:** model `claude-opus-5-5`, document/image block, chart in the system prompt, structured-output JSON schema, fallbacks.
- **Outsider test:** another signed-in user could not read drafts, bills, journal lines or files, upload, record, or read numbering.
- **Cleanup:** the test users, entity and files were deleted. Build, typecheck and lint pass.
- **Not yet verified:** a real Claude reading of a real receipt (needs the key).
