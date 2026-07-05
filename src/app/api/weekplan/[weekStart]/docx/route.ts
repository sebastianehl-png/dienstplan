// Word-Export des Oberarzt-Wochenplans im Layout der Blanko-Vorlage.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DAY_NAMES, WEEK_ROWS } from "@/lib/weekplan-def";
import { weekendOnCall, weekLabel } from "@/lib/weekplan";

const GRAY = "D9D9D9";
const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const borders = { top: border, bottom: border, left: border, right: border };

// Nachname für kompakte Zellen ("Dr. Anna Bauer" -> "Bauer")
const lastName = (full: string) => full.trim().split(/\s+/).pop() ?? full;

export async function GET(_req: Request, { params }: { params: Promise<{ weekStart: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Nicht angemeldet", { status: 401 });

  const { weekStart } = await params;
  const plan = await prisma.weekPlan.findUnique({ where: { weekStart }, include: { cells: true } });
  if (!plan) return new Response("Kein Wochenplan für diese Woche", { status: 404 });
  if (plan.status !== "PUBLISHED" && !isStaff(me.role)) return new Response("Noch nicht veröffentlicht", { status: 403 });

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  // Pro Zelle können mehrere Plätze belegt sein (z.B. Normalstation bis 4)
  const cellMap = new Map<string, { userId: string | null; text: string | null; slot: number }[]>();
  for (const c of plan.cells) {
    const key = `${c.rowKey}|${c.day}`;
    const arr = cellMap.get(key) ?? [];
    arr.push({ userId: c.userId, text: c.text, slot: c.slot });
    cellMap.set(key, arr);
  }
  for (const arr of cellMap.values()) arr.sort((a, b) => a.slot - b.slot);
  const onCall = await weekendOnCall(weekStart);

  const font = "Arial";
  const cellLines = (rowKey: string, day: number): string[] => {
    const entries = (cellMap.get(`${rowKey}|${day}`) ?? []).filter((c) => c.userId || c.text);
    return entries.map((c) => c.text ?? lastName(nameOf.get(c.userId!) ?? ""));
  };

  // Tabellenbreite: A4 quer minus Ränder ≈ 14000 DXA
  const TABLE_W = 14000;
  const LABEL_W = 2800;
  const DAY_W = Math.floor((TABLE_W - LABEL_W) / 5);
  const colWidths = [LABEL_W, DAY_W, DAY_W, DAY_W, DAY_W, TABLE_W - LABEL_W - 4 * DAY_W];

  const mkCell = (lines: string[], opts: { bold?: boolean; gray?: boolean; width: number }) =>
    new TableCell({
      borders,
      width: { size: opts.width, type: WidthType.DXA },
      shading: opts.gray ? { fill: GRAY, type: ShadingType.CLEAR } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: (lines.length > 0 ? lines : [""]).map(
        (text) =>
          new Paragraph({
            children: [new TextRun({ text, bold: opts.bold, font, size: 20 })],
          })
      ),
    });

  const headerRow = new TableRow({
    children: [
      mkCell([""], { width: colWidths[0] }),
      ...DAY_NAMES.map((d, i) => mkCell([d], { bold: true, width: colWidths[i + 1] })),
    ],
  });

  const bodyRows = WEEK_ROWS.map(
    (row) =>
      new TableRow({
        children: [
          mkCell([row.label], { bold: true, width: colWidths[0] }),
          ...[0, 1, 2, 3, 4].map((day) =>
            mkCell(row.grayDays.includes(day) ? [] : cellLines(row.key, day), {
              gray: row.grayDays.includes(day),
              width: colWidths[day + 1],
            })
          ),
        ],
      })
  );

  const doc = new Document({
    styles: { default: { document: { run: { font, size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: "Klinik für Innere Medizin III", bold: true, font, size: 24 }),
              new TextRun({ text: `\tOberarzt-Dienstplan ${weekLabel(weekStart)}`, bold: true, font, size: 24 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Rufbereitschaft Wochenende: ${onCall.vg ? lastName(onCall.vg) : "—"}${
                  onCall.hk && onCall.hk !== onCall.vg ? ` | Hintergrund (HK): ${lastName(onCall.hk)}` : ""
                }    Pflege: ______`,
                font,
                size: 20,
              }),
            ],
            spacing: { after: 200 },
          }),
          new Table({
            width: { size: TABLE_W, type: WidthType.DXA },
            columnWidths: colWidths,
            rows: [headerRow, ...bodyRows],
          }),
          ...(plan.status !== "PUBLISHED"
            ? [
                new Paragraph({
                  spacing: { before: 200 },
                  alignment: AlignmentType.RIGHT,
                  children: [new TextRun({ text: "ENTWURF – noch nicht veröffentlicht", bold: true, font, size: 18, color: "CC0000" })],
                }),
              ]
            : []),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const body = new Uint8Array(buffer);
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="Oberarzt-Dienstplan_${weekStart}.docx"`,
    },
  });
}
