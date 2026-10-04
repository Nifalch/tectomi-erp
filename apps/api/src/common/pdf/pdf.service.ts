import { Injectable } from "@nestjs/common";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

@Injectable()
export class PdfService {
  async generateDocument(title: string, sections: Array<{ label: string; value: string }>) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    page.drawText(title, {
      x: 48,
      y: 790,
      size: 24,
      font: bold,
      color: rgb(0.12, 0.12, 0.16),
    });

    let y = 748;
    sections.forEach((section) => {
      page.drawText(section.label, {
        x: 48,
        y,
        size: 11,
        font: bold,
        color: rgb(0.4, 0.4, 0.45),
      });

      const lines = section.value.match(/.{1,82}(\s|$)/g) ?? [section.value];
      y -= 18;
      lines.forEach((line) => {
        page.drawText(line.trim(), {
          x: 48,
          y,
          size: 12,
          font,
          color: rgb(0.12, 0.12, 0.16),
        });
        y -= 16;
      });

      y -= 10;
    });

    return Buffer.from(await pdf.save());
  }
}
