// Background sync manager — pushes pending IndexedDB records to Supabase when online.
// Dual-write: writes happen to IndexedDB first (instant), Supabase sync is best-effort.

import { getAll } from "@/lib/indexeddb/db";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  Entrada,
  Localidad,
  Maquinaria,
  MantenimientoProgramado,
  Observacion,
  RegistroAuditoria,
  RevisionTurno,
  Salida,
  Turno,
} from "@/lib/types";

type StoreName =
  | "turnos"
  | "entradas"
  | "salidas"
  | "maquinaria"
  | "observaciones"
  | "registro_de_auditoria"
  | "revisiones_de_turnos"
  | "mantenimiento_programado"
  | "localidades";

const TABLE_MAP: Record<StoreName, string> = {
  turnos: "turnos",
  entradas: "entradas",
  salidas: "salidas",
  maquinaria: "maquinaria",
  observaciones: "observaciones",
  registro_de_auditoria: "registro_de_auditoria",
  revisiones_de_turnos: "revisiones_de_turnos",
  mantenimiento_programado: "mantenimiento_programado",
  localidades: "ubicaciones",
};

// Strip client-only fields (synced flag) before sending to Supabase
function toRow(v: any): any {
  const { synced, ...rest } = v;
  return rest;
}

let syncing = false;
let pendingTrigger = false;

export function triggerSync(): void {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;
  if (!isSupabaseConfigured) return;
  if (syncing) {
    pendingTrigger = true;
    return;
  }
  syncing = true;
  // Defer to next tick to avoid blocking current operation
  setTimeout(async () => {
    try {
      await runSync();
    } finally {
      syncing = false;
      if (pendingTrigger) {
        pendingTrigger = false;
        triggerSync();
      }
    }
  }, 200);
}

async function runSync(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const stores: StoreName[] = [
    "localidades",
    "maquinaria",
    "entradas",
    "salidas",
    "turnos",
    "observaciones",
    "mantenimiento_programado",
    "registro_de_auditoria",
    "revisiones_de_turnos",
  ];

  for (const store of stores) {
    try {
      const all = await getAll<any>(store);
      const pending = all.filter((r) => r.synced === false);
      if (pending.length === 0) continue;
      const table = TABLE_MAP[store];
      const rows = pending.map(toRow);

      // Upsert in batches of 50
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await sb.from(table).upsert(batch, { onConflict: "id" });
        if (error) {
          console.error(`[sync] Error al sincronizar ${table} (${batch.length} registros):`, error.message);
        } else {
          console.log(`[sync] ${table}: ${batch.length} registros sincronizados correctamente`);
        }
      }
      // mark as synced locally
      const db = (await import("@/lib/indexeddb/db")).getDB;
      const dbh = await db();
      const tx = dbh.transaction(store as any, "readwrite");
      await Promise.all(
        pending.map((r) => {
          r.synced = true;
          return tx.store.put(r);
        })
      );
      await tx.done;
    } catch (e) {
      console.error(`[sync] Error en store "${store}":`, e instanceof Error ? e.message : e);
    }
  }
}

// Pull server data into IndexedDB (called on first online bootstrap)
export async function pullFromServer(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const pulls: { store: StoreName; table: string }[] = [
    { store: "localidades", table: "ubicaciones" },
    { store: "maquinaria", table: "maquinaria" },
    { store: "turnos", table: "turnos" },
    { store: "entradas", table: "entradas" },
    { store: "salidas", table: "salidas" },
    { store: "observaciones", table: "observaciones" },
    { store: "mantenimiento_programado", table: "mantenimiento_programado" },
    { store: "revisiones_de_turnos", table: "revisiones_de_turnos" },
    { store: "registro_de_auditoria", table: "registro_de_auditoria" },
  ];

  for (const { store, table } of pulls) {
    try {
      const { data, error } = await sb.from(table).select("*");
      if (error) {
        console.warn(`[pull] Error al obtener ${table}:`, error.message);
        continue;
      }
      if (!data || data.length === 0) continue;
      const rows = data.map((r: any) => ({ ...r, synced: true }));
      const db = (await import("@/lib/indexeddb/db")).getDB;
      const dbh = await db();
      const tx = dbh.transaction(store as any, "readwrite");
      await Promise.all(rows.map((r: any) => tx.store.put(r)));
      await tx.done;
      console.log(`[pull] ${table}: ${rows.length} registros descargados`);
    } catch (e) {
      console.error(`[pull] Error en tabla "${table}":`, e instanceof Error ? e.message : e);
    }
  }
}

// Auto-trigger sync when we come back online
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    triggerSync();
  });
}
