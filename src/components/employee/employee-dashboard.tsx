"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useClock, formatShortDateTime, formatDuration } from "@/hooks/use-clock";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { getAll, getByIndex, put, getOne } from "@/lib/indexeddb/db";
import { triggerSync } from "@/lib/sync/sync-manager";
import { uuid, validateShift } from "@/lib/utils-shift";
import type { Localidad, Maquinaria, Turno, Observacion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  LogOut,
  Wifi,
  WifiOff,
  Play,
  Square,
  MessageSquareText,
  History,
  Clock,
  User as UserIcon,
  AlertTriangle,
} from "lucide-react";
import { StartShiftModal } from "./start-shift-modal";
import { EndShiftModal } from "./end-shift-modal";
import { ObservationsForm } from "./observations-form";
import { MineralBadge } from "@/components/shared/mineral-badge";
import { cn } from "@/lib/utils";

const STATUS_CFG: Record<string, { label: string; bg: string; text: string }> = {
  activo: { label: "Trabajando", bg: "bg-emerald-100", text: "text-emerald-700" },
  completo: { label: "Completo", bg: "bg-emerald-100", text: "text-emerald-700" },
  incompleto: { label: "Incompleto", bg: "bg-rose-100", text: "text-rose-700" },
  con_horas_extra: { label: "Con horas extra", bg: "bg-amber-100", text: "text-amber-700" },
};

