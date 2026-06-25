import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Localidad,
  Maquinaria,
  Turno,
  Entrada,
  Salida,
  Observacion,
  MantenimientoProgramado,
  RegistroAuditoria,
  RevisionTurno,
  MetaRow,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// IndexedDB schema definition
// ---------------------------------------------------------------------------
interface MaquinariaDB extends DBSchema {
  turnos: {
    key: string;
    value: Turno;
    indexes: { "by-usuario": string; "by-estado": string; "by-synced": boolean; "by-fecha": string };
  };
  entradas: {
    key: string;
    value: Entrada;
    indexes: { "by-synced": boolean; "by-fecha": string };
  };
  salidas: {
    key: string;
    value: Salida;
    indexes: { "by-synced": boolean; "by-fecha": string };
  };
  maquinaria: {
    key: string;
    value: Maquinaria;
    indexes: { "by-serial": string; "by-localidad": string; "by-synced": boolean };
  };
  observaciones: {
    key: string;
    value: Observacion;
    indexes: { "by-maquinaria": string; "by-turno": string; "by-synced": boolean };
  };
  registro_de_auditoria: {
    key: string;
    value: RegistroAuditoria;
    indexes: { "by-usuario": string; "by-synced": boolean };
  };
  revisiones_de_turnos: {
    key: string;
    value: RevisionTurno;
    indexes: { "by-turno": string; "by-estado": string; "by-synced": boolean };
  };
  mantenimiento_programado: {
    key: string;
    value: MantenimientoProgramado;
    indexes: { "by-maquinaria": string; "by-fecha": string; "by-synced": boolean };
  };
  localidades: {
    key: string;
    value: Localidad;
    indexes: { "by-synced": boolean };
  };
  meta: {
    key: string;
    value: MetaRow;
  };
}

const DB_NAME = "maquinaria-db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MaquinariaDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MaquinariaDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB only available in browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB<MaquinariaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("turnos")) {
          const s = db.createObjectStore("turnos", { keyPath: "id" });
          s.createIndex("by-usuario", "usuario_id");
          s.createIndex("by-estado", "estado");
          s.createIndex("by-synced", "synced");
          s.createIndex("by-fecha", "fecha_inicio");
        }
        if (!db.objectStoreNames.contains("entradas")) {
          const s = db.createObjectStore("entradas", { keyPath: "id" });
          s.createIndex("by-synced", "synced");
          s.createIndex("by-fecha", "fecha");
        }
        if (!db.objectStoreNames.contains("salidas")) {
          const s = db.createObjectStore("salidas", { keyPath: "id" });
          s.createIndex("by-synced", "synced");
          s.createIndex("by-fecha", "fecha");
        }
        if (!db.objectStoreNames.contains("maquinaria")) {
          const s = db.createObjectStore("maquinaria", { keyPath: "id" });
          s.createIndex("by-serial", "serial");
          s.createIndex("by-localidad", "localidad_id");
          s.createIndex("by-synced", "synced");
        }
        if (!db.objectStoreNames.contains("observaciones")) {
          const s = db.createObjectStore("observaciones", { keyPath: "id" });
          s.createIndex("by-maquinaria", "maquinaria_id");
          s.createIndex("by-turno", "turno_id");
          s.createIndex("by-synced", "synced");
        }
        if (!db.objectStoreNames.contains("registro_de_auditoria")) {
          const s = db.createObjectStore("registro_de_auditoria", { keyPath: "id" });
          s.createIndex("by-usuario", "usuario_id");
          s.createIndex("by-synced", "synced");
        }
        if (!db.objectStoreNames.contains("revisiones_de_turnos")) {
          const s = db.createObjectStore("revisiones_de_turnos", { keyPath: "id" });
          s.createIndex("by-turno", "turno_id");
          s.createIndex("by-estado", "estado");
          s.createIndex("by-synced", "synced");
        }
        if (!db.objectStoreNames.contains("mantenimiento_programado")) {
          const s = db.createObjectStore("mantenimiento_programado", { keyPath: "id" });
          s.createIndex("by-maquinaria", "maquinaria_id");
          s.createIndex("by-fecha", "fecha_programada");
          s.createIndex("by-synced", "synced");
        }
        if (!db.objectStoreNames.contains("localidades")) {
          const s = db.createObjectStore("localidades", { keyPath: "id" });
          s.createIndex("by-synced", "synced");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Generic repository helpers
// ---------------------------------------------------------------------------
export async function put<T extends { synced?: boolean }>(
  store: keyof MaquinariaDB,
  value: T
): Promise<T> {
  const db = await getDB();
  await db.put(store as any, value as any);
  return value;
}

export async function bulkPut<T>(
  store: keyof MaquinariaDB,
  values: T[]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(store as any, "readwrite");
  await Promise.all(values.map((v) => tx.store.put(v as any)));
  await tx.done;
}

export async function getAll<T = any>(store: keyof MaquinariaDB): Promise<T[]> {
  const db = await getDB();
  return (await db.getAll(store as any)) as T[];
}

export async function getOne<T = any>(
  store: keyof MaquinariaDB,
  key: string
): Promise<T | undefined> {
  const db = await getDB();
  return (await db.get(store as any, key)) as T | undefined;
}

export async function remove(
  store: keyof MaquinariaDB,
  key: string
): Promise<void> {
  const db = await getDB();
  await db.delete(store as any, key);
}

export async function getByIndex<T = any>(
  store: keyof MaquinariaDB,
  index: string,
  value: any
): Promise<T[]> {
  const db = await getDB();
  return (await db.getAllFromIndex(
    store as any,
    index as any,
    value
  )) as T[];
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDB();
  const row = await db.get("meta", key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value, updated_at: new Date().toISOString() });
}
