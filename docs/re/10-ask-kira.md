# Slice 10: Ask Kira (`/{slug}/chat`)

Reverse engineered from lejar.ai on 2026-11-22, read-only: the page was opened and no message was sent.

Sources:
- `/chat` HTML and screenshot. Opening it replaced the address with `/chat/{uuid}`, and the list stayed "No conversations yet".
- The ChatShell chunk `2izis602kd9nz` (264 KB): the turn transport, the event reducer, and the tool names.
- The conversation actions chunk `01i0bp5d3r49q`: rename and delete.
- 727 `chat.*` strings.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

- **Layout (ChatShell replaces the page area):**
  - Header "{entity} / {title}" with a rail toggle.
  - A 260px rail: New conversation (`/chat/new`), Search conversations, "What Lejar knows" (`/chat/knows`), the list grouped Today / Yesterday / Previous 7 days, and an AI usage meter.
  - A 720px main column.
- **Greeting:** a "● LEJAR" label, then "Good afternoon, Ganyaotong. This is {entity}. What would you like to do first?". The name is the email's first part.
- **Starter buttons:** "Snap a receipt or bill", "Add a bank statement", "Bill a customer".
- **Composer:** a rounded 16px box with attach, a "Ask, or drop a file" textarea and a round AI-coloured Send button. Below it: "Lejar is an AI assistant and can be wrong. Verify important figures against your reports."
- **Transport:** `POST /api/assistant/turn` `{orgSlug, conversationId, create?, …}` returns newline-delimited JSON events `{type, runId, seq, …}`. The main types are `message_saved`, `progress` (stage model/tool with the tool name; "Thinking", "Reading {what}", "Writing your answer…"), `text_delta`, `citation`, `done` and `error`/`stopped`, among about 70.
- **Read tools (chat.turn.tool.*):** list_accounts, list_periods, get_trial_balance, list_journal_entries_for_period, list_account_activity, get_p_and_l, get_balance_sheet, get_cash_flow, get_sst_02_return, list_source_documents, list_contacts / get_contact, list_bills / get_bill, list_invoices / get_invoice, list_bill_payments, list_invoice_receipts, get_journal_entry, and list_fixed_assets / get_fixed_asset.
- **Not built in Kira yet:** proposals the AI drafts for approval, uploads in chat, "What Lejar knows" facts and rules, checks, citations ("Show the source of {figure}"), usage limits, message edits and versions, and keyboard shortcuts.
- **Learn section 6:** "Open Ask Lejar and type a question… One answer checks the section."

## Kira's build

- **Migration `20261122000900_ask_kira.sql`:**
  - `chat_conversations` and `chat_messages`, private to the member who started them (RLS).
  - `check_ask_section`: any member, viewers included, can ask, and the first answer checks Learn section 6.
- **`src/app/api/assistant/turn/route.ts`:**
  - Creates the conversation on the first message, saves the member message, and streams Lejar-style NDJSON events.
  - Saves the answer and checks Learn. Aborting the request stops the reply, which is saved as stopped.
- **`src/features/chat/agent.ts`:** a streaming manual tool loop on Claude Opus 5.5 (`beta.messages.stream`, effort medium, `fallbacks: "default"`, `eager_input_streaming` tools with Zod validation, up to 8 rounds).
  - It has 12 of Lejar's read tools: list_accounts, list_periods, get_trial_balance, get_p_and_l, get_balance_sheet, list_account_activity, list_journal_entries_for_period, list_contacts, list_invoices / get_invoice, list_bills / get_bill.
  - They are implemented in `books.ts` over the member's own Supabase session.
  - The system prompt tells Kira to use only the tools' figures, write amounts as RM, and say what's missing. It cannot change the books.
- **`src/features/chat/chat-shell.tsx`:** the header, rail (search, day groups, delete), greeting with starter links, messages (Markdown answers with tables via react-markdown + remark-gfm) and composer (Enter sends, Stop).
  - The first message swaps the address to `/chat/{id}` without remounting.
- **Frame:** the app frame passes chat routes through full-bleed, as Lejar does. `/chat/knows` shows "coming soon".

## Verified (2026-11-22, real Supabase project, fake streaming Anthropic endpoint, temporary user deleted afterwards)

- **Setup:** two entries posted (income 1,000, expense 200).
- **Greeting and tour:** Learn Start section 6 opened the greeting with the 3 starter buttons, and the tour showed "ASK KIRA A QUESTION · 1 OF 1".
- **The question:** "How much profit did we make in November?"
  - The fake model called `get_p_and_l {2026-11-01..30}`, and Kira's tool read the real books.
  - The streamed answer was "net profit of RM800.00", with a table: Income RM1,000.00, Expenses RM200.00.
- **The request Claude received:** `claude-opus-5-5`, effort medium, `fallbacks: "default"`, 12 tools all with `eager_input_streaming`.
- **Address and list:** the address became `/chat/{id}`, the header took the question as its title, and the rail showed it under "Today".
- **Reload:** the conversation was still there.
- **Learn:** section 6 was checked.
- **Delete:** removed the conversation ("No conversations yet").
- **Not tested:** a real Claude answer, until `ANTHROPIC_API_KEY` is set.
