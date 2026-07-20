"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, User as UserIcon, Truck, KeyRound, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function LoginScreen() {
  const { login, registerEmployee, resetPasswordByCedula } = useAuth();
  const online = useOnlineStatus();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryCedula, setRecoveryCedula] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [loginErrors, setLoginErrors] = useState<{ identifier?: string; password?: string }>({});
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regCedula, setRegCedula] = useState("");
  const [regNombre, setRegNombre] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  function validateLogin(): boolean {
    const errs: { identifier?: string; password?: string } = {};
    if (!identifier.trim()) errs.identifier = "Ingrese su usuario (cédula o correo)";
    if (!password.trim()) errs.password = "Ingrese su contraseña";
    setLoginErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateLogin()) return;
    setLoading(true);
    const res = await login(identifier, password);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error || "Error de inicio de sesión");
      return;
    }
    toast.success("Bienvenido");
  }

  async function handleRegister() {
    if (!regCedula.trim() || !regNombre.trim()) {
      toast.error("Complete todos los campos");
      return;
    }
    if (!/^\d{6,10}$/.test(regCedula.trim())) {
      toast.error("La cédula debe tener entre 6 y 10 dígitos");
      return;
    }
    if (regNombre.trim().length < 3) {
      toast.error("El nombre debe tener al menos 3 caracteres");
      return;
    }
    setRegLoading(true);
    const res = await registerEmployee({ cedula: regCedula.trim(), nombre: regNombre.trim() });
    setRegLoading(false);
    if (!res.ok) {
      toast.error(res.error || "Error al registrarse");
      return;
    }
    toast.success(`Registrado exitosamente. Su contraseña es: V${regCedula.trim()}`);
    setRegisterOpen(false);
    setRegCedula("");
    setRegNombre("");
  }

  async function onRecover() {
    if (!recoveryCedula.trim()) {
      toast.error("Ingrese su cédula");
      return;
    }
    setRecoveryLoading(true);
    const res = await resetPasswordByCedula(recoveryCedula);
    setRecoveryLoading(false);
    if (!res.ok) {
      toast.error(res.error || "No se pudo resetear");
      return;
    }
    toast.success(`Contraseña reseteada a: V${recoveryCedula}`);
    setRecoveryOpen(false);
    setRecoveryCedula("");
  }

  return (
    <div className="login-grid bg-white">
      {/* Left brand side - purple */}
      <div className="login-side-brand relative flex flex-col items-center justify-center gap-8 p-12 text-white"
        style={{ background: "linear-gradient(135deg, #6C5CE7 0%, #5a4bd1 100%)" }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 20% 30%, white 2px, transparent 2px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)", backgroundSize: "60px 60px, 40px 40px" }} />
        <div className="relative z-10 flex flex-col items-center gap-6 text-center">
          <div className="grid place-items-center rounded-3xl bg-white/15 backdrop-blur-sm p-6">
            <Truck size={72} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-5xl font-black tracking-tight">¡BIENVENIDO!</h1>
            <p className="mt-3 text-xl font-light text-white/85">Control de Maquinaria</p>
            <div className="mt-4 mx-auto h-1 w-20 rounded-full bg-white/70" />
          </div>
          <p className="max-w-md text-sm text-white/75 leading-relaxed">
            Sistema integral para la gestión, control y seguimiento de maquinaria pesada,
            turnos de operación y productividad minera.
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs text-white/70">
            <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-300" : "bg-rose-300"}`} />
            {online ? "En línea" : "Sin conexión · modo offline"}
            {!isSupabaseConfigured && " · solo IndexedDB"}
          </div>
        </div>
      </div>

      {/* Right form side - white */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900">Iniciar sesión</h2>
            <p className="subtitle-underline mt-2 text-sm text-slate-500">
              Ingrese sus credenciales para continuar
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-sm font-medium">
                Usuario (cédula o correo)
              </Label>
              <div className="relative">
                <UserIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (loginErrors.identifier) setLoginErrors((prev) => ({ ...prev, identifier: undefined }));
                  }}
                  placeholder="Ej: 12345678 o admin@maquinaria.local"
                  className={cn("pl-10", loginErrors.identifier && "border-rose-400 ring-rose-200 focus-visible:ring-rose-300")}
                  autoComplete="username"
                />
              </div>
              {loginErrors.identifier && (
                <p className="flex items-center gap-1 text-xs text-rose-600">
                  <span>⚠</span> {loginErrors.identifier}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Contraseña
                </Label>
                <button
                  type="button"
                  onClick={() => setRecoveryOpen(true)}
                  className="text-xs font-medium text-[#6C5CE7] hover:underline"
                >
                  ¿Olvidó su contraseña?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (loginErrors.password) setLoginErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="••••••••"
                  className={cn("pl-10 pr-10", loginErrors.password && "border-rose-400 ring-rose-200 focus-visible:ring-rose-300")}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-base font-semibold"
              style={{ background: "#6C5CE7" }}
            >
              {loading ? "Verificando..." : "Ingresar"}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400">o</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => setRegisterOpen(true)}
            className="w-full h-11 text-base font-semibold border-2 border-[#6C5CE7] text-[#6C5CE7] hover:bg-[#F5F0FF]"
          >
            <UserPlus size={18} className="mr-2" /> Registrarse como empleado
          </Button>


        </div>
      </div>

      {/* Employee self-registration dialog */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="text-[#6C5CE7]" size={20} /> Registro de empleado
            </DialogTitle>
            <DialogDescription>
              Ingrese su cédula y nombre. Se le asignará una contraseña <strong>V + cédula</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reg-cedula">Cédula</Label>
              <Input
                id="reg-cedula"
                value={regCedula}
                onChange={(e) => setRegCedula(e.target.value)}
                placeholder="Ej: 12345678"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-nombre">Nombre completo</Label>
              <Input
                id="reg-nombre"
                value={regNombre}
                onChange={(e) => setRegNombre(e.target.value)}
                placeholder="Ej: Juan Pérez"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>Cancelar</Button>
            <Button disabled={regLoading || !regCedula.trim() || !regNombre.trim()} onClick={handleRegister} style={{ background: "#6C5CE7" }}>
              {regLoading ? "Registrando..." : "Registrarse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password recovery dialog */}
      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="text-[#6C5CE7]" size={20} /> Recuperar contraseña
            </DialogTitle>
            <DialogDescription>
              Ingrese su cédula. La contraseña se reseteará a <strong>V + cédula</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="rec-cedula" className="mb-2 block">Cédula</Label>
            <Input
              id="rec-cedula"
              value={recoveryCedula}
              onChange={(e) => setRecoveryCedula(e.target.value)}
              placeholder="Ej: 12345678"
              onKeyDown={(e) => { if (e.key === "Enter") onRecover(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecoveryOpen(false)}>Cancelar</Button>
            <Button disabled={recoveryLoading} onClick={onRecover} style={{ background: "#6C5CE7" }}>
              {recoveryLoading ? "Reseteando..." : "Resetear contraseña"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
