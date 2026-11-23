import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { fromSen } from "@/features/books/money";
import type { TbRow } from "./load";

const INK = rgb(0.133, 0.2, 0.345);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.86, 0.87, 0.9);
const TURQUOISE = rgb(0, 0.827, 0.78);
const safe = (s: string) => s.replace(/[–—]/g, "-").replace(/→/g, "->").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");

/** Trial balance PDF (lejar.ai's /ledger/trial-balance/pdf link; its layout was not observed): Code, Account, Debit, Credit. */
export async function trialBalancePdf(entity: string, asOf: string, tb: { rows: TbRow[]; debit: number; credit: number; balanced: boolean }) {
  const pdf = await PDFDocument.create();
  pdf.setProducer("Kira");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 50;
  const DR = W - M - 95;
  const CR = W - M;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const text = (s: string, x: number, yy: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 9.5;
    const font = o.b ? bold : regular;
    const str = safe(s);
    page.drawText(str, { x: o.right ? x - font.widthOfTextAtSize(str, size) : x, y: yy, size, font, color: o.color ?? INK });
  };
  const head = () => {
    text(entity, M, y, { size: 10, color: MUTED });
    y -= 20;
    text("Trial balance", M, y, { size: 16, b: true });
    y -= 15;
    text(`as of ${asOf.slice(8, 10)}/${asOf.slice(5, 7)}/${asOf.slice(0, 4)}`, M, y, { color: MUTED });
    y -= 12;
    page.drawRectangle({ x: M, y, width: W - 2 * M, height: 2, color: TURQUOISE });
    y -= 20;
    text("CODE", M, y, { size: 8.5, b: true, color: MUTED });
    text("ACCOUNT", M + 70, y, { size: 8.5, b: true, color: MUTED });
    text("DEBIT (RM)", DR, y, { size: 8.5, b: true, color: MUTED, right: true });
    text("CREDIT (RM)", CR, y, { size: 8.5, b: true, color: MUTED, right: true });
    y -= 16;
  };
  head();
  if (tb.rows.length === 0) {
    text("No entries yet.", M, y, { color: MUTED });
    y -= 16;
  }
  for (const r of tb.rows) {
    if (y < M + 40) {
      page = pdf.addPage([W, H]);
      y = H - M;
      head();
    }
    text(r.code, M, y);
    const name = r.name.length > 52 ? `${r.name.slice(0, 51)}…` : r.name;
    text(name, M + 70, y);
    if (r.debit) text(fromSen(r.debit), DR, y, { right: true });
    if (r.credit) text(fromSen(r.credit), CR, y, { right: true });
    y -= 14;
  }
  page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.8, color: LINE });
  y -= 6;
  text(tb.balanced ? "Totals (balanced)" : "Totals (out of balance)", M, y, { b: true, size: 10 });
  text(fromSen(tb.debit), DR, y, { right: true, b: true, size: 10 });
  text(fromSen(tb.credit), CR, y, { right: true, b: true, size: 10 });
  for (const p of pdf.getPages()) {
    p.drawSvgPath("M5 3v14M15 3.5 8 10l7 6.5", { x: M, y: M - 16, scale: 0.6, borderColor: MUTED, borderWidth: 1.6 });
    p.drawText("Made with Kira", { x: M + 16, y: M - 25, size: 7.5, font: regular, color: MUTED });
  }
  return pdf.save();
}
