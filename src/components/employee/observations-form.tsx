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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { getAll, put } from "@/lib/indexeddb/db";
import { triggerSync } from "@/lib/sync/sync-manager";
import { uuid } from "@/lib/utils-shift";
import {
  type Maquinaria,
  type ObservationCategory,
  type Observacion,
} from "@/lib/types";
import { toast } from "sonner";
import { MessageSquareText, User, Wrench } from "lucide-react";

export function ObservationsForm({
  open,
  onOpenChange,
  turnoId,
  defaultMaquinariaId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  turnoId?: string | null;
  defaultMaquinariaId?: string | null;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const [maquinarias, setMaquinarias] = useState<Maquinaria[]>([]);
  const [maquinariaId, setMaquinariaId] = useState<string>(defaultMaquinariaId || "");
  const [categoria, setCategoria] = useState<ObservationCategory>("maquinaria");
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);

  // Load machinery list when opening
  useEffect(() => {
    getAll<Maquinaria>("maquinaria").then((m) => setMaquinarias(m));
  }, []);

  const isAboutMachine = categoria === "maquinaria";

  async function handleSave() {
    if (!user) return;
    if (!texto.trim()) {
      toast.error("Escriba la observación");
      return;
    }
    const machine = maquinarias.find((m) => m.id === maquinariaId);
    setSaving(true);
    const now = new Date().toISOString();
    const obs: Observacion = {
      id: uuid(),
      turno_id: turnoId || null,
      maquinaria_id: isAboutMachine ? (maquinariaId || null) : null,
      maquinaria_serial: isAboutMachine ? machine?.serial : undefined,
      usuario_id: user.id,
      usuario_nombre: user.nombre,
      categoria,
      texto: texto.trim(),
      created_at: now,
      updated_at: now,
      synced: false,
    };
    await put("observaciones", obs);
    triggerSync();
    setSaving(false);
    onOpenChange(false);
    setTexto("");
    toast.success("Observación registrada");
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="text-[#6C5CE7]" size={20} /> Nueva observación
          </DialogTitle>
          <DialogDescription>
            Registre una observación sobre la maquinaria o sobre el empleado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto scroll-thin pr-1">
          <div className="space-y-2">
            <Label>Tipo de observación</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCategoria("maquinaria")}
                className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left transition ${
                  categoria === "maquinaria"
                    ? "border-[#6C5CE7] bg-[#F5F0FF]"
                    : "border-slate-200 hover:border-[#6C5CE7]/40"
                }`}
              >
                <Wrench size={18} className={categoria === "maquinaria" ? "text-[#6C5CE7]" : "text-slate-400"} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Sobre maquinaria</p>
                  <p className="text-xs text-slate-500">Problemas técnicos, averías, etc.</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setCategoria("empleado")}
                className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left transition ${
                  categoria === "empleado"
                    ? "border-[#6C5CE7] bg-[#F5F0FF]"
                    : "border-slate-200 hover:border-[#6C5CE7]/40"
                }`}
              >
                <User size={18} className={categoria === "empleado" ? "text-[#6C5CE7]" : "text-slate-400"} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Sobre empleado</p>
                  <p className="text-xs text-slate-500">Condiciones laborales, novedades, etc.</p>
                </div>
              </button>
            </div>
          </div>

          {isAboutMachine && (
            <div className="space-y-2">
              <Label>Maquinaria (opcional)</Label>
              <Select value={maquinariaId} onValueChange={setMaquinariaId}>
                <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                <SelectContent>
                  {maquinarias.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.serial} · {m.marca} {m.modelo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="obs-text">Descripción</Label>
            <Textarea
              id="obs-text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={isAboutMachine ? "Describa el problema o novedad de la maquinaria..." : "Describa la novedad o condición del empleado..."}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} style={{ background: "#6C5CE7" }}>
            {saving ? "Guardando..." : "Guardar observación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
