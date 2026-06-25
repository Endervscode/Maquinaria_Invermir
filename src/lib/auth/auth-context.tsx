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
  ) => Promise<{ ok: boolean; error?: string }>;
  updateRole: (
    userId: string,
    role: Role
  ) => Promise<{ ok: boolean; error?: string }>;
  refreshUsers: () => Promise<Usuario[]>;
  listUsers: () => Promise<Usuario[]>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapProfileToUser(profile: any): Usuario {
  return {
    id: profile.id,
    cedula: profile.cedula,
    nombre: profile.nombre,
    email: profile.email,
    role: profile.role,
    active: profile.active,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  // --- bootstrap: restore session from Supabase ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isSupabaseConfigured) {
          console.warn("[auth] Supabase no está configurado. No hay autenticación disponible.");
          if (!cancelled) setLoading(false);
          return;
        }
        const sb = getSupabase();
        if (!sb) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user) {
          const { data: profile } = await sb
            .from("perfiles")
            .select("*")
            .eq("id", session.user.id)
            .single();
          if (profile && !cancelled) {
            setUser(mapProfileToUser(profile));
          }
        }
      } catch (e) {
        console.error("[auth] Error al restaurar sesión:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // --- login ---
  const login = useCallback<AuthContextValue["login"]>(async (identifier, password) => {
    try {
      if (!isSupabaseConfigured) {
        return { ok: false, error: "Supabase no está configurado" };
      }
      const sb = getSupabase();
      if (!sb) return { ok: false, error: "Error de conexión con Supabase" };

      // Determine if identifier is email or cedula
      const id = identifier.trim().toLowerCase();
      let email = id;
      if (!id.includes("@")) {
        // Construct email from cedula pattern: {cedula}@maquinaria.local
        // (No consultamos perfiles porque RLS bloquea SELECT sin autenticación)
        email = `${id}@maquinaria.local`;
      }

      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        if (error.message === "Invalid login credentials") {
          return { ok: false, error: "Contraseña incorrecta" };
        }
        return { ok: false, error: error.message };
      }

      // Get full profile
      const { data: profile } = await sb
        .from("perfiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (!profile) {
        return { ok: false, error: "Perfil de usuario no encontrado" };
      }

      if (!profile.active) {
        // If the user is inactive, sign them out right away
        await sb.auth.signOut();
        return { ok: false, error: "Usuario inactivo" };
      }

      setUser(mapProfileToUser(profile));

      // audit log (skip if not configured)
      try {
        await sb.from("registro_de_auditoria").insert({
          usuario_id: profile.id,
          usuario_nombre: profile.nombre,
          accion: "login",
          detalle: `Inicio de sesión de ${profile.nombre} (${profile.role})`,
          created_at: new Date().toISOString(),
        });
      } catch {}

      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Error de inicio de sesión" };
    }
  }, []);

  const logout = useCallback(async () => {
    const sb = getSupabase();
    if (sb) {
      try {
        await sb.auth.signOut();
      } catch {}
    }
    setUser(null);
  }, []);

  // --- register employee (Admin only) ---
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

        // Check if cédula already exists in perfiles
        const { data: existing } = await sb
          .from("perfiles")
          .select("id")
          .eq("cedula", cleanCedula)
          .maybeSingle();
        if (existing) {
          return { ok: false, error: "Ya existe un usuario con esa cédula" };
        }

        // Create user via Supabase Auth
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: {
              cedula: cleanCedula,
              nombre: nombre.trim(),
              role,
            },
          },
        });

        if (error) {
          console.error("[auth] Error al crear usuario en Supabase:", error.message);
          return { ok: false, error: `Error al crear usuario: ${error.message}` };
        }

        if (!data.user) {
          return { ok: false, error: "No se pudo crear el usuario en Supabase" };
        }

        console.log(`[auth] Usuario creado en Supabase Auth: ${email}`);

        // The trigger on_auth_user_created should have created the perfiles row.
        // If not, create it manually
        const { data: profile } = await sb
          .from("perfiles")
          .select("id")
          .eq("id", data.user.id)
          .maybeSingle();

        if (!profile) {
          await sb.from("perfiles").insert({
            id: data.user.id,
            cedula: cleanCedula,
            nombre: nombre.trim(),
            email,
            role,
            active: true,
          });
        }

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

  // --- reset password by cédula (sends reset email) ---
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
      // Construct email from cedula pattern (no consultamos perfiles por RLS)
      const email = `${cleanCedula}@maquinaria.local`;

      const { error } = await sb.auth.resetPasswordForEmail(email);
      if (error) {
        return { ok: false, error: `Error al enviar correo: ${error.message}` };
      }

      return { ok: true };
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

        const { error, data } = await sb
          .from("perfiles")
          .update({ role, updated_at: new Date().toISOString() })
          .eq("id", userId)
          .select()
          .single();

        if (error) {
          return { ok: false, error: `Error al actualizar rol: ${error.message}` };
        }

        // If the current user changed their own role, update local state
        if (user?.id === userId) {
          setUser(mapProfileToUser(data));
        }

        // audit
        if (user) {
          try {
            await sb.from("registro_de_auditoria").insert({
              usuario_id: user.id,
              usuario_nombre: user.nombre,
              accion: "cambio_rol",
              detalle: `Cambió rol de ${data.nombre} a ${role}`,
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

  const refreshUsers = useCallback(async (): Promise<Usuario[]> => {
    if (!isSupabaseConfigured) return [];
    const sb = getSupabase();
    if (!sb) return [];
    try {
      const { data } = await sb.from("perfiles").select("*").order("nombre");
      return (data || []).map(mapProfileToUser);
    } catch {
      return [];
    }
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
