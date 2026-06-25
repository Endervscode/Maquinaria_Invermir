"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, User as UserIcon, Truck, KeyRound } from "lucide-react";
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
  const { login, resetPasswordByCedula } = useAuth();
  const online = useOnlineStatus();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryCedula, setRecoveryCedula] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [loginErrors, setLoginErrors] = useState<{ identifier?: string; password?: string }>({});

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
    toast.success(`Contraseña reseteada a: ${res.password}`);
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

          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p className="mb-1 font-semibold text-slate-700">Cuentas de administrador:</p>
            <p>deya@maquinaria.local · jhonatan@maquinaria.local</p>
            <p className="mt-1 text-slate-500">Contraseña: <code className="rounded bg-white px-1 py-0.5">admin123</code></p>
          </div>
        </div>
      </div>

      {/* Password recovery dialog */}
      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="text-[#6C5CE7]" size={20} /> Recuperar contraseña
            </DialogTitle>
            <DialogDescription>
              Ingrese su cédula. Su contraseña será reseteada a <strong>V + cédula</strong>.
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
