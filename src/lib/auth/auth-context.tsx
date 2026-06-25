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
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { hashPassword, verifyPassword } from "@/lib/auth/pbkdf2";

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

const SESSION_KEY = "maquinaria_session";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mapProfileToUser(profile: any): Usuario {
  return {
    id: profile.id,
    cedula: profile.cedula,
    nombre: profile.nombre,
    email: profile.email,
    role: profile.role,
    active: profile.active,
    created_at: profile.created_at,
    updated_at: profile.updated_at ?? profile.created_at,
  };
}

function persistSession(user: Usuario) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {}
}

function loadSession(): Usuario | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  // --- bootstrap: restore session + auto-seed admins ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Restore session from sessionStorage
        const cached = loadSession();
        if (cached && !cancelled) {
          setUser(cached);
        }

        // Auto-seed admin users if DB is empty (first run or after schema reset)
        if (isSupabaseConfigured && !cancelled) {
          const sb = getSupabase();
          if (sb) {
            const { data: existingUsers } = await sb.rpc("fn_get_users");
            const list = Array.isArray(existingUsers) ? existingUsers : [];
            if (list.length === 0) {
              const admins = [
                { cedula: "admin-deya", nombre: "Deya", email: "deya@maquinaria.local" },
                { cedula: "admin-jhonatan", nombre: "Jhonatan", email: "jhonatan@maquinaria.local" },
              ];
              for (const admin of admins) {
                const { hash, salt } = await hashPassword("admin123");
                await sb.rpc("fn_register", {
                  p_cedula: admin.cedula,
                  p_nombre: admin.nombre,
                  p_email: admin.email,
                  p_password_hash: hash,
                  p_salt: salt,
                  p_role: "admin",
                });
              }
              console.log("[auth] ✅ Admins creados automáticamente");
              console.log("[auth]    deya@maquinaria.local / admin123");
              console.log("[auth]    jhonatan@maquinaria.local / admin123");
            }
          }
        }
      } catch (e) {
        console.error("[auth] Error en bootstrap:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // --- login via RPC + PBKDF2 ---
  const login = useCallback<AuthContextValue["login"]>(async (identifier, password) => {
    try {
      if (!isSupabaseConfigured) {
        return { ok: false, error: "Supabase no está configurado" };
      }
      const sb = getSupabase();
      if (!sb) return { ok: false, error: "Error de conexión con Supabase" };

      const id = identifier.trim().toLowerCase();

      // Llamar RPC fn_login (security definer — bypass RLS)
      const { data, error } = await sb.rpc("fn_login", { p_login_id: id });

      if (error) {
        console.error("[auth] Error en fn_login:", error.message);
        return { ok: false, error: `Error al iniciar sesión: ${error.message}` };
      }

      if (!data || data.length === 0) {
        return { ok: false, error: "Usuario no encontrado" };
      }

      const profile = Array.isArray(data) ? data[0] : data;

      if (!profile.active) {
        return { ok: false, error: "Usuario inactivo" };
      }

      // Verificar contraseña con PBKDF2
      const valid = await verifyPassword(password, profile.password_hash, profile.salt);
      if (!valid) {
        return { ok: false, error: "Contraseña incorrecta" };
      }

      const usuario = mapProfileToUser(profile);
      setUser(usuario);
      persistSession(usuario);

      // audit log (best-effort)
      try {
        await sb.from("registro_de_auditoria").insert({
          usuario_id: usuario.id,
          usuario_nombre: usuario.nombre,
          accion: "login",
          detalle: `Inicio de sesión de ${usuario.nombre} (${usuario.role})`,
          created_at: new Date().toISOString(),
        });
      } catch {}

      return { ok: true };
    } catch (e: any) {
      console.error("[auth] Error en login:", e);
      return { ok: false, error: e?.message || "Error de inicio de sesión" };
    }
  }, []);

  // --- logout ---
  const logout = useCallback(() => {
    setUser(null);
    clearSession();
  }, []);

  // --- register employee via RPC ---
  const registerEmployee = useCallback<AuthContextValue["registerEmployee"]>(
    async ({ cedula, nombre, role = "empleado" }) => {
      try {
        if (!isSupabaseConfigured) {
          return { ok: false, error: "Supabase no está configurado" };
        }
        const sb = getSupabase();
        if (!sb) return { ok: false, error: "Error de conexión con Supabase" };

        const cleanCedula = cedula.trim();
        if (!cleanCedula) return { ok: false, error: "La cédula es obligatoria" };
        if (!/^\d{6,10}$/.test(cleanCedula)) return { ok: false, error: "La cédula debe tener entre 6 y 10 dígitos numéricos" };
        if (!nombre.trim()) return { ok: false, error: "El nombre es obligatorio" };
        if (nombre.trim().length < 3) return { ok: false, error: "El nombre debe tener al menos 3 caracteres" };

        const email = `${cleanCedula}@maquinaria.local`;
        const password = `V${cleanCedula}`;

        // Verificar duplicado via RPC
        const { data: existing } = await sb.rpc("fn_get_user_by_cedula", {
          p_cedula: cleanCedula,
        });
        if (existing && (Array.isArray(existing) ? existing.length > 0 : existing)) {
          return { ok: false, error: "Ya existe un usuario con esa cédula" };
        }

        // Hashear contraseña con PBKDF2
        const { hash, salt } = await hashPassword(password);

        // Crear usuario via RPC fn_register (security definer)
        const { error: insertError } = await sb.rpc("fn_register", {
          p_cedula: cleanCedula,
          p_nombre: nombre.trim(),
          p_email: email,
          p_password_hash: hash,
          p_salt: salt,
          p_role: role,
        });

        if (insertError) {
          console.error("[auth] Error en fn_register:", insertError.message);
          return { ok: false, error: `Error al registrar: ${insertError.message}` };
        }

        console.log(`[auth] Usuario registrado: ${email} (${role})`);

        // audit
        if (user) {
          try {
            await sb.from("registro_de_auditoria").insert({
              usuario_id: user.id,
              usuario_nombre: user.nombre,
              accion: "cambio_rol",
              detalle: `Registró empleado ${nombre} (cédula ${cleanCedula}) con rol ${role}`,
              created_at: new Date().toISOString(),
            });
          } catch {}
        }

        return { ok: true, password };
      } catch (e: any) {
        console.error("[auth] Error en registerEmployee:", e);
        return { ok: false, error: e?.message || "Error al registrar" };
      }
    },
    [user]
  );

  // --- reset password by cédula ---
  const resetPasswordByCedula = useCallback<
    AuthContextValue["resetPasswordByCedula"]
  >(async (cedula) => {
    try {
      if (!isSupabaseConfigured) {
        return { ok: false, error: "Supabase no está configurado" };
      }
      const sb = getSupabase();
      if (!sb) return { ok: false, error: "Error de conexión con Supabase" };

      const cleanCedula = cedula.trim();
      if (!cleanCedula) return { ok: false, error: "Ingrese una cédula" };

      // Buscar usuario por cédula via RPC
      const { data: userData, error: searchError } = await sb.rpc("fn_get_user_by_cedula", {
        p_cedula: cleanCedula,
      });

      if (searchError) {
        return { ok: false, error: `Error al buscar usuario: ${searchError.message}` };
      }

      const profile = Array.isArray(userData) ? userData[0] : userData;
      if (!profile) {
        return { ok: false, error: "Cédula no registrada" };
      }

      // Generar nueva contraseña: V + cédula
      const newPassword = `V${cleanCedula}`;
      const { hash, salt } = await hashPassword(newPassword);

      const { error: updateError } = await sb.rpc("fn_update_password", {
        p_user_id: profile.id,
        p_password_hash: hash,
        p_salt: salt,
      });

      if (updateError) {
        return { ok: false, error: `Error al resetear contraseña: ${updateError.message}` };
      }

      return { ok: true, password: newPassword };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Error al resetear contraseña" };
    }
  }, []);

  // --- update role ---
  const updateRole = useCallback<AuthContextValue["updateRole"]>(
    async (userId, role) => {
      try {
        if (!isSupabaseConfigured) {
          return { ok: false, error: "Supabase no está configurado" };
        }
        const sb = getSupabase();
        if (!sb) return { ok: false, error: "Error de conexión con Supabase" };

        const { error } = await sb.rpc("fn_update_role", {
          p_user_id: userId,
          p_role: role,
        });

        if (error) {
          return { ok: false, error: `Error al actualizar rol: ${error.message}` };
        }

        // Si el usuario cambió su propio rol, actualizar estado local
        if (user?.id === userId) {
          setUser((prev) => prev ? { ...prev, role } : prev);
        }

        // audit
        if (user) {
          try {
            await sb.from("registro_de_auditoria").insert({
              usuario_id: user.id,
              usuario_nombre: user.nombre,
              accion: "cambio_rol",
              detalle: `Cambió rol del usuario ${userId} a ${role}`,
              created_at: new Date().toISOString(),
            });
          } catch {}
        }

        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message };
      }
    },
    [user]
  );

  // --- get all users (admin) ---
  const refreshUsers = useCallback(async (): Promise<Usuario[]> => {
    if (!isSupabaseConfigured) return [];
    const sb = getSupabase();
    if (!sb) return [];
    try {
      const { data } = await sb.rpc("fn_get_users");
      const list = Array.isArray(data) ? data : [];
      return list.map(mapProfileToUser);
    } catch {
      return [];
    }
  }, []);

  const listUsers = refreshUsers;

  // --- value ---
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
      user, loading, login, logout,
      registerEmployee, resetPasswordByCedula,
      updateRole, refreshUsers, listUsers,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
