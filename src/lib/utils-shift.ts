import {
  JORNADA_DURACION,
  TOLERANCIA_MINUTOS,
  type JornadaType,
  type ShiftStatus,
} from "@/lib/types";

export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Shift validation
// Returns: status, duration minutes, reason for incomplete (if any)
// ---------------------------------------------------------------------------
export function validateShift(
  startISO: string,
  endISO: string,
  jornada: JornadaType
): {
  status: ShiftStatus;
  duracion_minutos: number;
  duracion_esperada_minutos: number;
  razon?: string;
} {
  const expected = JORNADA_DURACION[jornada];
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  const minutes = Math.max(0, Math.round((end - start) / 60000));

  const lowerBound = expected - TOLERANCIA_MINUTOS;
  const upperBound = expected + TOLERANCIA_MINUTOS;

  if (minutes < lowerBound) {
    const missing = lowerBound - minutes;
    return {
      status: "incompleto",
      duracion_minutos: minutes,
      duracion_esperada_minutos: expected,
      razon: `Turno cerrado ${missing} min antes del mínimo (${expected - TOLERANCIA_MINUTOS} min).`,
    };
  }
  if (minutes > upperBound) {
    const extra = minutes - upperBound;
    return {
      status: "con_horas_extra",
      duracion_minutos: minutes,
      duracion_esperada_minutos: expected,
      razon: `Turno excedió en ${extra} min la duración esperada (${expected + TOLERANCIA_MINUTOS} min).`,
    };
  }
  return {
    status: "completo",
    duracion_minutos: minutes,
    duracion_esperada_minutos: expected,
  };
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfDayISO(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function endOfDayISO(date = new Date()): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function isSameDay(a: string | Date, b: string | Date): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
