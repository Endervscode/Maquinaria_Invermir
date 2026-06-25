"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Boxes,
  Weight,
  Activity,
  AlertTriangle,
  Camera,
  ClipboardCheck,
  TrendingUp,
  Award,
} from "lucide-react";
import { getAll } from "@/lib/indexeddb/db";
import { useClock, formatShortDateTime } from "@/hooks/use-clock";
import {
  ESTADO_LABELS,
  MINERAL_LABELS,
  type Maquinaria,
  type MaquinariaEstado,
  type Observacion,
  type RevisionTurno,
  type Turno,
} from "@/lib/types";
import { StatCard } from "@/components/shared/stat-card";
import { MineralBadge } from "@/components/shared/mineral-badge";
import { Card } from "@/components/ui/card";
import { isSameDay } from "@/lib/utils-shift";

const PIE_COLORS: Record<string, string> = {
  operativa: "#10b981",
  mantenimiento: "#f59e0b",
  critica: "#ef4444",
  fuera_de_servicio: "#78716c",
};

export function KpiTab() {
  const now = useClock(30000);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [maquinaria, setMaquinaria] = useState<Maquinaria[]>([]);
  const [observaciones, setObservaciones] = useState<Observacion[]>([]);
  const [revisiones, setRevisiones] = useState<RevisionTurno[]>([]);

  useEffect(() => {
    (async () => {
      setTurnos(await getAll<Turno>("turnos"));
      setMaquinaria(await getAll<Maquinaria>("maquinaria"));
      setObservaciones(await getAll<Observacion>("observaciones"));
      setRevisiones(await getAll<RevisionTurno>("revisiones_de_turnos"));
    })();
  }, []);

  // --- KPIs ---
  const today = new Date();
  const turnosHoy = turnos.filter((t) => isSameDay(t.fecha_inicio, today));
  const tarasHoy = turnosHoy.reduce((s, t) => s + (t.taras_moved || 0), 0);
  const toneladasHoy = turnosHoy.reduce((s, t) => s + (t.toneladas || 0), 0);
  const turnosActivos = turnos.filter((t) => t.estado === "activo").length;
  const maquinasCriticas = maquinaria.filter(
    (m) => m.estado === "critica" || m.horas_uso >= 1000
  ).length;
  const obsCount = observaciones.length;
  const porRevisar = revisiones.filter((r) => r.estado === "pendiente").length;

  // --- Line chart: toneladas per day (last 14 days) ---
  const toneladasPorDia = useMemo(() => {
    const days: { date: string; label: string; toneladas: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayTurnos = turnos.filter((t) => isSameDay(t.fecha_inicio, d));
      const tons = dayTurnos.reduce((s, t) => s + (t.toneladas || 0), 0);
      days.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit" }),
        toneladas: +tons.toFixed(2),
      });
    }
    return days;
  }, [turnos]);

  // --- Donut: machinery status ---
  const estadoMaquinaria = useMemo(() => {
    const counts: Record<MaquinariaEstado, number> = {
      operativa: 0,
      mantenimiento: 0,
      critica: 0,
      fuera_de_servicio: 0,
    };
    maquinaria.forEach((m) => {
      const estado: MaquinariaEstado = m.horas_uso >= 1000 ? "critica" : m.estado;
      counts[estado]++;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [maquinaria]);

  // --- Mineral breakdown today ---
  const mineralHoy = useMemo(() => {
    const initial: Record<string, number> = { grueso: 0, calibrado: 0, comercial: 0 };
    const m = { ...initial };
    turnosHoy.forEach((t) => {
      if (t.mineral_type) m[t.mineral_type] = (m[t.mineral_type] || 0) + (t.toneladas || 0);
    });
    return m;
  }, [turnosHoy]);

  // --- Top 5 employees (by toneladas last 30 days) ---
  const topEmpleados = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const byUser = new Map<string, { nombre: string; toneladas: number; turnos: number }>();
    turnos
      .filter((t) => new Date(t.fecha_inicio) >= cutoff && t.estado !== "activo")
      .forEach((t) => {
        const cur = byUser.get(t.usuario_id) || { nombre: t.usuario_nombre, toneladas: 0, turnos: 0 };
        cur.toneladas += t.toneladas || 0;
        cur.turnos += 1;
        byUser.set(t.usuario_id, cur);
      });
    return Array.from(byUser.entries())
      .map(([id, v]) => ({ id, ...v, toneladas: +v.toneladas.toFixed(2) }))
      .sort((a, b) => b.toneladas - a.toneladas)
      .slice(0, 5);
  }, [turnos]);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Taras hoy" value={tarasHoy} icon={Boxes} variant="purple" hint="4 taras = 1 ton" />
        <StatCard title="Toneladas hoy" value={toneladasHoy.toFixed(2)} icon={Weight} variant="emerald" hint={`${turnosHoy.length} turnos`} />
        <StatCard title="Turnos activos" value={turnosActivos} icon={Activity} variant="blue" hint="En progreso" />
        <StatCard title="Máquinas críticas" value={maquinasCriticas} icon={AlertTriangle} variant="rose" hint="≥1000h o estado crítico" />
        <StatCard title="Observaciones" value={obsCount} icon={Camera} variant="amber" hint="Total registradas" />
        <StatCard title="Por revisar" value={porRevisar} icon={ClipboardCheck} variant="stone" hint="Turnos incompletos" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Line chart */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <TrendingUp size={18} className="text-[#6C5CE7]" /> Toneladas por día
              </h3>
              <p className="subtitle-underline text-xs text-slate-500">Últimos 14 días</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={toneladasPorDia} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9e2f5" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e9e2f5",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="toneladas"
                stroke="#6C5CE7"
                strokeWidth={3}
                dot={{ r: 3, fill: "#6C5CE7" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Donut chart */}
        <Card className="p-5">
          <h3 className="mb-1 text-base font-bold text-slate-900">Estado de maquinaria</h3>
          <p className="subtitle-underline text-xs text-slate-500">{maquinaria.length} máquinas</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={estadoMaquinaria}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
              >
                {estadoMaquinaria.map((e) => (
                  <Cell key={e.name} fill={PIE_COLORS[e.name] || "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, n: string) => [v, ESTADO_LABELS[n as MaquinariaEstado] || n]}
                contentStyle={{ borderRadius: 12, border: "1px solid #e9e2f5", fontSize: 12 }}
              />
              <Legend
                formatter={(v) => ESTADO_LABELS[v as MaquinariaEstado] || v}
                wrapperStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Mineral breakdown today */}
        <Card className="p-5">
          <h3 className="mb-1 text-base font-bold text-slate-900">Desglose por mineral · hoy</h3>
          <p className="subtitle-underline text-xs text-slate-500">Toneladas producidas</p>
          <div className="mt-4 space-y-3">
            {(["grueso", "calibrado", "comercial"] as const).map((m) => {
              const tons = mineralHoy[m] || 0;
              const total = Object.values(mineralHoy).reduce((a, b) => a + b, 0) || 1;
              const pct = (tons / total) * 100;
              return (
                <div key={m}>
                  <div className="mb-1 flex items-center justify-between">
                    <MineralBadge type={m} size="sm" />
                    <span className="text-sm font-bold text-slate-900">{tons.toFixed(2)} ton</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background:
                          m === "grueso" ? "#78716c" : m === "calibrado" ? "#3b82f6" : "#10b981",
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-right text-[10px] text-slate-400">{pct.toFixed(1)}%</p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Top 5 employees */}
        <Card className="p-5">
          <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
            <Award size={18} className="text-amber-500" /> Top 5 empleados
          </h3>
          <p className="subtitle-underline text-xs text-slate-500">Por toneladas · últimos 30 días</p>
          <div className="mt-4 space-y-2">
            {topEmpleados.length === 0 && (
              <p className="text-sm text-slate-400">Sin datos suficientes</p>
            )}
            {topEmpleados.map((e, i) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${
                    i === 0
                      ? "bg-amber-100 text-amber-700"
                      : i === 1
                      ? "bg-slate-200 text-slate-700"
                      : i === 2
                      ? "bg-orange-100 text-orange-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{e.nombre}</p>
                  <p className="text-xs text-slate-500">{e.turnos} turnos</p>
                </div>
                <span className="text-sm font-bold text-[#6C5CE7]">{e.toneladas} ton</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
