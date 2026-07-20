"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { getAll, put, remove, getOne, getByIndex } from "@/lib/indexeddb/db";
import { triggerSync } from "@/lib/sync/sync-manager";
import { uuid } from "@/lib/utils-shift";
import {
  ESTADO_LABELS,
  ESTADO_BADGE,
  type Localidad,
  type Maquinaria,
  type MaquinariaEstado,
  type MantenimientoProgramado,
  type Observacion,
  type RegistroAuditoria,
} from "@/lib/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  MapPin,
  Plus,
  Trash2,
  Pencil,
  Wrench,
  CalendarClock,
  MessageSquareText,
  AlertTriangle,
  CheckCircle2,
  Truck,
} from "lucide-react";
import { formatShortDateTime } from "@/hooks/use-clock";
import { cn } from "@/lib/utils";

export function MaquinariaTab() {
  return (
    <Tabs defaultValue="ubicaciones">
      <TabsList className="mb-4 grid w-full grid-cols-2 sm:grid-cols-5">
        <TabsTrigger value="ubicaciones">Ubicaciones</TabsTrigger>
        <TabsTrigger value="registro">Registrar</TabsTrigger>
        <TabsTrigger value="alertas">Alertas</TabsTrigger>
        <TabsTrigger value="calendario">Calendario</TabsTrigger>
        <TabsTrigger value="observaciones">Observaciones</TabsTrigger>
      </TabsList>

      <TabsContent value="ubicaciones"><UbicacionesPanel /></TabsContent>
      <TabsContent value="registro"><RegistroPanel /></TabsContent>
      <TabsContent value="alertas"><AlertasPanel /></TabsContent>
      <TabsContent value="calendario"><CalendarioPanel /></TabsContent>
      <TabsContent value="observaciones"><ObservacionesPanel /></TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Ubicaciones (Localidades CRUD)
// ---------------------------------------------------------------------------
function UbicacionesPanel() {
  const { user } = useAuth();
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Localidad | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Localidad | null>(null);
  const [nombreError, setNombreError] = useState<string | undefined>(undefined);
  const [nombreTouched, setNombreTouched] = useState(false);

  const refresh = async () => setLocalidades(await getAll<Localidad>("localidades"));
  useEffect(() => { refresh(); }, []);

  function validateNombre(value: string): string | undefined {
    if (!value.trim()) return "El nombre de la ubicación es obligatorio";
    if (value.trim().length < 2) return "El nombre debe tener al menos 2 caracteres";
    return undefined;
  }

  function openNew() {
    setEditing(null); setNombre(""); setDescripcion(""); setNombreError(undefined); setNombreTouched(false); setOpen(true);
  }
  function openEdit(l: Localidad) {
    setEditing(l); setNombre(l.nombre); setDescripcion(l.descripcion || ""); setNombreError(undefined); setNombreTouched(false); setOpen(true);
  }

  async function save() {
    if (!user) return;
    const err = validateNombre(nombre);
    setNombreError(err);
    setNombreTouched(true);
    if (err) return;
    const now = new Date().toISOString();
    if (editing) {
      const updated: Localidad = { ...editing, nombre: nombre.trim(), descripcion: descripcion.trim(), updated_at: now, synced: false };
      await put("localidades", updated);
      await put("registro_de_auditoria", {
        id: uuid(), usuario_id: user.id, usuario_nombre: user.nombre,
        accion: "actualizar_ubicacion", detalle: `Actualizó ubicación ${nombre}`,
        entidad_id: editing.id, created_at: now, synced: false,
      });
    } else {
      const loc: Localidad = {
        id: uuid(), nombre: nombre.trim(), descripcion: descripcion.trim(),
        created_at: now, updated_at: now, synced: false,
      };
      await put("localidades", loc);
      await put("registro_de_auditoria", {
        id: uuid(), usuario_id: user.id, usuario_nombre: user.nombre,
        accion: "crear_ubicacion", detalle: `Creó ubicación ${nombre}`,
        entidad_id: loc.id, created_at: now, synced: false,
      });
    }
    triggerSync();
    setOpen(false);
    toast.success(editing ? "Ubicación actualizada" : "Ubicación creada");
    refresh();
  }

  async function confirmDelete() {
    if (!user || !deleteTarget) return;
    await remove("localidades", deleteTarget.id);
    await put("registro_de_auditoria", {
      id: uuid(), usuario_id: user.id, usuario_nombre: user.nombre,
      accion: "eliminar_ubicacion", detalle: `Eliminó ubicación ${deleteTarget.nombre}`,
      entidad_id: deleteTarget.id, created_at: new Date().toISOString(), synced: false,
    });
    triggerSync();
    setDeleteTarget(null);
    toast.success("Ubicación eliminada");
    refresh();
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <MapPin size={18} className="text-[#6C5CE7]" /> Gestión de localidades
          </h3>
          <p className="subtitle-underline text-xs text-slate-500">{localidades.length} ubicaciones</p>
        </div>
        <Button onClick={openNew} size="sm" style={{ background: "#6C5CE7" }}>
          <Plus size={16} className="mr-1" /> Nueva
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {localidades.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-slate-400">No hay localidades</p>
        )}
        {localidades.map((l) => (
          <div key={l.id} className="rounded-xl border border-slate-200 p-3 hover:border-[#6C5CE7]/40">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{l.nombre}</p>
                {l.descripcion && <p className="text-xs text-slate-500 line-clamp-2">{l.descripcion}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(l)} className="rounded p-1 hover:bg-slate-100">
                  <Pencil size={14} className="text-slate-500" />
                </button>
                <button onClick={() => setDeleteTarget(l)} className="rounded p-1 hover:bg-rose-50">
                  <Trash2 size={14} className="text-rose-500" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Save dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar ubicación" : "Nueva ubicación"}</DialogTitle>
            <DialogDescription>Registre una localidad de operación.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className={cn(nombreError && "text-rose-600")}>Nombre *</Label>
              <Input
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  if (nombreTouched) setNombreError(validateNombre(e.target.value));
                }}
                onBlur={(e) => {
                  setNombreTouched(true);
                  setNombreError(validateNombre(e.currentTarget.value));
                }}
                className={cn(nombreError && "border-rose-400 ring-rose-200 focus-visible:ring-rose-300")}
              />
              {nombreError && (
                <p className="flex items-center gap-1 text-xs text-rose-600">
                  <span>⚠</span> {nombreError}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Descripción</Label>
              <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} style={{ background: "#6C5CE7" }}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar ubicación?</DialogTitle>
            <DialogDescription>
              Se eliminará <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button onClick={confirmDelete} className="bg-rose-600 hover:bg-rose-700">Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Registrar / Eliminar maquinaria
// ---------------------------------------------------------------------------
function RegistroPanel() {
  const { user } = useAuth();
  const [maquinas, setMaquinas] = useState<Maquinaria[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Maquinaria | null>(null);
  const [editHorasTarget, setEditHorasTarget] = useState<Maquinaria | null>(null);
  const [horasInput, setHorasInput] = useState(0);

  // new machine form
  const [serial, setSerial] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [modelo, setModelo] = useState("");
  const [marca, setMarca] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [horas, setHoras] = useState(0);
  const [localidadId, setLocalidadId] = useState("");
  const [serialError, setSerialError] = useState<string | undefined>(undefined);
  const [serialTouched, setSerialTouched] = useState(false);

  const refresh = async () => {
    setMaquinas(await getAll<Maquinaria>("maquinaria"));
    setLocalidades(await getAll<Localidad>("localidades"));
  };
  useEffect(() => { refresh(); }, []);

  function validateSerial(value: string): string | undefined {
    if (!value.trim()) return "El serial es obligatorio";
    if (value.trim().length < 2) return "El serial debe tener al menos 2 caracteres";
    return undefined;
  }

  async function addMachine() {
    if (!user) return;
    const err = validateSerial(serial);
    setSerialError(err);
    setSerialTouched(true);
    if (err) return;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const m: Maquinaria = {
      id: uuid(),
      serial: serial.trim(),
      descripcion: descripcion.trim(),
      modelo: modelo.trim(),
      marca: marca.trim(),
      cantidad: Number(cantidad) || 1,
      horas_uso: Number(horas) || 0,
      estado: "operativa",
      localidad_id: localidadId || null,
      fecha_entrada: today,
      fecha_salida: null,
      created_at: now,
      updated_at: now,
      synced: false,
    };
    await put("maquinaria", m);
    triggerSync();
    setSerial(""); setDescripcion(""); setModelo(""); setMarca(""); setCantidad(1); setHoras(0); setLocalidadId("");
    toast.success("Maquinaria registrada");
    refresh();
  }

  async function confirmDelete() {
    if (!user || !deleteTarget) return;
    await remove("maquinaria", deleteTarget.id);
    await put("registro_de_auditoria", {
      id: uuid(), usuario_id: user.id, usuario_nombre: user.nombre,
      accion: "eliminar_maquinaria", detalle: `Eliminó maquinaria ${deleteTarget.serial}`,
      entidad_id: deleteTarget.id, created_at: new Date().toISOString(), synced: false,
    });
    triggerSync();
    setDeleteTarget(null);
    toast.success("Maquinaria eliminada");
    refresh();
  }

  async function saveHoras() {
    if (!user || !editHorasTarget) return;
    const updated: Maquinaria = {
      ...editHorasTarget,
      horas_uso: Number(horasInput) || 0,
      estado: Number(horasInput) >= 1000 ? "critica" : Number(horasInput) >= 900 ? "mantenimiento" : editHorasTarget.estado,
      updated_at: new Date().toISOString(),
      synced: false,
    };
    await put("maquinaria", updated);
    await put("registro_de_auditoria", {
      id: uuid(), usuario_id: user.id, usuario_nombre: user.nombre,
      accion: "editar_horas_maquinaria", detalle: `Editó horas de ${editHorasTarget.serial} a ${horasInput}h`,
      entidad_id: editHorasTarget.id, created_at: new Date().toISOString(), synced: false,
    });
    triggerSync();
    setEditHorasTarget(null);
    toast.success("Horas actualizadas");
    refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* New machine form */}
      <Card className="p-5 lg:col-span-2">
        <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
          <Truck size={18} className="text-[#6C5CE7]" /> Registrar maquinaria
        </h3>
        <p className="subtitle-underline text-xs text-slate-500">Complete los datos del equipo</p>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label className={cn(serialError && "text-rose-600")}>Serial *</Label>
            <Input
              value={serial}
              onChange={(e) => {
                setSerial(e.target.value);
                if (serialTouched) setSerialError(validateSerial(e.target.value));
              }}
              onBlur={(e) => {
                setSerialTouched(true);
                setSerialError(validateSerial(e.currentTarget.value));
              }}
              placeholder="MQ-001"
              className={cn(serialError && "border-rose-400 ring-rose-200 focus-visible:ring-rose-300")}
            />
            {serialError && (
              <p className="flex items-center gap-1 text-xs text-rose-600">
                <span>⚠</span> {serialError}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Marca</Label>
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Modelo</Label>
              <Input value={modelo} onChange={(e) => setModelo(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Cantidad</Label>
              <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Horas de uso</Label>
              <Input type="number" min={0} value={horas} onChange={(e) => setHoras(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Localidad</Label>
            <Select value={localidadId} onValueChange={setLocalidadId}>
              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>
                {localidades.map((l) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Descripción</Label>
            <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <Button onClick={addMachine} disabled={serialError ? true : false} className="w-full" style={{ background: "#6C5CE7" }}>
            <Plus size={16} className="mr-1" /> Registrar
          </Button>
        </div>
      </Card>

      {/* Machine list */}
      <Card className="p-5 lg:col-span-3">
        <h3 className="mb-1 text-base font-bold text-slate-900">Maquinaria registrada</h3>
        <p className="subtitle-underline text-xs text-slate-500">{maquinas.length} equipos</p>

        <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto scroll-thin">
          {maquinas.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No hay maquinaria</p>
          )}
          {maquinas.map((m) => {
            const estado = m.horas_uso >= 1000 ? "critica" : m.horas_uso >= 900 ? "mantenimiento" : m.estado;
            const cfg = ESTADO_BADGE[estado as MaquinariaEstado];
            return (
              <div key={m.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-slate-900">{m.serial}</p>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", cfg.bg, cfg.text)}>
                        {ESTADO_LABELS[estado as MaquinariaEstado]}
                      </span>
                      {m.horas_uso >= 900 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          <AlertTriangle size={10} /> {m.horas_uso >= 1000 ? "Crítico" : "Aviso"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{m.marca} {m.modelo} · {m.cantidad}u · {m.horas_uso}h</p>
                    {m.descripcion && <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{m.descripcion}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditHorasTarget(m); setHorasInput(m.horas_uso); }}
                    >
                      <Wrench size={14} /> Horas
                    </Button>
                    <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setDeleteTarget(m)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar maquinaria?</DialogTitle>
            <DialogDescription>
              Se eliminará <strong>{deleteTarget?.serial}</strong>. Esta acción quedará registrada en auditoría.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button onClick={confirmDelete} className="bg-rose-600 hover:bg-rose-700">Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit hours dialog */}
      <Dialog open={!!editHorasTarget} onOpenChange={(v) => !v && setEditHorasTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar horas de uso</DialogTitle>
            <DialogDescription>
              {editHorasTarget?.serial} · Actualmente {editHorasTarget?.horas_uso}h
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Nuevas horas de uso</Label>
            <Input type="number" min={0} value={horasInput} onChange={(e) => setHorasInput(Number(e.target.value))} />
            <p className="text-xs text-slate-500">
              Aviso de mantenimiento a las 900h · Crítico a las 1000h
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditHorasTarget(null)}>Cancelar</Button>
            <Button onClick={saveHoras} style={{ background: "#6C5CE7" }}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alertas mantenimiento
// ---------------------------------------------------------------------------
function AlertasPanel() {
  const [maquinas, setMaquinas] = useState<Maquinaria[]>([]);

  useEffect(() => { getAll<Maquinaria>("maquinaria").then(setMaquinas); }, []);

  const conAlerta = maquinas.filter((m) => m.horas_uso >= 900);

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
        <Wrench size={18} className="text-amber-500" /> Alertas de mantenimiento
      </h3>
      <p className="subtitle-underline text-xs text-slate-500">Aviso a 900h · Crítico a 1000h</p>

      <div className="mt-4 space-y-2">
        {conAlerta.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-emerald-600">
            <CheckCircle2 size={48} />
            <p className="font-semibold">No hay maquinaria en alerta</p>
          </div>
        )}
        {conAlerta.map((m) => {
          const critico = m.horas_uso >= 1000;
          return (
            <div
              key={m.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-4",
                critico ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"
              )}
            >
              <AlertTriangle className={critico ? "text-rose-600" : "text-amber-600"} size={24} />
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">{m.serial} · {m.marca} {m.modelo}</p>
                <p className="text-xs text-slate-600">
                  {critico
                    ? `CRÍTICO: ${m.horas_uso}h — requiere mantenimiento inmediato`
                    : `AVISO: ${m.horas_uso}h — programar mantenimiento pronto`}
                </p>
              </div>
              <span className={cn(
                "rounded-full px-3 py-1 text-xs font-bold",
                critico ? "bg-rose-600 text-white" : "bg-amber-500 text-white"
              )}>
                {critico ? "Crítico" : "Aviso"}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Calendario de mantenimientos
// ---------------------------------------------------------------------------
function CalendarioPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<MantenimientoProgramado[]>([]);
  const [maquinas, setMaquinas] = useState<Maquinaria[]>([]);
  const [open, setOpen] = useState(false);
  const [maquinariaId, setMaquinariaId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState("");
  const [horasEnMant, setHorasEnMant] = useState(2);
  const [maquinariaError, setMaquinariaError] = useState<string | undefined>(undefined);
  const [maquinariaTouched, setMaquinariaTouched] = useState(false);

  const refresh = async () => {
    const all = await getAll<MantenimientoProgramado>("mantenimiento_programado");
    setItems(all.sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada)));
    setMaquinas(await getAll<Maquinaria>("maquinaria"));
  };
  useEffect(() => { refresh(); }, []);

  async function save() {
    if (!user) return;
    if (!maquinariaId) {
      setMaquinariaError("Seleccione una maquinaria");
      setMaquinariaTouched(true);
      return;
    }
    const machine = maquinas.find((m) => m.id === maquinariaId);
    if (!machine) return;
    const now = new Date().toISOString();
    const m: MantenimientoProgramado = {
      id: uuid(),
      maquinaria_id: maquinariaId,
      maquinaria_serial: machine.serial,
      fecha_programada: fecha,
      descripcion: descripcion.trim(),
      horas_en_mantenimiento: Number(horasEnMant) || 1,
      completado: false,
      created_at: now,
      updated_at: now,
      synced: false,
    };
    await put("mantenimiento_programado", m);
    await put("registro_de_auditoria", {
      id: uuid(), usuario_id: user.id, usuario_nombre: user.nombre,
      accion: "informe_mantenimiento", detalle: `Programó mantenimiento para ${machine.serial} el ${fecha}`,
      entidad_id: m.id, created_at: now, synced: false,
    });
    triggerSync();
    setOpen(false);
    setMaquinariaId(""); setDescripcion(""); setHorasEnMant(2);
    toast.success("Mantenimiento programado");
    refresh();
  }

  async function toggleCompletado(item: MantenimientoProgramado) {
    const now = new Date().toISOString();
    await put("mantenimiento_programado", {
      ...item,
      completado: !item.completado,
      updated_at: now,
      synced: false,
    });
    // If completing, also bump machine hours
    if (!item.completado) {
      const m = await getOne<Maquinaria>("maquinaria", item.maquinaria_id);
      if (m) {
        await put("maquinaria", {
          ...m,
          horas_uso: Math.max(0, m.horas_uso - item.horas_en_mantenimiento),
          estado: m.horas_uso >= 1000 ? "critica" : m.horas_uso >= 900 ? "mantenimiento" : "operativa",
          updated_at: now,
          synced: false,
        });
      }
    }
    triggerSync();
    refresh();
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <CalendarClock size={18} className="text-[#6C5CE7]" /> Calendario de mantenimientos
          </h3>
          <p className="subtitle-underline text-xs text-slate-500">{items.length} programados</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm" style={{ background: "#6C5CE7" }}>
          <Plus size={16} className="mr-1" /> Programar
        </Button>
      </div>

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">No hay mantenimientos programados</p>
        )}
        {items.map((m) => (
          <div key={m.id} className={cn(
            "flex items-center gap-3 rounded-lg border p-3",
            m.completado ? "border-emerald-200 bg-emerald-50/50 opacity-70" : "border-slate-200"
          )}>
            <CalendarClock className={m.completado ? "text-emerald-600" : "text-[#6C5CE7]"} size={20} />
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">{m.maquinaria_serial}</p>
              <p className="text-xs text-slate-500">
                {formatShortDateTime(m.fecha_programada)} · {m.horas_en_mantenimiento}h
              </p>
              {m.descripcion && <p className="text-xs text-slate-600">{m.descripcion}</p>}
            </div>
            <Button
              size="sm"
              variant={m.completado ? "outline" : "default"}
              onClick={() => toggleCompletado(m)}
              className={m.completado ? "" : "bg-emerald-600 hover:bg-emerald-700"}
            >
              {m.completado ? "Reabrir" : "Completar"}
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Programar mantenimiento</DialogTitle>
            <DialogDescription>Agende un mantenimiento para una máquina.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className={cn(maquinariaError && "text-rose-600")}>Maquinaria *</Label>
              <Select
                value={maquinariaId}
                onValueChange={(v) => {
                  setMaquinariaId(v);
                  if (maquinariaTouched) setMaquinariaError(v ? undefined : "Seleccione una maquinaria");
                }}
                onOpenChange={(open) => {
                  if (!open && maquinariaTouched) {
                    setMaquinariaError(maquinariaId ? undefined : "Seleccione una maquinaria");
                  }
                  if (open) setMaquinariaTouched(true);
                }}
              >
                <SelectTrigger className={cn(maquinariaError && "border-rose-400 ring-rose-200")}><SelectValue placeholder="Seleccione" /></SelectTrigger>
                <SelectContent>
                  {maquinas.map((m) => <SelectItem key={m.id} value={m.id}>{m.serial} · {m.marca} {m.modelo}</SelectItem>)}
                </SelectContent>
              </Select>
              {maquinariaError && (
                <p className="flex items-center gap-1 text-xs text-rose-600">
                  <span>⚠</span> {maquinariaError}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fecha programada</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Horas en mantenimiento</Label>
                <Input type="number" min={1} value={horasEnMant} onChange={(e) => setHorasEnMant(Number(e.target.value))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descripción</Label>
              <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} style={{ background: "#6C5CE7" }}>Programar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Observaciones (sin fotos, categorías maquinaria/empleado)
// ---------------------------------------------------------------------------
function ObservacionesPanel() {
  const [obs, setObs] = useState<Observacion[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [viewing, setViewing] = useState<Observacion | null>(null);

  const CATEGORY_FILTERS: Record<string, string> = {
    all: "Todas",
    maquinaria: "Sobre maquinaria",
    empleado: "Sobre empleado",
  };

  const refresh = async () => {
    const all = await getAll<Observacion>("observaciones");
    setObs(all.sort((a, b) => b.created_at.localeCompare(a.created_at)));
  };
  useEffect(() => { refresh(); }, []);

  const filtered = obs.filter((o) => filter === "all" || o.categoria === filter);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <MessageSquareText size={18} className="text-[#6C5CE7]" /> Observaciones registradas
          </h3>
          <p className="subtitle-underline text-xs text-slate-500">{obs.length} registradas</p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_FILTERS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-slate-400">No hay observaciones</p>
        )}
        {filtered.map((o) => (
          <div
            key={o.id}
            className="cursor-pointer rounded-xl border border-slate-200 p-3 hover:border-[#6C5CE7]/40"
            onClick={() => setViewing(o)}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: o.categoria === "maquinaria" ? "#F5F0FF" : "#FEF3C7",
                  color: o.categoria === "maquinaria" ? "#6C5CE7" : "#B45309",
                }}
              >
                {o.categoria === "maquinaria" ? "Sobre maquinaria" : "Sobre empleado"}
              </span>
            </div>
            <p className="text-sm text-slate-700 line-clamp-3">{o.texto}</p>
            <p className="mt-2 text-xs text-slate-400">
              {o.usuario_nombre} · {formatShortDateTime(o.created_at)}
            </p>
            {o.maquinaria_serial && (
              <p className="text-xs text-slate-500">Máquina: {o.maquinaria_serial}</p>
            )}
          </div>
        ))}
      </div>

      {/* Viewer */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {viewing?.categoria === "maquinaria" ? "Observación sobre maquinaria" : "Observación sobre empleado"}
            </DialogTitle>
            <DialogDescription>
              {viewing?.usuario_nombre} · {viewing && formatShortDateTime(viewing.created_at)}
              {viewing?.maquinaria_serial && ` · ${viewing.maquinaria_serial}`}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-700">{viewing?.texto}</p>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
