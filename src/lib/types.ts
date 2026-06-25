// ============================================================================
// Central type definitions for the heavy machinery control application
// ============================================================================

export type Role = "admin" | "gerente" | "empleado";

export type MineralType = "grueso" | "calibrado" | "comercial";

export type JornadaType = "regular" | "extraordinaria";

export type ShiftStatus =
  | "activo"
  | "completo"
  | "incompleto"
  | "con_horas_extra";

export type MaquinariaEstado = "operativa" | "mantenimiento" | "critica" | "fuera_de_servicio";

export type SyncStatus = "pending" | "synced" | "error";

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
export interface Usuario {
  id: string;
  cedula: string;
  nombre: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------
export interface Localidad {
  id: string;
  nombre: string;
  descripcion?: string;
  created_at: string;
  updated_at: string;
  synced: boolean;
}

// ---------------------------------------------------------------------------
// Machinery
// ---------------------------------------------------------------------------
export interface Maquinaria {
  id: string;
  serial: string;
  descripcion: string;
  modelo: string;
  marca: string;
  cantidad: number;
  horas_uso: number;          // current usage hours
  estado: MaquinariaEstado;
  localidad_id?: string | null;
  fecha_entrada: string;      // ISO date of entry
  fecha_salida?: string | null;
  created_at: string;
  updated_at: string;
  synced: boolean;
}

// ---------------------------------------------------------------------------
// Shift (turno)
// ---------------------------------------------------------------------------
export interface Turno {
  id: string;
  usuario_id: string;
  usuario_nombre: string;
  cedula: string;
  localidad_id: string;
  localidad_nombre: string;
  maquinaria_id: string;
  maquinaria_serial: string;
  jornada: JornadaType;        // regular 7h / extraordinaria 12h
  fecha_inicio: string;        // ISO datetime
  fecha_fin?: string | null;
  mineral_type?: MineralType | null;
  taras_moved?: number;
  toneladas?: number;          // taras / 4
  estado: ShiftStatus;
  razon_incompleto?: string | null;
  duracion_minutos?: number | null;
  duracion_esperada_minutos: number; // 420 or 720
  created_at: string;
  updated_at: string;
  synced: boolean;
}

// ---------------------------------------------------------------------------
// Entry / Exit (movements)
// ---------------------------------------------------------------------------
export interface Entrada {
  id: string;
  razon: string;
  serial: string;
  descripcion: string;
  modelo: string;
  marca: string;
  cantidad: number;
  fecha: string;
  created_at: string;
  updated_at: string;
  synced: boolean;
}

export interface Salida {
  id: string;
  maquinaria_id: string;
  maquinaria_serial: string;
  razon: string;
  fecha: string;
  created_at: string;
  updated_at: string;
  synced: boolean;
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------
export type ObservationCategory =
  | "mecanica"
  | "electrica"
  | "hidraulica"
  | "neumatica"
  | "estructura"
  | "otra";

export interface Observacion {
  id: string;
  turno_id?: string | null;
  maquinaria_id?: string | null;
  maquinaria_serial?: string;
  usuario_id: string;
  usuario_nombre: string;
  categoria: ObservationCategory;
  texto: string;
  fotos: string[];   // base64 JPEG strings (compressed)
  created_at: string;
  updated_at: string;
  synced: boolean;
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------
export interface MantenimientoProgramado {
  id: string;
  maquinaria_id: string;
  maquinaria_serial: string;
  fecha_programada: string;
  descripcion: string;
  horas_en_mantenimiento: number;
  completado: boolean;
  created_at: string;
  updated_at: string;
  synced: boolean;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export type AuditAction =
  | "login"
  | "logout"
  | "cambio_rol"
  | "informe_mantenimiento"
  | "editar_horas_maquinaria"
  | "eliminar_maquinaria"
  | "crear_ubicacion"
  | "actualizar_ubicacion"
  | "eliminar_ubicacion";

export interface RegistroAuditoria {
  id: string;
  usuario_id: string;
  usuario_nombre: string;
  accion: AuditAction;
  detalle: string;
  entidad_id?: string | null;
  created_at: string;
  synced: boolean;
}

// ---------------------------------------------------------------------------
// Shift review (incomplete shifts workflow)
// ---------------------------------------------------------------------------
export type ShiftReviewStatus = "pendiente" | "justificado" | "rechazado";

export interface RevisionTurno {
  id: string;
  turno_id: string;
  usuario_id: string;
  usuario_nombre: string;
  estado: ShiftReviewStatus;
  razon_incompleto: string;
  nota_admin?: string | null;
  revisado_por?: string | null;
  revisado_at?: string | null;
  created_at: string;
  updated_at: string;
  synced: boolean;
}

// ---------------------------------------------------------------------------
// Sync meta
// ---------------------------------------------------------------------------
export interface MetaRow {
  key: string;
  value: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const JORNADA_DURACION: Record<JornadaType, number> = {
  regular: 7 * 60,        // 420 minutes
  extraordinaria: 12 * 60, // 720 minutes
};

export const TOLERANCIA_MINUTOS = 15;
export const TARAS_POR_TONELADA = 4;

export const MINERAL_LABELS: Record<MineralType, string> = {
  grueso: "Grueso",
  calibrado: "Calibrado",
  comercial: "Comercial",
};

export const MINERAL_BADGE: Record<
  MineralType,
  { bg: string; text: string; label: string; ring: string }
> = {
  grueso:    { bg: "bg-stone-100",  text: "text-stone-700",  ring: "ring-stone-300",  label: "Grueso" },
  calibrado: { bg: "bg-blue-100",   text: "text-blue-700",   ring: "ring-blue-300",   label: "Calibrado" },
  comercial: { bg: "bg-emerald-100",text: "text-emerald-700",ring: "ring-emerald-300",label: "Comercial" },
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  empleado: "Empleado",
};

export const ESTADO_LABELS: Record<MaquinariaEstado, string> = {
  operativa: "Operativa",
  mantenimiento: "En Mantenimiento",
  critica: "Crítica",
  fuera_de_servicio: "Fuera de Servicio",
};

export const ESTADO_BADGE: Record<MaquinariaEstado, { bg: string; text: string }> = {
  operativa: { bg: "bg-emerald-100", text: "text-emerald-700" },
  mantenimiento: { bg: "bg-amber-100", text: "text-amber-700" },
  critica: { bg: "bg-rose-100", text: "text-rose-700" },
  fuera_de_servicio: { bg: "bg-stone-200", text: "text-stone-700" },
};

export const OBSERVATION_LABELS: Record<ObservationCategory, string> = {
  mecanica: "Mecánica",
  electrica: "Eléctrica",
  hidraulica: "Hidráulica",
  neumatica: "Neumática",
  estructura: "Estructura",
  otra: "Otra",
};
