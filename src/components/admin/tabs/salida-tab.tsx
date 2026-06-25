"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { getAll, put, getOne, remove } from "@/lib/indexeddb/db";
import { triggerSync } from "@/lib/sync/sync-manager";
import { uuid } from "@/lib/utils-shift";
import type { Maquinaria, Salida } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { PackageMinus, Search, ChevronRight } from "lucide-react";
import { formatShortDateTime } from "@/hooks/use-clock";
import { ESTADO_LABELS, ESTADO_BADGE } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SalidaTab() {
  const { user } = useAuth();
  const [maquinas, setMaquinas] = useState<Maquinaria[]>([]);
  const [salidas, setSalidas] = useState<Salida[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Maquinaria | null>(null);
  const [salidaOpen, setSalidaOpen] = useState(false);
  const [razon, setRazon] = useState("");
  const [saving, setSaving] = useState(false);
  const [razonError, setRazonError] = useState<string | undefined>(undefined);

  const refresh = async () => {
    const m = await getAll<Maquinaria>("maquinaria");
    setMaquinas(m.filter((x) => x.estado !== "fuera_de_servicio"));
    const s = await getAll<Salida>("salidas");
    setSalidas(s.sort((a, b) => b.fecha.localeCompare(a.fecha)));
  };
  useEffect(() => { refresh(); }, []);

  const filtered = maquinas.filter((m) =>
    !search ||
    m.serial.toLowerCase().includes(search.toLowerCase()) ||
    m.marca.toLowerCase().includes(search.toLowerCase()) ||
    m.modelo.toLowerCase().includes(search.toLowerCase())
  );

  function validateRazon(value: string): string | undefined {
    if (!value.trim()) return "La razón de salida es obligatoria";
    if (value.trim().length < 3) return "La razón debe tener al menos 3 caracteres";
    return undefined;
  }

  async function handleSalida() {
    if (!user || !selected) return;
    const err = validateRazon(razon);
    if (err) { setRazonError(err); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const salida: Salida = {
      id: uuid(),
      maquinaria_id: selected.id,
      maquinaria_serial: selected.serial,
      razon: razon.trim(),
      fecha: today,
      created_at: now,
      updated_at: now,
      synced: false,
    };
    await put("salidas", salida);

    const updatedMachine: Maquinaria = {
      ...selected,
      estado: "fuera_de_servicio",
      fecha_salida: today,
      updated_at: now,
      synced: false,
    };
    await put("maquinaria", updatedMachine);

    triggerSync();
    setSaving(false);
    setSalidaOpen(false);
    setRazon("");
    setSelected(null);
    toast.success("Salida registrada");
    refresh();
  }

  function openSalida(m: Maquinaria) {
    setSelected(m);
    setRazon("");
    setRazonError(undefined);
    setSalidaOpen(true);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* Machines list */}
      <Card className="p-5 lg:col-span-3">
        <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
          <PackageMinus size={18} className="text-rose-600" /> Maquinaria disponible
        </h3>
        <p className="subtitle-underline text-xs text-slate-500">Seleccione para registrar salida</p>

        <div className="relative mt-4 mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input
            placeholder="Buscar por serial, marca o modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto scroll-thin">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No hay maquinaria disponible</p>
          ) : (
            filtered.map((m) => {
              const estado = m.horas_uso >= 1000 ? "critica" : m.estado;
              const cfg = ESTADO_BADGE[estado];
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:border-[#6C5CE7]/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900">{m.serial}</p>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", cfg.bg, cfg.text)}>
                        {ESTADO_LABELS[estado]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{m.marca} {m.modelo} · {m.horas_uso}h uso</p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => openSalida(m)}
                  >
                    SALIDA <ChevronRight size={14} className="ml-1" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Salidas history */}
      <Card className="p-5 lg:col-span-2">
        <h3 className="mb-1 text-base font-bold text-slate-900">Salidas recientes</h3>
        <p className="subtitle-underline text-xs text-slate-500">{salidas.length} movimientos</p>

        <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto scroll-thin">
          {salidas.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No hay salidas registradas</p>
          ) : (
            salidas.map((s) => (
              <div key={s.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-bold text-slate-900">{s.maquinaria_serial}</p>
                <p className="text-xs text-slate-600">{s.razon}</p>
                <p className="mt-1 text-xs text-slate-400">{formatShortDateTime(s.fecha)}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Salida dialog */}
      <Dialog open={salidaOpen} onOpenChange={setSalidaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <PackageMinus size={20} /> Confirmar salida
            </DialogTitle>
            <DialogDescription>
              Está por registrar la salida de la maquinaria{" "}
              <strong>{selected?.serial}</strong> ({selected?.marca} {selected?.modelo}).
              Esta acción pondrá la máquina como fuera de servicio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="razon-salida" className={cn(razonError && "text-rose-600")}>Razón de la salida *</Label>
            <Textarea
              id="razon-salida"
              value={razon}
              onChange={(e) => {
                setRazon(e.target.value);
                if (razonError) setRazonError(validateRazon(e.target.value));
              }}
              onBlur={(e) => {
                const val = e.currentTarget.value;
                setRazonError(validateRazon(val));
              }}
              placeholder="Ej: Venta, devolución, baja, préstamo..."
              rows={3}
              className={cn(razonError && "border-rose-400 ring-rose-200 focus-visible:ring-rose-300")}
            />
            {razonError && (
              <p className="flex items-center gap-1 text-xs text-rose-600">
                <span>⚠</span> {razonError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalidaOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalida} disabled={saving || (razon.trim().length > 0 && razonError ? true : false) || !razon.trim()} className="bg-rose-600 hover:bg-rose-700">
              {saving ? "Procesando..." : "Confirmar salida"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
