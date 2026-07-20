"use client";

import { useEffect, useMemo, useState } from "react";
import { getAll } from "@/lib/indexeddb/db";
import {
  type Entrada,
  type Salida,
  type Turno,
  MINERAL_LABELS,
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
  Users,
  Eye,
  Download,
  Clock,
  Award,
  Medal,
} from "lucide-react";
import { formatShortDateTime } from "@/hooks/use-clock";
import { formatDuration } from "@/lib/utils-shift";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type ReportType = "movimientos" | "productividad" | "horas" | "general";

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

  // --- Employee hours calculation ---
  const employeeHours = useMemo(() => {
    const shifts = turnos.filter(
      (t) => inRange(t.fecha_inicio) && t.estado !== "activo" && t.duracion_minutos != null
    );
    const byEmployee = new Map<string, {
      nombre: string;
      total_minutos: number;
      turnos: number;
      completo: number;
      incompleto: number;
      con_horas_extra: number;
      total_toneladas: number;
    }>();

    shifts.forEach((t) => {
      const cur = byEmployee.get(t.usuario_id) || {
        nombre: t.usuario_nombre,
        total_minutos: 0,
        turnos: 0,
        completo: 0,
        incompleto: 0,
        con_horas_extra: 0,
        total_toneladas: 0,
      };
      cur.total_minutos += t.duracion_minutos ?? 0;
      cur.turnos += 1;
      if (t.estado === "completo") cur.completo += 1;
      if (t.estado === "incompleto") cur.incompleto += 1;
      if (t.estado === "con_horas_extra") cur.con_horas_extra += 1;
      cur.total_toneladas += t.toneladas || 0;
      byEmployee.set(t.usuario_id, cur);
    });

    return Array.from(byEmployee.entries())
      .map(([id, v]) => ({
        id,
        ...v,
        total_horas: Math.round((v.total_minutos / 60) * 100) / 100,
        promedio_minutos_por_turno: v.turnos > 0 ? Math.round(v.total_minutos / v.turnos) : 0,
      }))
      .sort((a, b) => b.total_minutos - a.total_minutos);
  }, [turnos, inRange]);

  const totalEmployeeMinutes = employeeHours.reduce((s, e) => s + e.total_minutos, 0);

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
    const titles: Record<ReportType, string> = {
      movimientos: "Reporte de Entradas y Salidas",
      productividad: "Reporte de Productividad",
      horas: "Reporte de Horas por Empleado",
      general: "Reporte General",
    };
    doc.text(titles[type], 40, 55);
    doc.setFontSize(9);
    doc.text(
      `Período: ${from} a ${to} · Generado: ${new Date().toLocaleString("es-VE")}`,
      pageW - 40, 55, { align: "right" }
    );

    doc.setTextColor(20, 20, 20);
    let y = 90;

    // === MOVIMIENTOS / GENERAL ===
    if (type === "movimientos" || type === "general") {
      // Asignaciones de maquinaria a ubicaciones
      const entF = entradas.filter((e) => inRange(e.fecha));
      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.text(`Asignaciones de maquinaria (${entF.length})`, 40, y);
      y += 8;
      autoTable(doc, {
        startY: y,
        head: [["Fecha", "Máquina", "Ubicación", "Nota"]],
        body: entF.map((e) => [
          formatShortDateTime(e.fecha),
          e.maquinaria_serial,
          e.localidad_nombre,
          e.nota || "—",
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

    // === HORAS POR EMPLEADO ===
    if (type === "horas" || type === "general") {
      const activeEmployees = turnos.filter((t) => inRange(t.fecha_inicio) && t.estado !== "activo");
      const uniqueCount = new Set(activeEmployees.map((t) => t.usuario_id)).size;

      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.text(`Horas trabajadas por empleado (${uniqueCount} empleados · ${employeeHours.length} con turnos)`, 40, y);
      y += 8;

      if (employeeHours.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [["#", "Empleado", "Turnos", "Horas totales", "Prom. por turno", "Toneladas", "Eficiencia"]],
          body: employeeHours.map((e, i) => {
            const pct = totalEmployeeMinutes > 0
              ? ((e.total_minutos / totalEmployeeMinutes) * 100).toFixed(1)
              : "0.0";
            const toneladasStr = e.total_toneladas.toFixed(2);
            const promStr = formatDuration(e.promedio_minutos_por_turno);
            return [
              String(i + 1),
              e.nombre,
              String(e.turnos),
              formatDuration(e.total_minutos),
              promStr,
              toneladasStr,
              `${pct}%`,
            ];
          }),
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: [245, 158, 11], textColor: 255 },
          alternateRowStyles: { fillColor: [255, 251, 235] },
          columnStyles: {
            0: { cellWidth: 25, halign: "center" },
            6: { cellWidth: 40, halign: "center" },
          },
        });
        // @ts-ignore
        y = (doc as any).lastAutoTable.finalY + 14;

        // Top 3 highlight
        if (employeeHours.length >= 1) {
          doc.setFontSize(11); doc.setFont("helvetica", "bold");
          doc.setTextColor(108, 92, 231);
          doc.text("🏆 Top desempeño", 40, y);
          y += 8;
          doc.setTextColor(20, 20, 20);
          doc.setFontSize(9); doc.setFont("helvetica", "normal");

          const medals = ["🥇", "🥈", "🥉"];
          employeeHours.slice(0, 3).forEach((e, i) => {
            doc.text(
              `${medals[i]} ${e.nombre} — ${formatDuration(e.total_minutos)} trabajadas, ${e.turnos} turnos, ${e.total_toneladas.toFixed(2)} toneladas`,
              40, y
            );
            y += 14;
          });
        }

        // Summary stats
        y += 4;
        doc.setFontSize(10); doc.setFont("helvetica", "bold");
        doc.text("Resumen general", 40, y);
        y += 8;
        doc.setFontSize(9); doc.setFont("helvetica", "normal");
        const totalHours = employeeHours.reduce((s, e) => s + e.total_minutos, 0);
        const totalTon = employeeHours.reduce((s, e) => s + e.total_toneladas, 0);
        const totalShifts = employeeHours.reduce((s, e) => s + e.turnos, 0);
        doc.text(`Total horas trabajadas: ${formatDuration(totalHours)}`, 40, y); y += 14;
        doc.text(`Total turnos: ${totalShifts}`, 40, y); y += 14;
        doc.text(`Total toneladas: ${totalTon.toFixed(2)}`, 40, y); y += 14;
        doc.text(`Promedio horas por empleado: ${formatDuration(Math.round(totalHours / employeeHours.length))}`, 40, y); y += 14;
      } else {
        doc.setFontSize(10);
        doc.text("No hay turnos completados en este período.", 40, y);
        y += 18;
      }
    }

    // === PRODUCTIVIDAD / GENERAL ===
    if (type === "productividad" || type === "general") {
      // If we're in general mode and already have content, add spacing
      if (type === "general") y += 4;

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
      const names: Record<ReportType, string> = {
        movimientos: "entradas-salidas",
        productividad: "productividad",
        horas: "horas-empleados",
        general: "general",
      };
      doc.save(`reporte-${names[type]}-${from}-a-${to}.pdf`);
      toast.success("PDF descargado");
    } catch (e: any) {
      toast.error(e?.message || "Error al descargar");
    }
  }

  const ICONS: Record<ReportType, React.ReactNode> = {
    movimientos: <FileText className="text-[#6C5CE7]" size={20} />,
    productividad: <FileBarChart className="text-[#6C5CE7]" size={20} />,
    horas: <Clock className="text-[#6C5CE7]" size={20} />,
    general: <FileSpreadsheet className="text-[#6C5CE7]" size={20} />,
  };

  // --- Summary data ---
  const uniqueEmployees = useMemo(() => {
    const ids = new Set(
      turnos.filter((t) => inRange(t.fecha_inicio)).map((t) => t.usuario_id)
    );
    return ids.size;
  }, [turnos, inRange]);

  const totalHoursInRange = useMemo(() => {
    return formatDuration(employeeHours.reduce((s, e) => s + e.total_minutos, 0));
  }, [employeeHours]);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
          <FileText size={18} className="text-[#6C5CE7]" /> Generación de reportes
        </h3>
        <p className="subtitle-underline text-xs text-slate-500">Vista previa y descarga en PDF</p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(["movimientos", "productividad", "horas", "general"] as ReportType[]).map((t) => (
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
                {t === "movimientos" ? "Entradas / Salidas" :
                 t === "productividad" ? "Productividad" :
                 t === "horas" ? "Horas x Empleado" :
                 "General"}
              </p>
              <p className="text-xs text-slate-500">
                {t === "movimientos" && "Asignaciones de máquinas a ubicaciones y salidas"}
                {t === "productividad" && "Turnos con mineral y taras"}
                {t === "horas" && "Horas trabajadas por cada empleado"}
                {t === "general" && "Todo: movimientos + horas + productividad"}
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">
            {type === "horas" ? <><Users size={12} className="inline mr-1" /> Empleados activos</> : "Empleados activos"}
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900">{uniqueEmployees}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">
            {type === "horas" ? <><Clock size={12} className="inline mr-1" /> Total horas</> : "Asignaciones en período"}
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {type === "horas" ? totalHoursInRange : entradas.filter((e) => inRange(e.fecha)).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">
            {type === "horas" ? <><Award size={12} className="inline mr-1" /> Mejor empleado</> : "Salidas en período"}
          </p>
          <p className="mt-1 text-xl font-black text-slate-900 truncate">
            {type === "horas"
              ? (employeeHours[0]?.nombre || "—")
              : salidas.filter((s) => inRange(s.fecha)).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">
            {type === "horas" ? <><Medal size={12} className="inline mr-1" /> Horas del mejor</> : "Turnos en período"}
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {type === "horas"
              ? (employeeHours[0] ? formatDuration(employeeHours[0].total_minutos) : "—")
              : turnos.filter((t) => inRange(t.fecha_inicio)).length}
          </p>
        </Card>
      </div>

      {/* Employee hours table preview (in hours mode) */}
      {type === "horas" && employeeHours.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
            <Users size={18} className="text-[#6C5CE7]" /> Horas por empleado
          </h3>
          <p className="subtitle-underline text-xs text-slate-500">
            {employeeHours.length} empleados · Total: {totalHoursInRange}
          </p>

          <div className="mt-4 max-h-[50vh] overflow-y-auto scroll-thin">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 text-xs uppercase text-slate-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">#</th>
                  <th className="px-3 py-2 text-left font-semibold">Empleado</th>
                  <th className="px-3 py-2 text-center font-semibold">Turnos</th>
                  <th className="px-3 py-2 text-right font-semibold">Horas</th>
                  <th className="px-3 py-2 text-right font-semibold">Promedio</th>
                  <th className="px-3 py-2 text-right font-semibold">Toneladas</th>
                  <th className="px-3 py-2 text-center font-semibold">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employeeHours.map((e, i) => {
                  const pct = totalEmployeeMinutes > 0
                    ? ((e.total_minutos / totalEmployeeMinutes) * 100).toFixed(1)
                    : "0.0";
                  return (
                    <tr key={e.id} className={i < 3 ? "bg-amber-50/50" : "hover:bg-slate-50"}>
                      <td className="px-3 py-2 text-slate-500">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900">{e.nombre}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-600">{e.turnos}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
                        {formatDuration(e.total_minutos)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {formatDuration(e.promedio_minutos_por_turno)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {e.total_toneladas.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-600">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Progress bar visualization */}
          <div className="mt-4 space-y-1.5">
            <p className="text-xs font-semibold uppercase text-slate-500">Distribución de horas</p>
            {employeeHours.slice(0, 10).map((e, i) => {
              const pct = totalEmployeeMinutes > 0
                ? (e.total_minutos / totalEmployeeMinutes) * 100
                : 0;
              return (
                <div key={e.id} className="flex items-center gap-2">
                  <span className="w-28 truncate text-xs text-slate-700 text-right">{e.nombre}</span>
                  <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        background: i < 3
                          ? "linear-gradient(90deg, #6C5CE7, #a78bfa)"
                          : "#cbd5e1",
                      }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs text-slate-500 tabular-nums">
                    {formatDuration(e.total_minutos)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
