"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Role, Usuario } from "@/lib/types";
import { getAll, getDB, put, getByIndex } from "@/lib/indexeddb/db";
import { buildSeedUsers, employeeDefaultPassword, syntheticEmail } from "@/lib/auth/seed";
import { generateSalt, hashPassword, verifyPassword } from "@/lib/auth/pbkdf2";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { triggerSync } from "@/lib/sync/sync-manager";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface AuthContextValue {
  user: Usuario | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  registerEmployee: (data: {
    cedula: string;
    nombre: string;
    role?: Role;
  }) => Promise<{ ok: boolean; error?: string; password?: string }>;
  resetPasswordByCedula: (
    cedula: string
  ) => Promise<{ ok: boolean; error?: string; password?: string }>;
  updateRole: (
    userId: string,
    role: Role
  ) => Promise<{ ok: boolean; error?: string }>;
  refreshUsers: () => Promise<Usuario[]>;
  listUsers: () => Promise<Usuario[]>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = "maquinaria.session.userId";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  // --- bootstrap: ensure seed admins exist + restore session ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDB();
        const existing = await getAll<Usuario>("usuarios");
        let users = existing;
        if (existing.length === 0) {
          const seed = await buildSeedUsers();
          const tx = db.transaction("usuarios", "readwrite");
          await Promise.all(seed.map((u) => tx.store.put(u)));
          await tx.done;
          users = seed;
        }
        // restore session
        const savedId = localStorage.getItem(SESSION_KEY);
        if (savedId) {
          const found = users.find((u) => u.id === savedId) || (await db.get("usuarios", savedId));
          if (found && found.active && !cancelled) setUser(found);
        }
      } catch (e) {
        console.error("auth bootstrap error", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- login ---
  const login = useCallback<AuthContextValue["login"]>(async (identifier, password) => {
    try {
      const id = identifier.trim().toLowerCase();
      const users = await getAll<Usuario>("usuarios");
      const found = users.find(
        (u) => u.email.toLowerCase() === id || u.cedula.toLowerCase() === id
      );
      if (!found) return { ok: false, error: "Usuario no encontrado" };
      if (!found.active) return { ok: false, error: "Usuario inactivo" };

      const ok = await verifyPassword(password, found.salt, found.password_hash);
      if (!ok) return { ok: false, error: "Contraseña incorrecta" };

      localStorage.setItem(SESSION_KEY, found.id);
      setUser(found);

      // audit log
      await put("registro_de_auditoria", {
        id: uuid(),
        usuario_id: found.id,
        usuario_nombre: found.nombre,
        accion: "login",
        detalle: `Inicio de sesión de ${found.nombre} (${found.role})`,
        entidad_id: found.id,
        created_at: new Date().toISOString(),
        synced: false,
      });
      triggerSync();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Error de inicio de sesión" };
    }
  }, []);

  const logout = useCallback(() => {
    if (user) {
      put("registro_de_auditoria", {
        id: uuid(),
        usuario_id: user.id,
        usuario_nombre: user.nombre,
        accion: "login",
        detalle: `Cierre de sesión de ${user.nombre}`,
        entidad_id: user.id,
        created_at: new Date().toISOString(),
        synced: false,
      });
      triggerSync();
    }
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, [user]);

  // --- register employee (Admin only) ---
  const registerEmployee = useCallback<AuthContextValue["registerEmployee"]>(
    async ({ cedula, nombre, role = "empleado" }) => {
      try {
        const cleanCedula = cedula.trim();
        if (!cleanCedula) return { ok: false, error: "La cédula es obligatoria" };
        if (!/^\d{6,10}$/.test(cleanCedula)) return { ok: false, error: "La cédula debe tener entre 6 y 10 dígitos numéricos" };
        if (!nombre.trim()) return { ok: false, error: "El nombre es obligatorio" };
        if (nombre.trim().length < 3) return { ok: false, error: "El nombre debe tener al menos 3 caracteres" };

        const existing = await getByIndex<Usuario>("usuarios", "by-cedula", cleanCedula);
        if (existing.length > 0) return { ok: false, error: "Ya existe un usuario con esa cédula" };

        const password = employeeDefaultPassword(cleanCedula);
        const email = syntheticEmail(cleanCedula);
        const salt = generateSalt();
        const hash = await hashPassword(password, salt);
        const now = new Date().toISOString();
        const newUser: Usuario = {
          id: uuid(),
          cedula: cleanCedula,
          nombre: nombre.trim(),
          email,
          role,
          password_hash: hash,
          salt,
          active: true,
          created_at: now,
          updated_at: now,
          synced: false,
        };
        await put("usuarios", newUser);

        // audit
        if (user) {
          await put("registro_de_auditoria", {
            id: uuid(),
            usuario_id: user.id,
            usuario_nombre: user.nombre,
            accion: "cambio_rol",
            detalle: `Registró empleado ${nombre} (cédula ${cleanCedula}) con rol ${role}`,
            entidad_id: newUser.id,
            created_at: now,
            synced: false,
          });
        }
        triggerSync();

        // Optionally create auth user in Supabase (best-effort)
        if (isSupabaseConfigured) {
          const sb = getSupabase();
          if (sb) {
            sb.auth
              .signUp({ email, password })
              .then(() => {})
              .catch(() => {});
          }
        }

        return { ok: true, password };
      } catch (e: any) {
        return { ok: false, error: e?.message || "Error al registrar" };
      }
    },
    [user]
  );

  // --- reset password by cédula (back to V+cédula) ---
  const resetPasswordByCedula = useCallback<
    AuthContextValue["resetPasswordByCedula"]
  >(async (cedula) => {
    try {
      const cleanCedula = cedula.trim();
      const found = await getByIndex<Usuario>("usuarios", "by-cedula", cleanCedula);
      if (found.length === 0) return { ok: false, error: "Cédula no registrada" };
      const u = found[0];
      const password = employeeDefaultPassword(cleanCedula);
      const salt = generateSalt();
      const hash = await hashPassword(password, salt);
      const updated: Usuario = {
        ...u,
        salt,
        password_hash: hash,
        updated_at: new Date().toISOString(),
        synced: false,
      };
      await put("usuarios", updated);
      triggerSync();
      return { ok: true, password };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Error al resetear contraseña" };
    }
  }, []);

  // --- update role ---
  const updateRole = useCallback<AuthContextValue["updateRole"]>(
    async (userId, role) => {
      try {
        const u = await getDB().then((db) => db.get("usuarios", userId));
        if (!u) return { ok: false, error: "Usuario no encontrado" };
        const updated: Usuario = {
          ...u,
          role,
          updated_at: new Date().toISOString(),
          synced: false,
        };
        await put("usuarios", updated);
        if (user) {
          await put("registro_de_auditoria", {
            id: uuid(),
            usuario_id: user.id,
            usuario_nombre: user.nombre,
            accion: "cambio_rol",
            detalle: `Cambió rol de ${u.nombre} a ${role}`,
            entidad_id: userId,
            created_at: new Date().toISOString(),
            synced: false,
          });
        }
        triggerSync();
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message };
      }
    },
    [user]
  );

  const refreshUsers = useCallback(async () => {
    return await getAll<Usuario>("usuarios");
  }, []);

  const listUsers = refreshUsers;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      registerEmployee,
      resetPasswordByCedula,
      updateRole,
      refreshUsers,
      listUsers,
    }),
    [
      user,
      loading,
      login,
      logout,
      registerEmployee,
      resetPasswordByCedula,
      updateRole,
      refreshUsers,
      listUsers,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