export function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const now = useClock();
  const online = useOnlineStatus();
  const [activeTurno, setActiveTurno] = useState<Turno | null>(null);
  const [history, setHistory] = useState<Turno[]>([]);
  const [observations, setObservations] = useState<Observacion[]>([]);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [obsOpen, setObsOpen] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const all = await getByIndex<Turno>("turnos", "by-usuario", user.id);
    const sorted = all.sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio));
    const active = sorted.find((t) => t.estado === "activo") || null;
    setActiveTurno(active);
    setHistory(sorted);
    const obs = await getByIndex<Observacion>("observaciones", "by-maquinaria", "");
    // Filter observations by user
    const userObs = (await getAll<Observacion>("observaciones")).filter((o) => o.usuario_id === user.id);
    setObservations(userObs);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live elapsed time + preview status
  useEffect(() => {
    if (!activeTurno) {
      setElapsed("");
      setPreviewStatus(null);
      return;
    }
    const start = new Date(activeTurno.fecha_inicio).getTime();
    const diff = now.getTime() - start;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    setElapsed(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    const v = validateShift(activeTurno.fecha_inicio, now.toISOString(), activeTurno.jornada);
    setPreviewStatus(v.status);
  }, [now, activeTurno]);

  return (
    <div className="min-h-screen bg-[#F5F0FF]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-purple-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "#6C5CE7" }}>
              <UserIcon className="text-white" size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{user?.nombre}</p>
              <p className="text-xs text-slate-500">C.I. {user?.cedula}</p>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <div className="rounded-xl bg-slate-100 px-4 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Hora</p>
              <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                {now.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
              </p>
            </div>
            <div className="rounded-xl bg-slate-100 px-4 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Fecha</p>
              <p className="text-sm font-semibold text-slate-900 capitalize">
                {now.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1">
              <span className={cn("h-2 w-2 rounded-full", online ? "bg-emerald-500" : "bg-rose-500")} />
              <span className="text-xs font-medium text-slate-600">
                {online ? <Wifi size={12} className="inline" /> : <WifiOff size={12} className="inline" />}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">
              <LogOut size={16} className="mr-1" /> Salir
            </Button>
          </div>
        </div>
        {/* Mobile clock */}
        <div className="border-t border-slate-100 px-4 py-2 md:hidden">
          <p className="text-center font-mono text-base font-bold text-slate-900 tabular-nums">
            {now.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Status banner */}
        <Card className="mb-6 overflow-hidden border-0 shadow-md">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
            style={{ background: activeTurno ? "linear-gradient(135deg, #6C5CE7 0%, #5a4bd1 100%)" : "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)" }}>
            <div className="text-white">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/80">
                Estado actual
              </p>
              <p className="mt-1 text-3xl font-black">
                {activeTurno ? "Trabajando" : "No trabajando"}
              </p>
              {activeTurno && (
                <p className="mt-1 text-sm text-white/85">
                  {activeTurno.maquinaria_serial} · {activeTurno.localidad_nombre}
                </p>
              )}
            </div>
            {activeTurno && (
              <div className="text-right text-white">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Tiempo transcurrido</p>
                <p className="font-mono text-3xl font-black tabular-nums">{elapsed}</p>
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
                  {activeTurno.jornada === "regular" ? "Regular · 8h" : "Extraordinaria · 12h"}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Action buttons */}
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {!activeTurno ? (
            <Button
              onClick={() => setStartOpen(true)}
              className="h-16 text-base font-semibold"
              style={{ background: "#6C5CE7" }}
            >
              <Play size={22} className="mr-2" /> Comenzar turno
            </Button>
          ) : (
            <Button
              onClick={() => setEndOpen(true)}
              className="h-16 bg-rose-600 text-base font-semibold hover:bg-rose-700"
            >
              <Square size={20} className="mr-2" /> Terminar turno
            </Button>
          )}
          <Button
            onClick={() => setObsOpen(true)}
            variant="outline"
            className="h-16 border-2 text-base font-semibold"
            style={{ borderColor: "#6C5CE7", color: "#6C5CE7" }}
          >
            <MessageSquareText size={22} className="mr-2" /> Nueva observación
          </Button>
          <div className="grid h-16 place-items-center rounded-xl border-2 border-dashed border-slate-300 text-center">
            <div>
              <p className="text-xs text-slate-500">Jornada</p>
              <p className="text-sm font-bold capitalize text-slate-700">
                {activeTurno?.jornada || "—"} {activeTurno && `· ${activeTurno.duracion_esperada_minutos / 60}h`}
              </p>
            </div>
          </div>
        </div>

        {/* Active shift warning */}
        {activeTurno && previewStatus && previewStatus !== "activo" && (
          <div className={cn(
            "mb-6 flex items-center gap-3 rounded-xl border p-4 text-sm",
            previewStatus === "completo" && "border-emerald-200 bg-emerald-50 text-emerald-700",
            previewStatus === "con_horas_extra" && "border-amber-200 bg-amber-50 text-amber-700",
            previewStatus === "incompleto" && "border-rose-200 bg-rose-50 text-rose-700"
          )}>
            <AlertTriangle size={18} />
            <span>
              {previewStatus === "completo" && "Ha completado la duración mínima del turno. Puede cerrar el turno."}
              {previewStatus === "con_horas_extra" && "Está trabajando horas extra. Considere cerrar el turno."}
              {previewStatus === "incompleto" && "Si cierra ahora, el turno se marcará como incompleto y se enviará a revisión."}
            </span>
          </div>
        )}

        {/* History */}
        <div className="mb-3 flex items-center gap-2">
          <History size={18} className="text-[#6C5CE7]" />
          <h2 className="text-lg font-bold text-slate-900">Historial de turnos</h2>
        </div>

        <Card className="overflow-hidden border-purple-100">
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F0FF] text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Inicio</th>
                  <th className="px-3 py-2 text-left font-semibold">Fin</th>
                  <th className="px-3 py-2 text-left font-semibold">Localidad</th>
                  <th className="px-3 py-2 text-left font-semibold">Maquinaria</th>
                  <th className="px-3 py-2 text-left font-semibold">Jornada</th>
                  <th className="px-3 py-2 text-center font-semibold">Mineral</th>
                  <th className="px-3 py-2 text-right font-semibold">Taras</th>
                  <th className="px-3 py-2 text-right font-semibold">Toneladas</th>
                  <th className="px-3 py-2 text-center font-semibold">Cumplimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                      No hay turnos registrados
                    </td>
                  </tr>
                )}
                {history.map((t) => {
                  const cfg = STATUS_CFG[t.estado] || { label: t.estado, bg: "bg-slate-100", text: "text-slate-700" };
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700">{formatShortDateTime(t.fecha_inicio)}</td>
                      <td className="px-3 py-2 text-slate-700">{t.fecha_fin ? formatShortDateTime(t.fecha_fin) : "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{t.localidad_nombre}</td>
                      <td className="px-3 py-2 text-slate-700">{t.maquinaria_serial}</td>
                      <td className="px-3 py-2 capitalize text-slate-700">{t.jornada}</td>
                      <td className="px-3 py-2 text-center">
                        {t.mineral_type ? <MineralBadge type={t.mineral_type} size="sm" /> : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{t.taras_moved || 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{t.toneladas?.toFixed(2) || "0.00"}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", cfg.bg, cfg.text)}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent observations */}
        <div className="mt-8 mb-3 flex items-center gap-2">
          <MessageSquareText size={18} className="text-[#6C5CE7]" />
          <h2 className="text-lg font-bold text-slate-900">Observaciones recientes</h2>
        </div>
        {observations.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-400">
            No ha registrado observaciones
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {observations.slice(0, 6).map((o) => (
                  <Card key={o.id} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-full bg-[#F5F0FF] px-2 py-0.5 text-xs font-semibold capitalize text-[#6C5CE7]">
                    {o.categoria}
                  </span>
                  <span className="text-xs text-slate-400">{formatShortDateTime(o.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700 line-clamp-3">{o.texto}</p>

              </Card>
            ))}
          </div>
        )}
      </main>

      <StartShiftModal open={startOpen} onOpenChange={setStartOpen} onStarted={() => refresh()} />
      <EndShiftModal
        open={endOpen}
        onOpenChange={setEndOpen}
        turno={activeTurno}
        onEnded={() => refresh()}
      />
      <ObservationsForm
        open={obsOpen}
        onOpenChange={setObsOpen}
        turnoId={activeTurno?.id}
        defaultMaquinariaId={activeTurno?.maquinaria_id}
        onSaved={() => refresh()}
      />
    </div>
  );
}
