"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { getAll, put } from "@/lib/indexeddb/db";
import { triggerSync } from "@/lib/sync/sync-manager";
import { uuid } from "@/lib/utils-shift";
import type { Entrada, Localidad, Maquinaria } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MapPin, Truck, History, Send } from "lucide-react";
import { formatShortDateTime } from "@/hooks/use-clock";
import { cn } from "@/lib/utils";

export function EntradaTab() {
  const { user } = useAuth();
  const [maquinarias, setMaquinarias] = useState<Maquinaria[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [maquinariaId, setMaquinariaId] = useState("");
  const [localidadId, setLocalidadId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ maquinaria?: string; localidad?: string }>({});
  const [touched, setTouched] = useState<{ maquinaria?: boolean; localidad?: boolean }>({});

  const refresh = async () => {
    setMaquinarias(await getAll<Maquinaria>("maquinaria"));
    setLocalidades(await getAll<Localidad>("localidades"));
    const all = await getAll<Entrada>("entradas");
    setEntradas(all.sort((a, b) => b.fecha.localeCompare(a.fecha)));
  };
  useEffect(() => { refresh(); }, []);

  function validateField(field: "maquinaria" | "localidad", value: string): string | undefined {
    if (!value) return field === "maquinaria" ? "Seleccione una maquinaria" : "Seleccione una localidad";
    return undefined;
  }

  function validateForm(): boolean {
    const maqErr = validateField("maquinaria", maquinariaId);
    const locErr = validateField("localidad", localidadId);
    setErrors({ maquinaria: maqErr, localidad: locErr });
    setTouched({ maquinaria: true, localidad: true });
    return !maqErr && !locErr;
  }

  const selectedMachine = maquinarias.find((m) => m.id === maquinariaId);
  const selectedLocation = localidades.find((l) => l.id === localidadId);
  const canSubmit = maquinariaId && localidadId;

  async function handleSave() {
    if (!user) return;
    if (!validateForm()) return;
    setSaving(true);
    const now = new Date().toISOString();

    const entrada: Entrada = {
      id: uuid(),
      maquinaria_id: maquinariaId,
      maquinaria_serial: selectedMachine!.serial,
      localidad_id: localidadId,
      localidad_nombre: selectedLocation!.nombre,
      fecha,
      nota: nota.trim() || undefined,
      created_at: now,
      updated_at: now,
      synced: false,
    };
    await put("entradas", entrada);
    triggerSync();
    setSaving(false);
    setMaquinariaId("");
    setLocalidadId("");
    setFecha(new Date().toISOString().slice(0, 10));
    setNota("");
    setErrors({});
    setTouched({});
    toast.success(`Asignación registrada: ${selectedMachine!.serial} → ${selectedLocation!.nombre}`);
    refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* Form */}
      <Card className="p-5 lg:col-span-2">
        <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
          <Send size={18} className="text-[#6C5CE7]" /> Asignar maquinaria a ubicación
        </h3>
        <p className="subtitle-underline text-xs text-slate-500">
          Registre dónde irá a trabajar cada máquina
        </p>

        <div className="mt-4 space-y-4">
          {/* Machine selector */}
          <div className="space-y-1">
            <Label className={cn(errors.maquinaria && "text-rose-600")}>
              <Truck size={14} className="inline mr-1" /> Maquinaria *
            </Label>
            <Select
              value={maquinariaId}
              onValueChange={(v) => {
                setMaquinariaId(v);
                if (touched.maquinaria) setErrors((prev) => ({ ...prev, maquinaria: validateField("maquinaria", v) }));
              }}
              onOpenChange={(open) => {
                if (!open && touched.maquinaria) {
                  setErrors((prev) => ({ ...prev, maquinaria: validateField("maquinaria", maquinariaId) }));
                }
                if (open) setTouched((prev) => ({ ...prev, maquinaria: true }));
              }}
            >
              <SelectTrigger
                className={cn(errors.maquinaria && "border-rose-400 ring-rose-200 focus-visible:ring-rose-300")}
              >
                <SelectValue placeholder="Seleccione maquinaria" />
              </SelectTrigger>
              <SelectContent>
                {maquinarias.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.serial} · {m.marca} {m.modelo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.maquinaria && (
              <p className="flex items-center gap-1 text-xs text-rose-600">
                <span>⚠</span> {errors.maquinaria}
              </p>
            )}
            {selectedMachine && (
              <p className="text-xs text-slate-400">
                {selectedMachine.descripcion || `${selectedMachine.marca} ${selectedMachine.modelo}`}
              </p>
            )}
          </div>

          {/* Location selector */}
          <div className="space-y-1">
            <Label className={cn(errors.localidad && "text-rose-600")}>
              <MapPin size={14} className="inline mr-1" /> Ubicación de trabajo *
            </Label>
            <Select
              value={localidadId}
              onValueChange={(v) => {
                setLocalidadId(v);
                if (touched.localidad) setErrors((prev) => ({ ...prev, localidad: validateField("localidad", v) }));
              }}
              onOpenChange={(open) => {
                if (!open && touched.localidad) {
                  setErrors((prev) => ({ ...prev, localidad: validateField("localidad", localidadId) }));
                }
                if (open) setTouched((prev) => ({ ...prev, localidad: true }));
              }}
            >
              <SelectTrigger
                className={cn(errors.localidad && "border-rose-400 ring-rose-200 focus-visible:ring-rose-300")}
              >
                <SelectValue placeholder="Seleccione ubicación" />
              </SelectTrigger>
              <SelectContent>
                {localidades.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.localidad && (
              <p className="flex items-center gap-1 text-xs text-rose-600">
                <span>⚠</span> {errors.localidad}
              </p>
            )}
          </div>

          {/* Date */}
          <div className="space-y-1">
            <Label>Fecha de asignación</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>

          {/* Note */}
          <div className="space-y-1">
            <Label>Nota (opcional)</Label>
            <Textarea
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: Trabajará en la extracción de material grueso..."
            />
          </div>

          {/* Summary preview */}
          {selectedMachine && selectedLocation && (
            <div className="rounded-lg bg-[#F5F0FF] p-3 text-sm">
              <p className="font-semibold text-slate-900">Resumen de asignación</p>
              <p className="mt-1 text-xs text-slate-600">
                <Truck size={12} className="inline mr-1" /> {selectedMachine.serial}
              </p>
              <p className="text-xs text-slate-600">
                <MapPin size={12} className="inline mr-1" /> {selectedLocation.nombre}
              </p>
              <p className="text-xs text-slate-600">
                📅 {new Date(fecha).toLocaleDateString("es-VE")}
              </p>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving || !canSubmit} className="w-full" style={{ background: "#6C5CE7" }}>
            {saving ? "Guardando..." : "Registrar asignación"}
          </Button>
        </div>
      </Card>

      {/* History */}
      <Card className="p-5 lg:col-span-3">
        <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
          <History size={18} className="text-[#6C5CE7]" /> Historial de asignaciones
        </h3>
        <p className="subtitle-underline text-xs text-slate-500">{entradas.length} movimientos</p>

        <div className="mt-4 max-h-[60vh] overflow-y-auto scroll-thin">
          {entradas.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No hay asignaciones registradas</p>
          ) : (
            <div className="space-y-2">
              {entradas.map((e) => (
                <div key={e.id} className="rounded-lg border border-slate-200 p-3 hover:border-[#6C5CE7]/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Truck size={14} className="text-[#6C5CE7]" />
                        <p className="text-sm font-bold text-slate-900">{e.maquinaria_serial}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <MapPin size={12} className="text-emerald-600" />
                        <p className="text-xs font-medium text-slate-700">{e.localidad_nombre}</p>
                      </div>
                      {e.nota && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{e.nota}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatShortDateTime(e.fecha)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
