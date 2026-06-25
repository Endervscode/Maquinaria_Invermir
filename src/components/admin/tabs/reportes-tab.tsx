"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAll } from "@/lib/indexeddb/db";
import {
  Entrada,
  Salida,
  Turno,
  MINERAL_LABELS,
  ROLE_LABELS,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText,
  FileBarChart,
  FileSpreadsheet,
  Eye,
  Download,
} from "lucide-react";
import { formatShortDateTime } from "@/hooks/use-clock";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type ReportType = "movimientos" | "productividad" | "general";

export function ReportesTab() {
  const [type, setType] = useState<ReportType>("movimientos");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [salidas, setSalidas] = useState<Salida[]>([]);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setTurnos(await getAll<Turno>("turnos"));
      setEntradas(await getAll<Entrada>("entradas"));
      setSalidas(await getAll<Salida>("salidas"));
    })();
  }, []);

  const inRange = useMemo(() => {
    const f = new Date(from); f.setHours(0, 0, 0, 0);
    const t = new Date(to); t.setHours(23, 59, 59, 999);
    return (iso: string) => {
      const d = new Date(iso);
      return d >= f && d <= t;
    };
  }, [from, to]);

  function generatePDF(): jsPDF {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(108, 92, 231);
    doc.rect(0, 0, pageW, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Control de Maquinaria Pesada", 40, 35);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const title =
      type === "movimientos" ? "Reporte de Movimientos" :
      type === "productividad" ? "Reporte de Productividad" :
      "Reporte General";
    doc.text(title, 40, 55);
    doc.setFontSize(9);
    doc.text(
      `Período: ${from} a ${to} · Generado: ${new Date().toLocaleString("es-VE")}`,
      pageW - 40, 55, { align: "right" }
    );

    doc.setTextColor(20, 20, 20);

    let y = 90;

    if (type === "movimientos" || type === "general") {
      // Entradas
      const entF = entradas.filter((e) => inRange(e.fecha));
      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.text(`Entradas de maquinaria (${entF.length})`, 40, y);
      y += 8;
      autoTable(doc, {
        startY: y,
        head: [["Fecha", "Serial", "Marca/Modelo", "Cantidad", "Razón"]],
        body: entF.map((e) => [
          formatShortDateTime(e.fecha),
          e.serial,
          `${e.marca} ${e.modelo}`,
          String(e.cantidad),
          e.razon,
        ]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [108, 92, 231], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 240, 255] },
      });
      // @ts-ignore
      y = (doc as any).lastAutoTable.finalY + 18;

      // Salidas
      const salF = salidas.filter((s) => inRange(s.fecha));
      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.text(`Salidas de maquinaria (${salF.length})`, 40, y);
      y += 8;
      autoTable(doc, {
        startY: y,
        head: [["Fecha", "Serial", "Razón"]],
        body: salF.map((s) => [
          formatShortDateTime(s.fecha),
          s.maquinaria_serial,
          s.razon,
        ]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [239, 68, 68], textColor: 255 },
        alternateRowStyles: { fillColor: [254, 242, 242] },
      });
      // @ts-ignore
      y = (doc as any).lastAutoTable.finalY + 18;
    }

    if (type === "productividad" || type === "general") {
      // Turnos
      const turF = turnos.filter((t) => inRange(t.fecha_inicio) && t.estado !== "activo");
      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.text(`Productividad por turno (${turF.length})`, 40, y);
      y += 8;
      autoTable(doc, {
        startY: y,
        head: [["Fecha", "Empleado", "Maquinaria", "Jornada", "Mineral", "Taras", "Toneladas", "Estado"]],
        body: turF.map((t) => [
          formatShortDateTime(t.fecha_inicio),
          t.usuario_nombre,
          t.maquinaria_serial,
          t.jornada,
          t.mineral_type ? MINERAL_LABELS[t.mineral_type] : "—",
          String(t.taras_moved || 0),
          (t.toneladas || 0).toFixed(2),
          t.estado.replace("_", " "),
        ]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [108, 92, 231], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 240, 255] },
      });
      // @ts-ignore
      y = (doc as any).lastAutoTable.finalY + 14;

      // Mineral summary
      const mineralSummary: Record<string, { taras: number; toneladas: number; count: number }> = {
        grueso: { taras: 0, toneladas: 0, count: 0 },
        calibrado: { taras: 0, toneladas: 0, count: 0 },
        comercial: { taras: 0, toneladas: 0, count: 0 },
      };
      turF.forEach((t) => {
        if (t.mineral_type) {
          mineralSummary[t.mineral_type].taras += t.taras_moved || 0;
          mineralSummary[t.mineral_type].toneladas += t.toneladas || 0;
          mineralSummary[t.mineral_type].count += 1;
        }
      });
      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.text("Resumen por mineral", 40, y);
      y += 8;
      autoTable(doc, {
        startY: y,
        head: [["Mineral", "Turnos", "Taras", "Toneladas"]],
        body: Object.entries(mineralSummary).map(([k, v]) => [
          MINERAL_LABELS[k as keyof typeof MINERAL_LABELS],
          String(v.count),
          String(v.taras),
          v.toneladas.toFixed(2),
        ]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255 },
      });
      // @ts-ignore
      y = (doc as any).lastAutoTable.finalY + 14;

      // Totals
      const totalTaras = turF.reduce((s, t) => s + (t.taras_moved || 0), 0);
      const totalTon = turF.reduce((s, t) => s + (t.toneladas || 0), 0);
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text(`Totales: ${totalTaras} taras · ${totalTon.toFixed(2)} toneladas · ${turF.length} turnos`, 40, y);
    }

    // Footer page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(
        `Página ${i} de ${pageCount} · Control de Maquinaria Pesada`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 20,
        { align: "center" }
      );
    }

    return doc;
  }

  function handlePreview() {
    try {
      const doc = generatePDF();
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Error al generar PDF");
    }
  }

  function handleDownload() {
    try {
      const doc = generatePDF();
      doc.save(`reporte-${type}-${from}-a-${to}.pdf`);
      toast.success("PDF descargado");
    } catch (e: any) {
      toast.error(e?.message || "Error al descargar");
    }
  }

  const ICONS = {
    movimientos: <FileText className="text-[#6C5CE7]" size={20} />,
    productividad: <FileBarChart className="text-[#6C5CE7]" size={20} />,
    general: <FileSpreadsheet className="text-[#6C5CE7]" size={20} />,
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
          <FileText size={18} className="text-[#6C5CE7]" /> Generación de reportes
        </h3>
        <p className="subtitle-underline text-xs text-slate-500">Vista previa y descarga en PDF</p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(["movimientos", "productividad", "general"] as ReportType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-xl border-2 p-4 text-left transition ${
                type === t
                  ? "border-[#6C5CE7] bg-[#F5F0FF]"
                  : "border-slate-200 hover:border-[#6C5CE7]/40"
              }`}
            >
              {ICONS[t]}
              <p className="mt-2 text-sm font-bold capitalize text-slate-900">
                {t === "movimientos" ? "Movimientos" : t === "productividad" ? "Productividad" : "General"}
              </p>
              <p className="text-xs text-slate-500">
                {t === "movimientos" && "Entradas y salidas de maquinaria"}
                {t === "productividad" && "Turnos con mineral y taras"}
                {t === "general" && "Todo: movimientos + productividad"}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button onClick={handlePreview} variant="outline" className="border-[#6C5CE7] text-[#6C5CE7]">
            <Eye size={16} className="mr-1" /> Vista previa
          </Button>
          <Button onClick={handleDownload} style={{ background: "#6C5CE7" }}>
            <Download size={16} className="mr-1" /> Descargar PDF
          </Button>
        </div>
      </Card>

      {/* Quick summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Entradas en período</p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {entradas.filter((e) => inRange(e.fecha)).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Salidas en período</p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {salidas.filter((s) => inRange(s.fecha)).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Turnos en período</p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {turnos.filter((t) => inRange(t.fecha_inicio)).length}
          </p>
        </Card>
      </div>

      {/* PDF preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Vista previa del reporte</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <iframe
              src={previewUrl}
              className="h-full w-full rounded-lg border border-slate-200"
              title="Vista previa PDF"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
