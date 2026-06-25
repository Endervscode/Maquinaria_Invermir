"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { ROLE_LABELS, type Role, type Usuario } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { UserPlus, Shield, KeyRound, CheckCircle2, XCircle } from "lucide-react";
import { formatShortDateTime } from "@/hooks/use-clock";
import { cn } from "@/lib/utils";

const ROLE_BADGE: Record<Role, { bg: string; text: string }> = {
  admin: { bg: "bg-[#6C5CE7]/15", text: "text-[#6C5CE7]" },
  gerente: { bg: "bg-blue-100", text: "text-blue-700" },
  empleado: { bg: "bg-slate-100", text: "text-slate-700" },
};

export function UsuariosTab() {
  const { registerEmployee, updateRole, listUsers, user: currentUser } = useAuth();
  const [users, setUsers] = useState<Usuario[]>([]);
  const [search, setSearch] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [roleDialog, setRoleDialog] = useState<{ user: Usuario; newRole: Role } | null>(null);
  const [detailUser, setDetailUser] = useState<Usuario | null>(null);

  // register form
  const [cedula, setCedula] = useState("");
  const [nombre, setNombre] = useState("");
  const [role, setRole] = useState<Role>("empleado");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ cedula?: string; nombre?: string }>({});
  const [touched, setTouched] = useState<{ cedula?: boolean; nombre?: boolean }>({});

  const refresh = async () => {
    const list = await listUsers();
    setUsers(list);
  };
  useEffect(() => { refresh(); }, []);

  const filtered = users.filter((u) =>
    !search ||
    u.nombre.toLowerCase().includes(search.toLowerCase()) ||
    u.cedula.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  function validateField(field: "cedula" | "nombre", value: string): string | undefined {
    if (field === "cedula") {
      if (!value.trim()) return "La cédula es obligatoria";
      if (!/^\d{6,10}$/.test(value.trim())) return "Ingrese una cédula válida (6-10 dígitos)";
      return undefined;
    }
    if (field === "nombre") {
      if (!value.trim()) return "El nombre es obligatorio";
      if (value.trim().length < 3) return "El nombre debe tener al menos 3 caracteres";
      return undefined;
    }
    return undefined;
  }

  function validateForm(): boolean {
    const cedulaErr = validateField("cedula", cedula);
    const nombreErr = validateField("nombre", nombre);
    setErrors({ cedula: cedulaErr, nombre: nombreErr });
    setTouched({ cedula: true, nombre: true });
    return !cedulaErr && !nombreErr;
  }

  function handleFieldChange(field: "cedula" | "nombre", value: string, setter: (v: string) => void) {
    setter(value);
    if (touched[field]) {
      const err = validateField(field, value);
      setErrors((prev) => ({ ...prev, [field]: err }));
    }
  }

  async function handleRegister() {
    if (!validateForm()) return;
    setSaving(true);
    const res = await registerEmployee({ cedula, nombre, role });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || "Error");
      return;
    }
    setGeneratedPassword(res.password || null);
    toast.success("Empleado registrado");
    refresh();
  }

  function closeRegister() {
    setRegisterOpen(false);
    setCedula(""); setNombre(""); setRole("empleado"); setGeneratedPassword(null);
    setErrors({});
    setTouched({});
  }

  const hasErrors = !!errors.cedula || !!errors.nombre;
  const canSubmit = !hasErrors && cedula.trim().length > 0 && nombre.trim().length >= 3;

  async function confirmRoleChange() {
    if (!roleDialog) return;
    const res = await updateRole(roleDialog.user.id, roleDialog.newRole);
    if (!res.ok) {
      toast.error(res.error || "Error");
      return;
    }
    toast.success(`Rol de ${roleDialog.user.nombre} cambiado a ${ROLE_LABELS[roleDialog.newRole]}`);
    setRoleDialog(null);
    refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Shield size={18} className="text-[#6C5CE7]" /> Gestión de usuarios
            </h3>
            <p className="subtitle-underline text-xs text-slate-500">{users.length} usuarios registrados</p>
          </div>
          <Button onClick={() => setRegisterOpen(true)} size="sm" style={{ background: "#6C5CE7" }}>
            <UserPlus size={16} className="mr-1" /> Registrar empleado
          </Button>
        </div>

        <Input
          placeholder="Buscar por nombre, cédula o correo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3"
        />

        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="bg-[#F5F0FF] text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Nombre</th>
                <th className="px-3 py-2 text-left font-semibold">Cédula</th>
                <th className="px-3 py-2 text-left font-semibold">Correo</th>
                <th className="px-3 py-2 text-center font-semibold">Rol</th>
                <th className="px-3 py-2 text-center font-semibold">Estado</th>
                <th className="px-3 py-2 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => {
                const cfg = ROLE_BADGE[u.role];
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">{u.nombre}</td>
                    <td className="px-3 py-2 text-slate-600">{u.cedula}</td>
                    <td className="px-3 py-2 text-slate-600">{u.email}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", cfg.bg, cfg.text)}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {u.active ? (
                        <CheckCircle2 size={16} className="mx-auto text-emerald-600" />
                      ) : (
                        <XCircle size={16} className="mx-auto text-rose-500" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Select
                          value={u.role}
                          onValueChange={(v) => setRoleDialog({ user: u, newRole: v as Role })}
                        >
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="gerente">Gerente</SelectItem>
                            <SelectItem value="empleado">Empleado</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="ghost" onClick={() => setDetailUser(u)}>
                          Ver
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Register dialog */}
      <Dialog open={registerOpen} onOpenChange={(v) => !v && closeRegister()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="text-[#6C5CE7]" size={20} /> Registrar empleado
            </DialogTitle>
            <DialogDescription>
              Se generarán credenciales automáticas. El usuario inicia con cédula y contraseña <code>V+cédula</code>.
            </DialogDescription>
          </DialogHeader>

          {!generatedPassword ? (
            <>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label className={cn(errors.cedula && "text-rose-600")}>Cédula *</Label>
                  <Input
                    value={cedula}
                    onChange={(e) => handleFieldChange("cedula", e.target.value, setCedula)}
                    onBlur={(e) => {
                      const val = e.currentTarget.value;
                      setTouched((prev) => ({ ...prev, cedula: true }));
                      setErrors((prev) => ({ ...prev, cedula: validateField("cedula", val) }));
                    }}
                    placeholder="12345678"
                    className={cn(errors.cedula && "border-rose-400 ring-rose-200 focus-visible:ring-rose-300")}
                  />
                  {errors.cedula && (
                    <p className="flex items-center gap-1 text-xs text-rose-600">
                      <span>⚠</span> {errors.cedula}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className={cn(errors.nombre && "text-rose-600")}>Nombre completo *</Label>
                  <Input
                    value={nombre}
                    onChange={(e) => handleFieldChange("nombre", e.target.value, setNombre)}
                    onBlur={(e) => {
                      const val = e.currentTarget.value;
                      setTouched((prev) => ({ ...prev, nombre: true }));
                      setErrors((prev) => ({ ...prev, nombre: validateField("nombre", val) }));
                    }}
                    placeholder="Juan Pérez"
                    className={cn(errors.nombre && "border-rose-400 ring-rose-200 focus-visible:ring-rose-300")}
                  />
                  {errors.nombre && (
                    <p className="flex items-center gap-1 text-xs text-rose-600">
                      <span>⚠</span> {errors.nombre}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Rol inicial</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="empleado">Empleado</SelectItem>
                      <SelectItem value="gerente">Gerente</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeRegister}>Cancelar</Button>
                <Button
                  onClick={handleRegister}
                  disabled={saving || !canSubmit}
                  style={{ background: "#6C5CE7" }}
                >
                  {saving ? "Registrando..." : "Registrar"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-3 py-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-700">Empleado registrado</p>
                  <p className="mt-2 text-xs text-slate-600">Comparta estas credenciales con el empleado:</p>
                  <div className="mt-2 space-y-1 rounded-lg bg-white p-3 text-sm">
                    <p><span className="text-slate-500">Usuario:</span> <span className="font-mono font-bold">{cedula}</span></p>
                    <p><span className="text-slate-500">Correo:</span> <span className="font-mono">{cedula}@maquinaria.local</span></p>
                    <p><span className="text-slate-500">Contraseña:</span> <span className="font-mono font-bold text-[#6C5CE7]">{generatedPassword}</span></p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={closeRegister} style={{ background: "#6C5CE7" }}>Listo</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Role change confirm */}
      <Dialog open={!!roleDialog} onOpenChange={(v) => !v && setRoleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cambiar rol?</DialogTitle>
            <DialogDescription>
              Está por cambiar el rol de <strong>{roleDialog?.user.nombre}</strong> de{" "}
              <strong>{roleDialog ? ROLE_LABELS[roleDialog.user.role] : ""}</strong> a{" "}
              <strong>{roleDialog ? ROLE_LABELS[roleDialog.newRole] : ""}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)}>No</Button>
            <Button onClick={confirmRoleChange} style={{ background: "#6C5CE7" }}>Sí, cambiar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User detail */}
      <Dialog open={!!detailUser} onOpenChange={(v) => !v && setDetailUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailUser?.nombre}</DialogTitle>
            <DialogDescription>Detalle del usuario</DialogDescription>
          </DialogHeader>
          {detailUser && (
            <div className="space-y-2 py-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Cédula:</span><span className="font-medium">{detailUser.cedula}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Correo:</span><span className="font-medium">{detailUser.email}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Rol:</span><span className="font-medium">{ROLE_LABELS[detailUser.role]}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Estado:</span><span className="font-medium">{detailUser.active ? "Activo" : "Inactivo"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Registrado:</span><span className="font-medium">{formatShortDateTime(detailUser.created_at)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Actualizado:</span><span className="font-medium">{formatShortDateTime(detailUser.updated_at)}</span></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
