import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fromSen } from "@/features/books/money";
import type { FlatLine } from "./flatten";

const INK = rgb(0.133, 0.2, 0.345);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.86, 0.87, 0.9);
const TURQUOISE = rgb(0, 0.827, 0.78);
const safe = (s: string) => s.replace(/[–—]/g, "-").replace(/→/g, "->").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const money = (n: number) => (n < 0 ? `(${fromSen(-n)})` : fromSen(n));

/** Kira's statement PDF (lejar.ai's PDF layout was not observed): entity, title, period, lines, totals. */
export async function statementPdf(entity: string, sections: { title: string; period: string; lines: FlatLine[]; compareLabel?: string }[]) {
  const pdf = await PDFDocument.create();
  pdf.setProducer("Kira");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 50;
  let page: PDFPage;
  let y = 0;
  const text = (s: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 9.5;
    const font = o.font ?? regular;
    const str = safe(s);
    page.drawText(str, { x: o.right ? x - font.widthOfTextAtSize(str, size) : x, y: yy, size, font, color: o.color ?? INK });
  };
  const newPage = (s: { title: string; period: string; compareLabel?: string }) => {
    page = pdf.addPage([W, H]);
    y = H - M;
    text(entity, M, y, { size: 10, color: MUTED });
    y -= 20;
    text(s.title, M, y, { size: 16, font: bold });
    y -= 15;
    text(s.period, M, y, { color: MUTED });
    y -= 12;
    page.drawRectangle({ x: M, y, width: W - 2 * M, height: 2, color: TURQUOISE });
    y -= 20;
    text("RM", W - M - (s.compareLabel ? 110 : 0), y, { size: 8.5, font: bold, color: MUTED, right: true });
    if (s.compareLabel) text(s.compareLabel, W - M, y, { size: 8.5, font: bold, color: MUTED, right: true });
    y -= 14;
  };
  for (const s of sections) {
    newPage(s);
    const amountX = W - M - (s.compareLabel ? 110 : 0);
    for (const l of s.lines) {
      if (y < M + 40) newPage(s);
      if (l.kind === "head") {
        y -= 6;
        text(l.label.toUpperCase(), M, y, { size: 8.5, font: bold, color: MUTED });
        y -= 14;
      } else if (l.kind === "note") {
        text(l.label, M + 10, y, { size: 9, color: MUTED });
        y -= 14;
      } else if (l.kind === "row") {
        text(l.label, M + 10, y);
        text(money(l.amount ?? 0), amountX, y, { right: true });
        if (s.compareLabel) text(money(l.compare ?? 0), W - M, y, { right: true, color: MUTED });
        y -= 14;
      } else {
        page!.drawLine({ start: { x: M, y: y + 11 }, end: { x: W - M, y: y + 11 }, thickness: 0.8, color: LINE });
        text(l.label, M, y, { font: bold, size: 10 });
        text(money(l.amount ?? 0), amountX, y, { right: true, font: bold, size: 10 });
        if (s.compareLabel) text(money(l.compare ?? 0), W - M, y, { right: true, font: bold, size: 10, color: MUTED });
        y -= 20;
      }
    }
  }
  for (const p of pdf.getPages()) {
    p.drawSvgPath("M5 3v14M15 3.5 8 10l7 6.5", { x: M, y: M - 16, scale: 0.6, borderColor: MUTED, borderWidth: 1.6 });
    p.drawText("Made with Kira", { x: M + 16, y: M - 25, size: 7.5, font: regular, color: MUTED });
  }
  return pdf.save();
}

export function pdfResponse(bytes: Uint8Array, name: string) {
  return new Response(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" },
  });
}
