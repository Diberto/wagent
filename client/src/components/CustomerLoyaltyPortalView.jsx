import React, { useState, useEffect } from 'react';
import { 
  Crown, 
  Gift, 
  Sparkles, 
  Phone, 
  ShoppingBag, 
  History, 
  Clock, 
  Award, 
  Calendar, 
  Store, 
  User, 
  CheckCircle2, 
  ArrowRight, 
  LogOut, 
  RefreshCw, 
  AlertCircle,
  Tag,
  ChevronRight,
  TrendingUp,
  MapPin,
  ChevronDown,
  Lock,
  Key,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  MessageSquareCode,
  ArrowLeft
} from 'lucide-react';

export default function CustomerLoyaltyPortalView() {
  // Estado de autenticación
  const [customer, setCustomer] = useState(() => {
    try {
      const saved = localStorage.getItem('wagent_loyalty_customer');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Etapas de login: 'phone' | 'pin' | 'set-pin' | 'otp'
  const [authStage, setAuthStage] = useState('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [authData, setAuthData] = useState(null); // { phone, customerName, maskedPhone }
  
  // Inputs de PIN y OTP
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpDevCode, setOtpDevCode] = useState(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpMode, setOtpMode] = useState('login'); // 'login' | 'reset-pin'

  // Estado general
  const [checking, setChecking] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [branches, setBranches] = useState([]);
  const [formConfig, setFormConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'orders' | 'history' | 'profile'
  const [redeemModal, setRedeemModal] = useState({ open: false, points: 50 });
  const [redeemSuccess, setRedeemSuccess] = useState(null);
  const [formError, setFormError] = useState(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState(null);

  // Formulario de Registro nuevo cliente
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    preferredBranch: '',
    address: '',
    birthDate: '',
    cookingPreference: 'Parrilla',
    pin: '',
    pinConfirm: ''
  });
  const [savingForm, setSavingForm] = useState(false);

  // Formulario de cambio de PIN en pestaña Perfil
  const [changePinForm, setChangePinForm] = useState({ currentPin: '', pin: '', pinConfirm: '' });
  const [changingPin, setChangingPin] = useState(false);
  const [pinChangeMsg, setPinChangeMsg] = useState(null);
  const [pinChangeError, setPinChangeError] = useState(null);

  // Countdown timer para reenvío de OTP
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  // Cargar configuración de campos y sucursales
  useEffect(() => {
    const loadConfigAndBranches = async () => {
      try {
        const [resConfig, resBranches] = await Promise.all([
          fetch('/api/loyalty/config'),
          fetch('/api/loyalty/portal/branches')
        ]);
        if (resConfig.ok) {
          const cfg = await resConfig.json();
          setFormConfig(cfg.registrationFormConfig);
        }
        if (resBranches.ok) {
          const brs = await resBranches.json();
          setBranches(brs);
          if (brs.length > 0 && !formData.preferredBranch) {
            setFormData(prev => ({ ...prev, preferredBranch: brs[0].name }));
          }
        }
      } catch (err) {
        console.error('Error cargando configuración:', err);
      }
    };
    loadConfigAndBranches();
  }, []);

  // Actualizar datos del cliente periódicamente si ya está logueado
  const refreshCustomerData = async (customerId) => {
    if (!customerId) return;
    try {
      const res = await fetch('/api/loyalty/portal/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId })
      });
      const data = await res.json();
      if (data.success && data.customer) {
        setCustomer(data.customer);
        localStorage.setItem('wagent_loyalty_customer', JSON.stringify(data.customer));
      }
    } catch (e) {
      console.warn('Error refreshing customer data:', e);
    }
  };

  // PASO 1: Verificar teléfono
  const handlePhoneCheck = async (e) => {
    e.preventDefault();
    if (!phoneInput || phoneInput.trim().length < 6) {
      setFormError('Ingresá un número de teléfono válido.');
      return;
    }

    setChecking(true);
    setFormError(null);
    setAuthSuccessMsg(null);

    try {
      const res = await fetch('/api/loyalty/portal/check-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput })
      });
      const data = await res.json();

      if (data.exists) {
        setAuthData({
          phone: phoneInput,
          customerName: data.customerName || 'Cliente Club',
          maskedPhone: data.maskedPhone || phoneInput
        });

        if (data.hasPin) {
          // Cliente ya tiene PIN configurado -> pedir PIN
          setPinInput('');
          setAuthStage('pin');
        } else {
          // Cliente existe pero no tiene PIN (creado antes de esta función) -> solicitar que cree su PIN
          setNewPin('');
          setConfirmPin('');
          setAuthStage('set-pin');
        }
        setIsRegisterMode(false);
      } else {
        // No existe: abrir formulario de registro para sumarlo al club
        setFormData(prev => ({ ...prev, phone: phoneInput }));
        setIsRegisterMode(true);
      }
    } catch (err) {
      setFormError('Error de conexión al verificar el teléfono. Intente nuevamente.');
    } finally {
      setChecking(false);
    }
  };

  // PASO 2A: Validar PIN de 4 dígitos
  const handleVerifyPin = async (e) => {
    e.preventDefault();
    if (!pinInput || pinInput.length < 4) {
      setFormError('Ingresá tu PIN numérico de 4 dígitos.');
      return;
    }

    setChecking(true);
    setFormError(null);

    try {
      const res = await fetch('/api/loyalty/portal/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: authData.phone, pin: pinInput })
      });
      const data = await res.json();

      if (res.ok && data.success && data.customer) {
        setCustomer(data.customer);
        localStorage.setItem('wagent_loyalty_customer', JSON.stringify(data.customer));
        setPinInput('');
      } else {
        setFormError(data.error || 'PIN incorrecto.');
      }
    } catch (err) {
      setFormError('Error al validar el PIN. Intente nuevamente.');
    } finally {
      setChecking(false);
    }
  };

  // PASO 2B: Configurar PIN inicial para clientes existentes sin PIN
  const handleSetInitialPin = async (e) => {
    e.preventDefault();
    if (!newPin || newPin.length < 4) {
      setFormError('El PIN debe tener al menos 4 dígitos numéricos.');
      return;
    }
    if (newPin !== confirmPin) {
      setFormError('Los PINs ingresados no coinciden.');
      return;
    }

    setChecking(true);
    setFormError(null);

    try {
      const res = await fetch('/api/loyalty/portal/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: authData.phone, pin: newPin })
      });
      const data = await res.json();

      if (res.ok && data.success && data.customer) {
        setCustomer(data.customer);
        localStorage.setItem('wagent_loyalty_customer', JSON.stringify(data.customer));
        setNewPin('');
        setConfirmPin('');
      } else {
        setFormError(data.error || 'No se pudo guardar el PIN.');
      }
    } catch (err) {
      setFormError('Error al guardar el PIN.');
    } finally {
      setChecking(false);
    }
  };

  // PASO 2C: Solicitar código OTP por WhatsApp
  const handleRequestOtp = async () => {
    if (!authData?.phone) return;
    setChecking(true);
    setFormError(null);
    setAuthSuccessMsg(null);

    try {
      const res = await fetch('/api/loyalty/portal/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: authData.phone })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setAuthStage('otp');
        setOtpDevCode(data.devCode || null);
        setOtpCountdown(60);
        setAuthSuccessMsg(data.message || 'Código enviado por WhatsApp.');
      } else {
        setFormError(data.error || 'No se pudo enviar el código por WhatsApp.');
      }
    } catch (err) {
      setFormError('Error al solicitar el código.');
    } finally {
      setChecking(false);
    }
  };

  // PASO 2D: Validar código OTP (acceso o restablecer PIN)
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setFormError('Ingresá el código de 6 dígitos recibido por WhatsApp.');
      return;
    }

    setChecking(true);
    setFormError(null);

    try {
      if (otpMode === 'login') {
        // Login directo con código OTP
        const res = await fetch('/api/loyalty/portal/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: authData.phone, code: otpCode.trim() })
        });
        const data = await res.json();

        if (res.ok && data.success && data.customer) {
          setCustomer(data.customer);
          localStorage.setItem('wagent_loyalty_customer', JSON.stringify(data.customer));
          setOtpCode('');
        } else {
          setFormError(data.error || 'Código incorrecto o expirado.');
        }
      } else {
        // Restablecer nuevo PIN con OTP
        if (!newPin || newPin.length < 4) {
          setFormError('El nuevo PIN debe tener entre 4 y 6 dígitos.');
          setChecking(false);
          return;
        }
        if (newPin !== confirmPin) {
          setFormError('Los PINs no coinciden.');
          setChecking(false);
          return;
        }

        const res = await fetch('/api/loyalty/portal/reset-pin-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: authData.phone,
            code: otpCode.trim(),
            newPin
          })
        });
        const data = await res.json();

        if (res.ok && data.success && data.customer) {
          setCustomer(data.customer);
          localStorage.setItem('wagent_loyalty_customer', JSON.stringify(data.customer));
          setOtpCode('');
          setNewPin('');
          setConfirmPin('');
        } else {
          setFormError(data.error || 'No se pudo restablecer el PIN.');
        }
      }
    } catch (err) {
      setFormError('Error al procesar la verificación.');
    } finally {
      setChecking(false);
    }
  };

  // PASO 3: Registro nuevo cliente con PIN obligatorio
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!formData.pin || formData.pin.length < 4) {
      setFormError('Creá un PIN de seguridad de al menos 4 dígitos numéricos.');
      return;
    }
    if (formData.pin !== formData.pinConfirm) {
      setFormError('Los PINs ingresados no coinciden.');
      return;
    }

    setSavingForm(true);
    setFormError(null);

    try {
      const res = await fetch('/api/loyalty/portal/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (res.ok && data.success && data.customer) {
        setCustomer(data.customer);
        localStorage.setItem('wagent_loyalty_customer', JSON.stringify(data.customer));
        setIsRegisterMode(false);
      } else {
        setFormError(data.error || 'Error al completar el registro.');
      }
    } catch (err) {
      setFormError(err.message || 'Error de conexión.');
    } finally {
      setSavingForm(false);
    }
  };

  // Cambiar PIN desde la pestaña Mi Perfil
  const handleChangePinInProfile = async (e) => {
    e.preventDefault();
    setPinChangeError(null);
    setPinChangeMsg(null);

    if (!changePinForm.pin || changePinForm.pin.length < 4) {
      setPinChangeError('El nuevo PIN debe tener entre 4 y 6 dígitos.');
      return;
    }
    if (changePinForm.pin !== changePinForm.pinConfirm) {
      setPinChangeError('Los nuevos PINs no coinciden.');
      return;
    }

    setChangingPin(true);
    try {
      const res = await fetch('/api/loyalty/portal/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: customer.customerPhone,
          pin: changePinForm.pin,
          currentPin: changePinForm.currentPin
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setPinChangeMsg('¡PIN actualizado correctamente!');
        setChangePinForm({ currentPin: '', pin: '', pinConfirm: '' });
        await refreshCustomerData(customer.customerId);
      } else {
        setPinChangeError(data.error || 'No se pudo actualizar el PIN.');
      }
    } catch (err) {
      setPinChangeError('Error de conexión.');
    } finally {
      setChangingPin(false);
    }
  };

  const handleLogout = () => {
    setCustomer(null);
    localStorage.removeItem('wagent_loyalty_customer');
    setPhoneInput('');
    setAuthStage('phone');
    setAuthData(null);
    setPinInput('');
    setFormError(null);
    setIsRegisterMode(false);
  };

  const handleRedeemPoints = async () => {
    if (!customer || !redeemModal.points) return;
    try {
      const res = await fetch('/api/loyalty/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.customerId,
          points: redeemModal.points,
          description: `Canje generado desde Mi Cuenta por cupón de $${redeemModal.points}`
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRedeemSuccess(`¡Canjeaste ${redeemModal.points} puntos! Se ha generado tu cupón de descuento por $${data.discountAmount}.`);
        await refreshCustomerData(customer.customerId);
        setTimeout(() => {
          setRedeemModal({ open: false, points: 50 });
          setRedeemSuccess(null);
        }, 2500);
      } else {
        alert(data.error || 'No se pudo realizar el canje');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // ==========================================
  // PANTALLAS DE ACCESO Y SEGURIDAD (/micuenta)
  // ==========================================
  if (!customer && !isRegisterMode) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          
          {/* ETAPA 1: INGRESAR TELÉFONO */}
          {authStage === 'phone' && (
            <>
              <div className="text-center space-y-2">
                <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-2 shadow-inner">
                  <Crown className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight">Club de Puntos & Beneficios</h1>
                <p className="text-sm text-slate-400">
                  Ingresá tu WhatsApp para consultar tus puntos acumulados, fecha de vencimiento y estado de pedidos.
                </p>
              </div>

              <form onSubmit={handlePhoneCheck} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Número de Celular / WhatsApp
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Phone className="w-5 h-5" />
                    </div>
                    <input
                      type="tel"
                      placeholder="Ej: 3416123456"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-white text-base focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Si es tu primera vez, te guiaremos para unirte al club.</p>
                </div>

                {formError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={checking}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-sm shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {checking ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    <>
                      Continuar
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* ETAPA 2A: VALIDAR PIN DE SEGURIDAD */}
          {authStage === 'pin' && authData && (
            <>
              <div className="text-center space-y-2">
                <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-2 shadow-inner">
                  <Lock className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight">PIN de Seguridad</h1>
                <p className="text-sm text-slate-400">
                  Hola <strong className="text-white">{authData.customerName}</strong>, ingresá tu PIN de 4 dígitos para acceder a tu cuenta ({authData.maskedPhone}).
                </p>
              </div>

              <form onSubmit={handleVerifyPin} className="space-y-4">
                <div>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      maxLength={6}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoFocus
                      placeholder="••••"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3.5 px-4 text-center text-3xl tracking-[0.5em] font-mono text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500 text-center block mt-2">
                    Tu saldo y pedidos están protegidos contra accesos no autorizados.
                  </span>
                </div>

                {formError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={checking || pinInput.length < 4}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-sm shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {checking ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Validando PIN...
                    </>
                  ) : (
                    <>
                      Ingresar a Mi Cuenta
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="flex flex-col items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={checking}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <MessageSquareCode className="w-3.5 h-3.5" />
                    ¿Olvidaste tu PIN? Enviar código por WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAuthStage('phone');
                      setFormError(null);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Ingresar con otro número
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ETAPA 2B: CONFIGURAR PIN INICIAL (CLIENTES EXISTENTES SIN PIN) */}
          {authStage === 'set-pin' && authData && (
            <>
              <div className="text-center space-y-2">
                <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-2 shadow-inner">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight">Protegé tu Cuenta</h1>
                <p className="text-sm text-slate-400">
                  ¡Hola <strong className="text-white">{authData.customerName}</strong>! Para que nadie más pueda ver tus compras o canjear tus puntos, creá tu <strong className="text-amber-400">PIN de seguridad</strong> de 4 dígitos.
                </p>
              </div>

              <form onSubmit={handleSetInitialPin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nuevo PIN (4 dígitos)
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="••••"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-center text-xl tracking-[0.4em] font-mono text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Confirmar PIN
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="••••"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-center text-xl tracking-[0.4em] font-mono text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                {formError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={checking || newPin.length < 4}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-sm shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {checking ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Guardando PIN...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Guardar PIN y Acceder
                    </>
                  )}
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthStage('phone');
                      setFormError(null);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Volver
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ETAPA 2C: VERIFICAR CÓDIGO OTP DE WHATSAPP */}
          {authStage === 'otp' && authData && (
            <>
              <div className="text-center space-y-2">
                <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-2 shadow-inner">
                  <MessageSquareCode className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight">Código por WhatsApp</h1>
                <p className="text-sm text-slate-400">
                  Enviamos un código de 6 dígitos a tu WhatsApp ({authData.maskedPhone}).
                </p>
              </div>

              {otpDevCode && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center">
                  💡 <strong>Modo de pruebas:</strong> Tu código es <strong className="text-white font-mono text-sm">{otpDevCode}</strong>
                </div>
              )}

              {authSuccessMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs text-center">
                  {authSuccessMsg}
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 text-center">
                    Ingresá el código de 6 dígitos
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                    placeholder="123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-center text-2xl tracking-[0.4em] font-mono text-white focus:border-emerald-500 focus:outline-none transition-all"
                    required
                  />
                </div>

                {/* Alternar entre ingresar directo o restablecer PIN */}
                <div className="flex border border-slate-800 rounded-xl p-1 bg-slate-950 text-xs">
                  <button
                    type="button"
                    onClick={() => setOtpMode('login')}
                    className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                      otpMode === 'login' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Ingresar Directo
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpMode('reset-pin')}
                    className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                      otpMode === 'reset-pin' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Restablecer PIN
                  </button>
                </div>

                {otpMode === 'reset-pin' && (
                  <div className="space-y-3 pt-1 border-t border-slate-800">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Nuevo PIN (4 dígitos)</label>
                      <input
                        type="password"
                        maxLength={6}
                        inputMode="numeric"
                        placeholder="••••"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-center font-mono text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Confirmar Nuevo PIN</label>
                      <input
                        type="password"
                        maxLength={6}
                        inputMode="numeric"
                        placeholder="••••"
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-center font-mono text-white"
                        required
                      />
                    </div>
                  </div>
                )}

                {formError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={checking || otpCode.length !== 6}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-extrabold text-sm shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {checking ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    <>
                      {otpMode === 'reset-pin' ? 'Guardar PIN e Ingresar' : 'Ingresar a Mi Cuenta'}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="flex flex-col items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={checking || otpCountdown > 0}
                    className="text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {otpCountdown > 0 
                      ? `Reenviar código en ${otpCountdown}s` 
                      : '¿No recibiste el código? Reenviar por WhatsApp'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAuthStage('pin');
                      setFormError(null);
                    }}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Volver a ingresar PIN
                  </button>
                </div>
              </form>
            </>
          )}

          <div className="border-t border-slate-800/80 pt-4 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              1 punto cada $10
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Acceso Seguro
            </span>
            <span className="flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-sky-400" />
              Todas las sucursales
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // PANTALLA DE REGISTRO PARA NUEVOS CLIENTES
  // ==========================================
  if (!customer && isRegisterMode) {
    const fields = formConfig?.fields || [
      { id: 'name', label: 'Nombre Completo', type: 'text', required: true, enabled: true },
      { id: 'phone', label: 'Número de WhatsApp', type: 'tel', required: true, enabled: true },
      { id: 'preferredBranch', label: 'Sucursal de Preferencia', type: 'select', required: true, enabled: true, optionsSource: 'branches' }
    ];

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-1">
              <Gift className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-black text-white">¡Te damos la bienvenida al Club!</h1>
            <p className="text-xs text-slate-400">
              Completá tus datos por única vez para sumar tus primeros <strong className="text-amber-400">100 puntos de bienvenida</strong> y acceder a descuentos automáticos.
            </p>
          </div>

          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            {fields.filter(f => f.enabled !== false).map((field) => (
              <div key={field.id}>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>{field.label} {field.required && <span className="text-amber-400">*</span>}</span>
                </label>

                {field.id === 'preferredBranch' || field.optionsSource === 'branches' ? (
                  <select
                    value={formData.preferredBranch}
                    onChange={(e) => setFormData({ ...formData, preferredBranch: e.target.value })}
                    required={field.required}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">Seleccioná tu sucursal habitual...</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.name}>{b.name} {b.address ? `(${b.address})` : ''}</option>
                    ))}
                  </select>
                ) : field.type === 'select' ? (
                  <select
                    value={formData[field.id] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                    required={field.required}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    {(field.options || []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type || 'text'}
                    value={formData[field.id] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                    required={field.required}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                  />
                )}
              </div>
            ))}

            {/* SECCIÓN OBLIGATORIA DE SEGURIDAD: CREAR PIN */}
            <div className="pt-3 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Seguridad de tu Cuenta (PIN de 4 dígitos)</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Crear PIN <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="••••"
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-center text-lg tracking-widest font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Confirmar PIN <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="••••"
                    value={formData.pinConfirm}
                    onChange={(e) => setFormData({ ...formData, pinConfirm: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-center text-lg tracking-widest font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Este PIN protegerá tus compras y tus puntos cada vez que consultes desde tu celular.
              </p>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {formError}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(false);
                  setAuthStage('phone');
                  setFormError(null);
                }}
                className="w-1/3 py-3 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={savingForm}
                className="w-2/3 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
              >
                {savingForm ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Unirme al Club
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // DASHBOARD DEL CLIENTE LOGUEADO (/micuenta)
  // ==========================================
  const currentTier = customer.tier || { name: 'Bronce', discountPercentage: 0, badgeColor: '#CD7F32' };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Mi Cuenta
              <span 
                className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
                style={{ backgroundColor: `${currentTier.badgeColor}25`, color: currentTier.badgeColor }}
              >
                Nivel {currentTier.name}
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              {customer.customerName} &middot; {customer.customerPhone}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refreshCustomerData(customer.customerId)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Actualizar datos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl w-full mx-auto p-6 space-y-6 flex-1">
        {/* Banner Puntos & Vencimiento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card Balance */}
          <div className="md:col-span-2 p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                Tus Puntos Disponibles
              </span>
              <button
                onClick={() => setRedeemModal({ open: true, points: Math.min(customer.currentPoints, 100) })}
                disabled={customer.currentPoints < 50}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                Canjear Puntos
              </button>
            </div>

            <div className="my-4">
              <div className="text-4xl md:text-5xl font-black text-white tracking-tight">
                {customer.currentPoints.toLocaleString('es-AR')}{' '}
                <span className="text-sm font-semibold text-slate-400">pts</span>
              </div>
              <p className="text-xs text-emerald-400 mt-1 font-semibold">
                Equivalente a ${customer.monetaryValue.toLocaleString('es-AR')} en descuentos para tus compras
              </p>
            </div>

            {/* Progreso al próximo nivel */}
            {customer.nextTier ? (
              <div className="space-y-1.5 border-t border-slate-800/80 pt-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">
                    Nivel siguiente: <strong className="text-white">{customer.nextTier.name}</strong>
                  </span>
                  <span className="text-amber-400 font-semibold">
                    Te faltan ${customer.spendToNextTier.toLocaleString('es-AR')}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-500"
                    style={{ width: `${customer.progressToNext}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-800/80 pt-3 text-xs text-amber-400 font-semibold flex items-center gap-1.5">
                <Award className="w-4 h-4" />
                ¡Felicitaciones! Estás en la máxima categoría del Club.
              </div>
            )}
          </div>

          {/* Card Vencimiento & Sucursal */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col justify-between space-y-4">
            <div>
              <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Vencimiento de Puntos
              </span>
              {customer.nextExpiryDate ? (
                <p className="text-xs text-slate-300 leading-relaxed">
                  Tenés <strong className="text-amber-400 font-bold">{customer.nextExpiringPoints} puntos</strong> con vencimiento el:{' '}
                  <span className="text-white font-bold block text-sm mt-1">
                    {new Date(customer.nextExpiryDate).toLocaleDateString('es-AR', { dateStyle: 'full' })}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-slate-500">Tus puntos no tienen vencimiento próximo registrado.</p>
              )}
            </div>

            {customer.preferredBranch && (
              <div className="border-t border-slate-800 pt-3 flex items-center gap-2 text-xs text-slate-400">
                <Store className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Sucursal: <strong className="text-white">{customer.preferredBranch}</strong></span>
              </div>
            )}

            <div className="border-t border-slate-800 pt-2 flex items-center gap-1.5 text-[11px] text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Cuenta protegida con PIN de seguridad</span>
            </div>
          </div>
        </div>

        {/* Tabs de Contenido */}
        <div className="flex border-b border-slate-800 gap-6 text-sm font-semibold overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('summary')}
            className={`pb-3 transition-colors border-b-2 shrink-0 ${
              activeTab === 'summary' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Beneficios de tu Nivel
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`pb-3 transition-colors border-b-2 flex items-center gap-1.5 shrink-0 ${
              activeTab === 'orders' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Mis Pedidos ({customer.orders ? customer.orders.length : 0})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 transition-colors border-b-2 flex items-center gap-1.5 shrink-0 ${
              activeTab === 'history' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            Historial de Puntos
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 transition-colors border-b-2 flex items-center gap-1.5 shrink-0 ${
              activeTab === 'profile' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <User className="w-4 h-4" />
            Mi Perfil & Seguridad
          </button>
        </div>

        {/* TAB 1: BENEFICIOS */}
        {activeTab === 'summary' && (
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              Tus Beneficios como Cliente {currentTier.name}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(currentTier.benefits || ['Puntos en todas tus compras']).map((b, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span className="text-xs text-slate-200">{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: PEDIDOS */}
        {activeTab === 'orders' && (
          <div className="space-y-3">
            {(!customer.orders || customer.orders.length === 0) ? (
              <div className="p-8 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 text-xs">
                Aún no tenés pedidos registrados con este número.
              </div>
            ) : (
              customer.orders.map((ord) => (
                <div key={ord.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-white text-sm">Pedido #{String(ord.id).slice(-6)}</strong>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-bold uppercase bg-slate-800 text-slate-300">
                        {ord.status || 'Completado'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 block mt-1">
                      {new Date(ord.createdAt).toLocaleDateString('es-AR', { dateStyle: 'full' })}
                    </span>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-extrabold text-white">
                      ${Number(ord.totalAmount || ord.total || 0).toLocaleString('es-AR')}
                    </div>
                    <span className="text-[11px] text-amber-400 font-semibold block">
                      +{Math.round((Number(ord.totalAmount) || 0) * 0.1)} pts sumados
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: HISTORIAL DE PUNTOS */}
        {activeTab === 'history' && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Detalle</th>
                    <th className="py-3 px-4 text-right">Puntos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(customer.recentMovements || []).length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center py-6 text-slate-500">Sin movimientos aún.</td>
                    </tr>
                  ) : (
                    customer.recentMovements.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-800/20">
                        <td className="py-3 px-4 text-slate-400">
                          {new Date(m.createdAt).toLocaleDateString('es-AR')}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            m.type === 'EARN' ? 'bg-amber-500/20 text-amber-400' :
                            m.type === 'REDEEM' ? 'bg-emerald-500/20 text-emerald-400' :
                            m.type === 'EXPIRE' ? 'bg-rose-500/20 text-rose-400' :
                            'bg-indigo-500/20 text-indigo-400'
                          }`}>
                            {m.type === 'EARN' ? 'COMPRA' : m.type === 'REDEEM' ? 'CANJE' : m.type === 'EXPIRE' ? 'VENCIDO' : 'BONO'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{m.description}</td>
                        <td className={`py-3 px-4 text-right font-bold ${
                          m.type === 'REDEEM' || m.type === 'EXPIRE' ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                          {m.type === 'REDEEM' || m.type === 'EXPIRE' ? `-${m.points}` : `+${m.points}`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: MI PERFIL & SEGURIDAD */}
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Datos Personales */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-amber-400" />
                Información de tu Cuenta
              </h3>
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                  <span className="text-slate-400 block mb-0.5 font-medium">Nombre Completo</span>
                  <strong className="text-white text-sm">{customer.customerName}</strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                  <span className="text-slate-400 block mb-0.5 font-medium">Número de WhatsApp</span>
                  <strong className="text-white text-sm font-mono">{customer.customerPhone}</strong>
                </div>
                {customer.email && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                    <span className="text-slate-400 block mb-0.5 font-medium">Correo Electrónico</span>
                    <strong className="text-white text-sm">{customer.email}</strong>
                  </div>
                )}
                {customer.preferredBranch && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                    <span className="text-slate-400 block mb-0.5 font-medium">Sucursal Habitual</span>
                    <strong className="text-white text-sm">{customer.preferredBranch}</strong>
                  </div>
                )}
                {customer.address && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                    <span className="text-slate-400 block mb-0.5 font-medium">Dirección de Entrega</span>
                    <strong className="text-white text-sm">{customer.address}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Seguridad y Cambio de PIN */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  Seguridad de Acceso
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  PIN ACTIVO
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tu PIN de 4 a 6 dígitos es requerido para ingresar a tu cuenta y resguardar tu información personal.
              </p>

              <form onSubmit={handleChangePinInProfile} className="space-y-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">PIN Actual</label>
                  <input
                    type="password"
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="••••"
                    value={changePinForm.currentPin}
                    onChange={(e) => setChangePinForm({ ...changePinForm, currentPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm font-mono focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nuevo PIN</label>
                    <input
                      type="password"
                      maxLength={6}
                      inputMode="numeric"
                      placeholder="••••"
                      value={changePinForm.pin}
                      onChange={(e) => setChangePinForm({ ...changePinForm, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm font-mono focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Confirmar</label>
                    <input
                      type="password"
                      maxLength={6}
                      inputMode="numeric"
                      placeholder="••••"
                      value={changePinForm.pinConfirm}
                      onChange={(e) => setChangePinForm({ ...changePinForm, pinConfirm: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm font-mono focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                {pinChangeError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{pinChangeError}</span>
                  </div>
                )}

                {pinChangeMsg && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{pinChangeMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={changingPin || !changePinForm.pin}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {changingPin ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4 text-amber-400" />}
                  Actualizar PIN de Seguridad
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Modal Canje */}
      {redeemModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-400" />
              Canjear Puntos por Descuento
            </h3>
            <p className="text-xs text-slate-400">
              Tenés <strong className="text-white">{customer.currentPoints} puntos</strong> disponibles.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Puntos a Canjear</label>
              <input
                type="number"
                min="50"
                max={customer.currentPoints}
                value={redeemModal.points}
                onChange={(e) => setRedeemModal({ ...redeemModal, points: parseInt(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm"
              />
              <span className="text-[11px] text-emerald-400 block mt-1">
                = Descuento de ${redeemModal.points} en tu próxima compra
              </span>
            </div>

            {redeemSuccess && (
              <p className="text-xs text-emerald-400 font-semibold">{redeemSuccess}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRedeemModal({ open: false, points: 50 })}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleRedeemPoints}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20"
              >
                Confirmar Canje
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
