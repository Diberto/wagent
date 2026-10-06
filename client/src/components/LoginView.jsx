import React, { useState } from 'react';
import { 
  Lock, 
  User, 
  Flame, 
  Eye, 
  EyeOff, 
  LogIn, 
  ShieldCheck, 
  ShoppingBag, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  KeyRound
} from 'lucide-react';

export default function LoginView({ onLoginSuccess, onGuestClientAccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Por favor, ingresá tu usuario o correo electrónico.');
      return;
    }
    if (!password.trim()) {
      setError('Por favor, ingresá tu contraseña de acceso.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: username.trim(), 
          password: password.trim() 
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Credenciales inválidas. Verificá tu usuario y contraseña.');
      }

      // Persistir sesión local
      if (data.user) {
        localStorage.setItem('wagent_user', JSON.stringify(data.user));
        if (data.token) {
          localStorage.setItem('wagent_session', data.token);
        }
        onLoginSuccess(data.user, data.token);
      }
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      setError(err.message || 'No se pudo conectar con el servidor de autenticación.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFillAdmin = () => {
    setUsername('republica');
    setPassword('R3publ1c4B0t');
    setError(null);
  };

  const handleEnterAsClient = () => {
    const clientUser = {
      id: 'usr-cliente-online',
      name: 'Cliente Online',
      username: 'cliente',
      role: 'cliente',
      roles: ['cliente'],
      tabs: ['storefront'],
      permissions: {
        canViewStore: true,
        canOrderWhatsApp: true
      }
    };
    localStorage.setItem('wagent_user', JSON.stringify(clientUser));
    localStorage.setItem('wagent_session', 'session_client_guest');
    if (onGuestClientAccess) {
      onGuestClientAccess(clientUser);
    } else {
      onLoginSuccess(clientUser, 'session_client_guest');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070b0e] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden select-none font-sans">
      
      {/* Decorative Background Orbs & Radial Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-red-600/20 blur-[130px]" />
        <div className="absolute top-1/2 -right-32 w-96 h-96 rounded-full bg-emerald-500/15 blur-[140px]" />
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 rounded-full bg-amber-500/10 blur-[130px]" />
      </div>

      {/* Main Login Card Container */}
      <div className="w-full max-w-md relative z-10 space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3.5 rounded-3xl bg-gradient-to-tr from-red-600 via-red-500 to-amber-500 shadow-2xl shadow-red-600/30 ring-4 ring-white/10 mb-2">
            <Flame className="w-10 h-10 text-white fill-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            República de la Carne
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium">
            Sistema de Gestión Integral & Control de Accesos
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#111b21]/90 backdrop-blur-2xl border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 space-y-5">
          
          <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Ingreso al Sistema
              </h2>
            </div>
            <span className="text-[10px] bg-emerald-500/15 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
              Seguro RBAC
            </span>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Username Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                Usuario o Correo:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ej: republica"
                  autoComplete="username"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-[#182229] border border-slate-700/80 hover:border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none transition"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                Contraseña o PIN:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-11 py-3 bg-[#182229] border border-slate-700/80 hover:border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black rounded-2xl text-sm shadow-xl shadow-emerald-600/25 flex items-center justify-center gap-2 transition transform active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Verificando credenciales...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Ingresar al Sistema</span>
                </>
              )}
            </button>
          </form>

          {/* Admin Credentials Helper Badge */}
          <div 
            onClick={handleFillAdmin}
            className="p-3 bg-[#182229]/80 border border-slate-700/60 hover:border-emerald-500/50 rounded-2xl cursor-pointer transition group"
            title="Hacer clic para autocompletar credenciales de administrador"
          >
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-extrabold text-amber-400 flex items-center gap-1">
                <span>👑</span> Admin por Defecto:
              </span>
              <span className="text-[10px] text-emerald-400 group-hover:underline font-semibold">
                Autocompletar ⚡
              </span>
            </div>
            <div className="text-[11px] text-slate-300 font-mono flex items-center justify-between bg-[#0b141a] px-2.5 py-1.5 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500">Usuario:</span> <strong className="text-white">republica</strong>
              </div>
              <div>
                <span className="text-slate-500">Clave:</span> <strong className="text-white">R3publ1c4B0t</strong>
              </div>
            </div>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              ¿Sos Cliente?
            </span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          {/* Client / Customer Direct Access Button */}
          <button
            type="button"
            onClick={handleEnterAsClient}
            className="w-full py-3 px-4 bg-gradient-to-r from-red-600/20 via-amber-600/15 to-red-600/20 hover:from-red-600/30 hover:to-amber-600/25 border border-red-500/30 hover:border-red-500/50 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2.5 transition active:scale-98 shadow-md"
          >
            <ShoppingBag className="w-4 h-4 text-red-400" />
            <span>Acceder a la Tienda Online como Cliente</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        {/* Security / RBAC Summary Footer */}
        <div className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Acceso segmentado: Los clientes solo ven la tienda y pedidos WhatsApp.</span>
        </div>

      </div>
    </div>
  );
}
