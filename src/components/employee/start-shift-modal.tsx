"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/lib/auth/auth-context";
import { getAll, put, getByIndex } from "@/lib/indexeddb/db";
import { triggerSync } from "@/lib/sync/sync-manager";
import { uuid } from "@/lib/utils-shift";
import { JORNADA_DURACION, type JornadaType, type Localidad, type Maquinaria, type Turno } from "@/lib/types";
import { toast } from "sonner";
import { PlayCircle } from "lucide-react";

export function StartShiftModal({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStarted?: (t: Turno) => void;
}) {
  const { user } = useAuth();
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [maquinarias, setMaquinarias] = useState<Maquinaria[]>([]);
  const [localidadId, setLocalidadId] = useState("");
  const [maquinariaId, setMaquinariaId] = useState("");
  const [jornada, setJornada] = useState<JornadaType>("regular");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const locs = await getAll<Localidad>("localidades");
      setLocalidades(locs);
      // Only show operativa machinery
      const machines = await getAll<Maquinaria>("maquinaria");
      setMaquinarias(machines.filter((m) => m.estado === "operativa"));
    })();
  }, [open]);

  async function handleStart() {
    if (!user) return;
    if (!localidadId || !maquinariaId) {
      toast.error("Seleccione localidad y maquinaria");
      return;
    }
    const loc = localidades.find((l) => l.id === localidadId);
    const machine = maquinarias.find((m) => m.id === maquinariaId);
    if (!loc || !machine) return;

    // check there is no active shift for this user
    const active = await getByIndex<Turno>("turnos", "by-usuario", user.id);
    if (active.some((t) => t.estado === "activo")) {
      toast.error("Ya tiene un turno activo");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const turno: Turno = {
      id: uuid(),
      usuario_id: user.id,
      usuario_nombre: user.nombre,
      cedula: user.cedula,
      localidad_id: loc.id,
      localidad_nombre: loc.nombre,
      maquinaria_id: machine.id,
      maquinaria_serial: machine.serial,
      jornada,
      fecha_inicio: now,
      fecha_fin: null,
      mineral_type: null,
      taras_moved: 0,
      toneladas: 0,
      estado: "activo",
      razon_incompleto: null,
      duracion_minutos: null,
      duracion_esperada_minutos: JORNADA_DURACION[jornada],
      created_at: now,
      updated_at: now,
      synced: false,
    };
    await put("turnos", turno);
    triggerSync();
    setSaving(false);
    onOpenChange(false);
    setLocalidadId("");
    setMaquinariaId("");
    setJornada("regular");
    toast.success("Turno iniciado");
    onStarted?.(turno);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="text-[#6C5CE7]" size={20} /> Comenzar turno
          </DialogTitle>
          <DialogDescription>
            Seleccione el lugar, la maquinaria y el tipo de jornada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Localidad</Label>
            <Select value={localidadId} onValueChange={setLocalidadId}>
              <SelectTrigger><SelectValue placeholder="Seleccione localidad" /></SelectTrigger>
              <SelectContent>
                {localidades.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Maquinaria</Label>
            <Select value={maquinariaId} onValueChange={setMaquinariaId}>
              <SelectTrigger><SelectValue placeholder="Seleccione maquinaria" /></SelectTrigger>
              <SelectContent>
                {maquinarias.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.serial} · {m.marca} {m.modelo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Jornada</Label>
            <RadioGroup
              value={jornada}
              onValueChange={(v) => setJornada(v as JornadaType)}
              className="grid grid-cols-2 gap-3"
            >
              <Label
                htmlFor="j-reg"
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 has-[:checked]:border-[#6C5CE7] has-[:checked]:bg-[#F5F0FF]"
              >
                <RadioGroupItem id="j-reg" value="regular" />
                <div>
                  <p className="text-sm font-semibold">Regular</p>
                  <p className="text-xs text-slate-500">8 horas</p>
                </div>
              </Label>
              <Label
                htmlFor="j-ext"
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 has-[:checked]:border-[#6C5CE7] has-[:checked]:bg-[#F5F0FF]"
              >
                <RadioGroupItem id="j-ext" value="extraordinaria" />
                <div>
                  <p className="text-sm font-semibold">Extraordinaria</p>
                  <p className="text-xs text-slate-500">12 horas</p>
                </div>
              </Label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleStart} disabled={saving} style={{ background: "#6C5CE7" }}>
            {saving ? "Iniciando..." : "Comenzar turno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
