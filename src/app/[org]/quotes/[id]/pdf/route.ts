import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { fromSen } from "@/features/books/money";
import { loadQuote } from "@/features/quotes/load";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * GET /{slug}/quotes/{id}/pdf: lejar.ai's "Download PDF" on a quote ("saves the quote as a PDF at any status,
 * including drafts"). Lejar's PDF was not observed, so the layout follows Kira's invoice PDF.
 */
const INK = rgb(0.133, 0.2, 0.345);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.86, 0.87, 0.9);
const TURQUOISE = rgb(0, 0.827, 0.78);
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const TAX: Record<string, string> = { none: "No SST", sst_6: "SST 6%", sst_8: "SST 8%", sales_5: "Sales tax 5%", sales_10: "Sales tax 10%", exempt: "Exempt" };

export async function GET(_request: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: o } = await supabase.from("organizations").select("id, legal_name, registration_number, sst_number, tin, address, postcode, city, state").eq("slug", org).maybeSingle();
  if (!o || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const q = await loadQuote(supabase, o.id, id);
  if (!q) return new Response("Not found", { status: 404 });

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Quote ${q.number}`);
  pdf.setProducer("Kira");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const text = (s: string, x: number, yy: number, opt: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = opt.size ?? 9.5;
    const font = opt.font ?? regular;
    const str = safe(s);
    page.drawText(str, { x: opt.right ? x - font.widthOfTextAtSize(str, size) : x, y: yy, size, font, color: opt.color ?? INK });
  };
  const m = (sen: number) => `RM ${fromSen(sen)}`;

  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: TURQUOISE });
  text(o.legal_name, M, y, { size: 13, font: bold });
  text("QUOTATION", W - M, y, { size: 18, font: bold, right: true });
  y -= 16;
  for (const l of [[o.address, [o.postcode, o.city].filter(Boolean).join(" "), o.state].filter(Boolean).join(", "), o.registration_number ? `Reg. no. ${o.registration_number}` : "", o.sst_number ? `SST no. ${o.sst_number}` : ""].filter(Boolean)) {
    text(l as string, M, y, { color: MUTED });
    y -= 12;
  }
  let ry = H - M - 22;
  for (const [k, v] of [["Quote no.", q.number], ["Quote date", q.date], ["Valid until", q.expires ?? "-"], ["Status", q.status]]) {
    text(k, W - M - 150, ry, { color: MUTED });
    text(v, W - M, ry, { right: true, font: bold });
    ry -= 13;
  }
  y = Math.min(y, ry) - 18;
  text("Prepared for", M, y, { color: MUTED });
  y -= 13;
  text(q.customer, M, y, { size: 11, font: bold });
  y -= 26;

  const cols = { no: M, desc: M + 22, tax: W - M - 190, amt: W - M - 80, taxAmt: W - M };
  const header = () => {
    page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.8, color: LINE });
    for (const [label, x, right] of [["#", cols.no, false], ["Description", cols.desc, false], ["Tax", cols.tax, false], ["Amount", cols.amt, true], ["Tax", cols.taxAmt, true]] as const) text(label, x, y, { font: bold, size: 8.5, color: MUTED, right });
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: LINE });
    y -= 14;
  };
  header();
  for (const l of q.lines) {
    if (y < M + 120) {
      page = pdf.addPage([W, H]);
      y = H - M;
      header();
    }
    text(String(l.no), cols.no, y);
    text(l.description.length > 60 ? `${l.description.slice(0, 58)}…` : l.description, cols.desc, y);
    text(TAX[l.taxCode] ?? l.taxCode, cols.tax, y, { color: MUTED });
    text(fromSen(l.amount), cols.amt, y, { right: true });
    text(fromSen(l.tax), cols.taxAmt, y, { right: true });
    y -= 16;
  }
  y -= 6;
  page.drawLine({ start: { x: W - M - 200, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.8, color: LINE });
  for (const [k, v, b] of [["Subtotal", m(q.subtotal), false], ["SST", m(q.taxTotal), false], ["Total", m(q.total), true]] as const) {
    text(k, W - M - 200, y - 6, { font: b ? bold : regular });
    text(v, W - M, y - 6, { right: true, font: b ? bold : regular, size: b ? 11 : 9.5 });
    y -= 16;
  }
  if (q.notes) {
    y -= 18;
    text("Notes", M, y, { color: MUTED });
    y -= 13;
    text(q.notes.slice(0, 120), M, y);
  }
  text("This quotation is not a tax invoice.", M, M - 10, { size: 8, color: MUTED });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${q.number}.pdf"` },
  });
}
