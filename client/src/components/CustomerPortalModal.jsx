import React, { useState, useEffect } from 'react';
import { 
  User, 
  Lock, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  ArrowRight, 
  RefreshCw, 
  ShieldCheck, 
  Package, 
  Flame, 
  LogOut, 
  Eye, 
  EyeOff,
  Sparkles,
  Home
} from 'lucide-react';

export default function CustomerPortalModal({ 
  isOpen, 
  onClose, 
  currentUser = null, 
  onLoginSuccess = null, 
  onLogout = null,
  initialView = 'profile' // 'profile' | 'login' | 'register' | 'forgot'
}) {
  const [view, setView] = useState(initialView); // 'login' | 'register' | 'forgot' | 'profile' | 'orders'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Auth inputs
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot password OTP inputs
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetStep, setResetStep] = useState(1); // 1: Send OTP, 2: Enter code & new password
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');

  // 7-Field Profile state
  const [profileData, setProfileData] = useState({
    fullName: '',
    phone: '',
    address: '',
    neighborhood: '',
    postalCode: '',
    email: '',
    birthDate: '',
    password: ''
  });

  // User orders
  const [userOrders, setUserOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Active user state
  const [activeUser, setActiveUser] = useState(currentUser);

  useEffect(() => {
    setActiveUser(currentUser);
    if (currentUser) {
      setProfileData({
        fullName: currentUser.fullName || currentUser.name || '',
        phone: currentUser.phone || '',
        address: currentUser.address || '',
        neighborhood: currentUser.neighborhood || '',
        postalCode: currentUser.postalCode || '',
        email: currentUser.email || '',
        birthDate: currentUser.birthDate || '',
        password: ''
      });
      setView('profile');
    } else {
      setView(initialView === 'profile' ? 'login' : initialView);
    }
  }, [currentUser, initialView, isOpen]);

  if (!isOpen) return null;

  // Evaluar porcentaje de completitud 7/7
  const calculateCompleteness = () => {
    const fields = [
      profileData.fullName?.trim()?.length >= 3,
      profileData.phone?.trim()?.length >= 8,
      profileData.address?.trim()?.length >= 4,
      profileData.neighborhood?.trim()?.length >= 3,
      profileData.postalCode?.trim()?.length >= 3,
      profileData.email?.includes('@') && profileData.email?.includes('.'),
      profileData.birthDate?.trim()?.length >= 4
    ];
    const completedCount = fields.filter(Boolean).length;
    return {
      count: completedCount,
      percentage: Math.round((completedCount / 7) * 100)
    };
  };

  const completeness = calculateCompleteness();

  // 1. Manejo de Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');

      localStorage.setItem('wagent_auth_token', data.token);
      localStorage.setItem('wagent_user', JSON.stringify(data.user));
      setActiveUser(data.user);
      setProfileData({
        fullName: data.user.fullName || '',
        phone: data.user.phone || '',
        address: data.user.address || '',
        neighborhood: data.user.neighborhood || '',
        postalCode: data.user.postalCode || '',
        email: data.user.email || '',
        birthDate: data.user.birthDate || '',
        password: ''
      });
      setSuccessMsg('¡Bienvenido de vuelta!');
      setView('profile');
      if (onLoginSuccess) onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Manejo de Recuperación OTP
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: resetIdentifier })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error enviando código');

      setSuccessMsg(data.message || 'Código OTP de 6 dígitos enviado.');
      setResetStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: resetIdentifier,
          otpCode: resetCode,
          newPassword: resetNewPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error restableciendo contraseña');

      localStorage.setItem('wagent_auth_token', data.token);
      localStorage.setItem('wagent_user', JSON.stringify(data.user));
      setActiveUser(data.user);
      setSuccessMsg('Contraseña actualizada con éxito. ¡Sesión iniciada!');
      setView('profile');
      if (onLoginSuccess) onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Manejo de Registro o Actualización de Perfil (7 Campos)
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const token = localStorage.getItem('wagent_auth_token');
      const url = activeUser ? '/api/v1/user/me/profile' : '/api/v1/auth/register';
      const headers = { 'Content-Type': 'application/json' };
      if (token && activeUser) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url, {
        method: activeUser ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(profileData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error guardando perfil');

      const updatedUser = data.user || data;
      if (data.token) {
        localStorage.setItem('wagent_auth_token', data.token);
      }
      localStorage.setItem('wagent_user', JSON.stringify(updatedUser));
      setActiveUser(updatedUser);
      setSuccessMsg(activeUser ? '¡Perfil 7/7 actualizado correctamente!' : '¡Cuenta registrada con éxito!');
      setView('profile');
      if (onLoginSuccess) onLoginSuccess(updatedUser);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 4. Cargar Pedidos del Usuario
  const loadOrders = async () => {
    if (!activeUser?.phone && !activeUser?.email) return;
    setLoadingOrders(true);
    try {
      const q = activeUser.phone || activeUser.email;
      const res = await fetch(`/api/orders/track/${encodeURIComponent(q)}`);
      const data = await res.json();
      setUserOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Error cargando pedidos:', e);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleOpenOrders = () => {
    setView('orders');
    loadOrders();
  };

  const handleLogout = () => {
    localStorage.removeItem('wagent_auth_token');
    localStorage.removeItem('wagent_user');
    setActiveUser(null);
    setView('login');
    if (onLogout) onLogout();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#182229] border border-slate-700/80 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-700/70 bg-[#111b21] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-600/20 text-red-400 flex items-center justify-center font-bold">
              {activeUser ? <User size={20} /> : <ShieldCheck size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {activeUser ? (activeUser.fullName || 'Mi Cuenta') : 'Portal de Clientes'}
                {activeUser && (
                  <span className="text-[11px] bg-red-600/30 text-red-300 font-medium px-2 py-0.5 rounded-full border border-red-500/30">
                    {completeness.count}/7 Datos
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {activeUser ? 'Perfil unificado universal & pedidos' : 'Iniciá sesión o completá tu perfil'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Navigation Tabs (cuando el usuario está logueado) */}
        {activeUser && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-900/60 border-b border-slate-800 text-xs">
            <button
              onClick={() => setView('profile')}
              className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
                view === 'profile' ? 'bg-red-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <User size={14} />
              Datos de Contacto (7/7)
            </button>
            <button
              onClick={handleOpenOrders}
              className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
                view === 'orders' ? 'bg-red-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Package size={14} />
              Historial de Pedidos
            </button>
            <div className="flex-1" />
            <button
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 transition flex items-center gap-1 font-semibold"
            >
              <LogOut size={13} />
              Salir
            </button>
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-950/60 border border-red-800/80 text-red-200 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
          
          {/* VIEW: LOGIN */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="text-center py-2">
                <h3 className="text-base font-bold text-white">Ingresá a tu Cuenta</h3>
                <p className="text-xs text-slate-400 mt-0.5">Accedé con tu teléfono o correo y contraseña</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Teléfono o Correo Electrónico</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 text-slate-400" size={16} />
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Ej: +54 9 11 4455-6677 o cliente@gmail.com"
                    className="w-full bg-[#111b21] border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-500 transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">Contraseña</label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetIdentifier(loginIdentifier);
                      setView('forgot');
                    }}
                    className="text-xs text-red-400 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 text-slate-400" size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Tu clave secreta"
                    className="w-full bg-[#111b21] border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-red-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition shadow-lg shadow-red-900/30 flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                Ingresar a Mi Perfil
              </button>

              <div className="text-center pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400">¿No tenés una cuenta registrada? </span>
                <button
                  type="button"
                  onClick={() => setView('register')}
                  className="text-xs text-red-400 font-bold hover:underline"
                >
                  Registrate en 1 minuto
                </button>
              </div>
            </form>
          )}

          {/* VIEW: FORGOT PASSWORD (OTP) */}
          {view === 'forgot' && (
            <div className="space-y-4">
              <div className="text-center py-2">
                <h3 className="text-base font-bold text-white">Recuperar Contraseña</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Te enviaremos un código de seguridad de 6 dígitos por WhatsApp y correo
                </p>
              </div>

              {resetStep === 1 ? (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Ingresá tu Teléfono o Correo
                    </label>
                    <input
                      type="text"
                      required
                      value={resetIdentifier}
                      onChange={(e) => setResetIdentifier(e.target.value)}
                      placeholder="Ej: +54 9 11 4455-6677 o tuemail@gmail.com"
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
                  >
                    {loading ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    Enviar Código OTP (WhatsApp)
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setView('login')}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      ← Volver a Iniciar Sesión
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Código de 6 Dígitos recibido
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="123456"
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3.5 py-2.5 text-center text-lg tracking-widest font-mono text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Nueva Contraseña
                    </label>
                    <input
                      type="password"
                      required
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
                  >
                    {loading ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    Verificar y Cambiar Contraseña
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setResetStep(1)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Reenviar código a otro teléfono o correo
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* VIEW: REGISTER / PROFILE EDIT (7 MANDATORY PROFILE FIELDS) */}
          {(view === 'register' || view === 'profile') && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              
              {/* Progress Bar Completeness */}
              <div className="bg-[#111b21] p-3.5 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck size={14} className={completeness.percentage === 100 ? 'text-emerald-400' : 'text-amber-400'} />
                    Completitud del Perfil Obligatorio: {completeness.count}/7
                  </span>
                  <span className="font-bold text-red-400">{completeness.percentage}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${
                      completeness.percentage === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-red-500'
                    }`}
                    style={{ width: `${completeness.percentage}%` }}
                  />
                </div>
                {completeness.percentage < 100 && (
                  <p className="text-[11px] text-amber-400/90 mt-1.5">
                    ⚠️ Se requieren los 7 datos para completar pedidos por WhatsApp, Mostrador o Tienda Online.
                  </p>
                )}
              </div>

              {/* Grid 7 Campos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Nombre Completo */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    1. Nombre y Apellido Completo *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input
                      type="text"
                      required
                      value={profileData.fullName}
                      onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                      placeholder="Ej: Mariano López"
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* 2. Teléfono WhatsApp */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    2. Teléfono Celular (WhatsApp) *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input
                      type="tel"
                      required
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      placeholder="+54 9 11 4455-6677"
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* 3. Correo Electrónico */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    3. Correo Electrónico *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input
                      type="email"
                      required
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                      placeholder="mariano@gmail.com"
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* 4. Dirección */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    4. Dirección de Entrega (Calle y Número) *
                  </label>
                  <div className="relative">
                    <Home className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input
                      type="text"
                      required
                      value={profileData.address}
                      onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                      placeholder="Ej: Av. Santa Fe 3420, Piso 4B"
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* 5. Barrio */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    5. Barrio / Localidad *
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input
                      type="text"
                      required
                      value={profileData.neighborhood}
                      onChange={(e) => setProfileData({ ...profileData, neighborhood: e.target.value })}
                      placeholder="Ej: Palermo / Urca"
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* 6. Código Postal */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    6. Código Postal *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileData.postalCode}
                    onChange={(e) => setProfileData({ ...profileData, postalCode: e.target.value })}
                    placeholder="Ej: 1425 o X5009"
                    className="w-full bg-[#111b21] border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                {/* 7. Fecha de Nacimiento */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    7. Fecha de Nacimiento (Día del Cumpleaños para Promos y Regalos) *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input
                      type="date"
                      required
                      value={profileData.birthDate}
                      onChange={(e) => setProfileData({ ...profileData, birthDate: e.target.value })}
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* Contraseña (para registro o cambio) */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    {activeUser ? 'Cambiar Contraseña (opcional)' : 'Crear Contraseña de Acceso *'}
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input
                      type="password"
                      required={!activeUser}
                      value={profileData.password}
                      onChange={(e) => setProfileData({ ...profileData, password: e.target.value })}
                      placeholder={activeUser ? 'Dejar en blanco para mantener la actual' : 'Mínimo 6 caracteres'}
                      className="w-full bg-[#111b21] border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition shadow-lg shadow-red-900/30 flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                {activeUser ? 'Guardar Cambios del Perfil' : 'Registrar Mi Cuenta 7/7'}
              </button>

              {!activeUser && (
                <div className="text-center pt-2">
                  <span className="text-xs text-slate-400">¿Ya tenés una cuenta? </span>
                  <button
                    type="button"
                    onClick={() => setView('login')}
                    className="text-xs text-red-400 font-bold hover:underline"
                  >
                    Iniciá sesión aquí
                  </button>
                </div>
              )}
            </form>
          )}

          {/* VIEW: ORDER HISTORY */}
          {view === 'orders' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Tus Pedidos Realizados</h3>
                <button
                  onClick={loadOrders}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <RefreshCw size={12} className={loadingOrders ? 'animate-spin' : ''} />
                  Actualizar
                </button>
              </div>

              {loadingOrders ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Cargando pedidos...
                </div>
              ) : userOrders.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs bg-[#111b21] rounded-2xl border border-slate-800 p-4">
                  <Package className="mx-auto mb-2 text-slate-600" size={32} />
                  No encontramos pedidos recientes asociados a tu teléfono ({activeUser?.phone || 'sin teléfono registrado'}).
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto custom-scrollbar">
                  {userOrders.map((ord) => (
                    <div 
                      key={ord.id}
                      className="p-3 bg-[#111b21] border border-slate-800 rounded-2xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">Pedido #{ord.id.slice(-6)}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                            {ord.status || 'Pendiente'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {ord.createdAt ? new Date(ord.createdAt).toLocaleDateString('es-AR') : 'Reciente'} · {ord.items?.length || 0} productos
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-emerald-400">
                          ${(ord.total || 0).toLocaleString('es-AR')}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          {ord.paymentMethod || 'Efectivo'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="p-3.5 bg-[#111b21] border-t border-slate-800 text-[11px] text-slate-500 text-center flex items-center justify-center gap-2">
          <Flame size={13} className="text-red-500" />
          <span>República de la Carne · Perfil Universal Omnicanal</span>
        </div>

      </div>
    </div>
  );
}
