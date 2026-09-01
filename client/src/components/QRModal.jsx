import React, { useState, useEffect } from 'react';
import { QrCode, Smartphone, CheckCircle2, AlertCircle, RefreshCw, LogOut, X, Users, UserCheck, ShieldAlert, Sparkles } from 'lucide-react';

const ALLOWED_QR_ROLES = ['admin', 'gerencia', 'encargado', 'cajero'];

export default function QRModal({ 
  isOpen, 
  onClose, 
  status, 
  qrDataUrl, 
  user, 
  onConnect, 
  onDisconnect,
  currentUser,
  allUsers = [],
  socket
}) {
  if (!isOpen) return null;

  // Filtrar solo usuarios autorizados para vincular WhatsApp (Agentes de Venta, Encargados, Gerencia, Admin)
  const authorizedUsers = allUsers.filter(u => ALLOWED_QR_ROLES.includes(u.role));
  const isCurrentUserRestricted = currentUser && !ALLOWED_QR_ROLES.includes(currentUser.role);

  const [selectedUserId, setSelectedUserId] = useState('default');
  const [operatorSessions, setOperatorSessions] = useState({});
  const [activeSessionStatus, setActiveSessionStatus] = useState({
    status: status || 'disconnected',
    qrDataUrl: qrDataUrl || null,
    user: user || null
  });
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Fetch status of the selected operator session
  const fetchSessionStatus = async (userId) => {
    setIsLoadingSession(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/whatsapp/status?userId=${userId}`);
      const data = await res.json();
      setActiveSessionStatus(data);
    } catch (err) {
      console.error('Error obteniendo estado de sesión WhatsApp:', err);
    } finally {
      setIsLoadingSession(false);
    }
  };

  // Fetch all sessions
  const fetchAllSessions = async () => {
    try {
      const res = await fetch('/api/whatsapp/sessions');
      const data = await res.json();
      setOperatorSessions(data || {});
    } catch (err) {}
  };

  useEffect(() => {
    if (isOpen) {
      fetchSessionStatus(selectedUserId);
      fetchAllSessions();
    }
  }, [isOpen, selectedUserId]);

  // Socket listener for dynamic QR and status updates per operator
  useEffect(() => {
    if (!socket) return;

    const handleStatusUpdate = (data) => {
      if (!data) return;
      const targetSession = data.sessionId || data.userId || 'default';
      setOperatorSessions(prev => ({ ...prev, [targetSession]: data }));
      if (targetSession === selectedUserId) {
        setActiveSessionStatus(data);
        setIsLoadingSession(false);
      }
    };

    const handleQrUpdate = (data) => {
      if (!data) return;
      const targetSession = data.sessionId || data.userId || 'default';
      if (targetSession === selectedUserId) {
        setActiveSessionStatus(prev => ({
          ...prev,
          status: 'qr_ready',
          qrDataUrl: data.qrDataUrl,
          qrCode: data.qrCode
        }));
        setIsLoadingSession(false);
      }
    };

    socket.on('whatsapp:status', handleStatusUpdate);
    socket.on('whatsapp:qr', handleQrUpdate);
    socket.on('whatsapp:sessions:update', handleStatusUpdate);
    socket.on(`whatsapp:status:${selectedUserId}`, handleStatusUpdate);
    socket.on(`whatsapp:qr:${selectedUserId}`, handleQrUpdate);

    return () => {
      socket.off('whatsapp:status', handleStatusUpdate);
      socket.off('whatsapp:qr', handleQrUpdate);
      socket.off('whatsapp:sessions:update', handleStatusUpdate);
      socket.off(`whatsapp:status:${selectedUserId}`, handleStatusUpdate);
      socket.off(`whatsapp:qr:${selectedUserId}`, handleQrUpdate);
    };
  }, [socket, selectedUserId]);

  const handleConnectSelected = async (resetAuth = false) => {
    setIsLoadingSession(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'default'
        },
        body: JSON.stringify({ 
          userId: selectedUserId,
          resetAuth,
          requestingUserId: currentUser?.id
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'No se pudo conectar la línea');
      } else if (data.status) {
        setActiveSessionStatus(data.status);
      }
    } catch (err) {
      console.error('Error conectando WhatsApp para operador:', err);
      setErrorMessage('Error de red al conectar WhatsApp');
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleResetSelected = async () => {
    setIsLoadingSession(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/whatsapp/reset', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'default'
        },
        body: JSON.stringify({ 
          userId: selectedUserId,
          requestingUserId: currentUser?.id
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'No se pudo resetear la línea');
      } else if (data.status) {
        setActiveSessionStatus(data.status);
      }
      fetchAllSessions();
    } catch (err) {
      console.error('Error reseteando WhatsApp:', err);
      setErrorMessage('Error de red al resetear sesión');
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleDisconnectSelected = async () => {
    setIsLoadingSession(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'default'
        },
        body: JSON.stringify({ 
          userId: selectedUserId,
          clearAuth: true,
          requestingUserId: currentUser?.id
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'No se pudo desconectar la línea');
      } else if (data.status) {
        setActiveSessionStatus(data.status);
      }
      fetchAllSessions();
    } catch (err) {
      console.error('Error desconectando WhatsApp:', err);
      setErrorMessage('Error al desconectar WhatsApp');
    } finally {
      setIsLoadingSession(false);
    }
  };

  const selectedUserObj = authorizedUsers.find(u => u.id === selectedUserId);
  const currentStatus = activeSessionStatus.status || 'disconnected';
  const currentQr = activeSessionStatus.qrDataUrl;
  const currentUserInfo = activeSessionStatus.user;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#111b21] border border-slate-700/80 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Glow decoration */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <QrCode size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Vincular WhatsApp Multi-Operador</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                  Solo Operadores
                </span>
              </h2>
              <p className="text-xs text-slate-400">Vinculación de líneas para Agentes de Venta, Encargados y Administradores</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error message alert */}
        {errorMessage && (
          <div className="mt-3 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Restricted Access Banner if current user is cliente or repartidor */}
        {isCurrentUserRestricted ? (
          <div className="py-8 flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <ShieldAlert size={32} />
            </div>
            <h3 className="text-base font-bold text-white">Acceso Restringido</h3>
            <p className="text-xs text-slate-400 max-w-md leading-relaxed">
              Los usuarios con rol <strong className="text-amber-400 font-bold">{currentUser?.role?.toUpperCase()}</strong> no tienen autorización para vincular líneas de WhatsApp. Esta función está reservada exclusivamente para <strong>Agentes de Venta, Encargados, Gerencia y Administradores</strong>.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            {/* User / Operator Selector Tabs */}
            <div className="py-2.5 border-b border-slate-800 shrink-0">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Users size={12} className="text-emerald-400" />
                <span>Seleccionar Operador / Línea a Vincular:</span>
              </label>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                <button
                  onClick={() => setSelectedUserId('default')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 border ${
                    selectedUserId === 'default'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                      : 'bg-[#182229] text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  <span>🥩 Línea Central (Ventas)</span>
                  <span className={`w-2 h-2 rounded-full ${operatorSessions['default']?.status === 'connected' ? 'bg-emerald-300' : 'bg-slate-500'}`} />
                </button>

                {authorizedUsers.map(u => {
                  const isSelected = selectedUserId === u.id;
                  const sess = operatorSessions[u.id];
                  const isConn = sess?.status === 'connected';
                  return (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUserId(u.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                          : 'bg-[#182229] text-slate-300 border-slate-700 hover:text-white'
                      }`}
                    >
                      <span>{u.avatar || '👤'} {u.name} ({u.role})</span>
                      <span className={`w-2 h-2 rounded-full ${isConn ? 'bg-emerald-300' : 'bg-slate-500'}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Operator Profile Banner */}
            <div className="mt-2.5 p-3 rounded-2xl bg-[#182229] border border-slate-800 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  {selectedUserId === 'default' ? '🏢' : (selectedUserObj?.avatar || '👤')}
                </div>
                <div>
                  <div className="font-bold text-white">
                    {selectedUserId === 'default' ? 'Línea Central de Ventas' : `Línea de ${selectedUserObj?.name || 'Operario'}`}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {selectedUserId === 'default' ? 'WhatsApp principal de la empresa' : `Rol: ${selectedUserObj?.role || 'operador'} • ${selectedUserObj?.email || ''}`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                  currentStatus === 'connected'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : currentStatus === 'qr_ready'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {currentStatus === 'connected' ? '● CONECTADO' : currentStatus === 'qr_ready' ? 'ESPERANDO QR' : 'DESCONECTADO'}
                </span>
              </div>
            </div>

            {/* Content Body */}
            <div className="py-4 flex-1 overflow-y-auto flex flex-col items-center justify-center">
              {isLoadingSession ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                  <RefreshCw size={28} className="animate-spin text-emerald-500 mx-auto" />
                  <div>Generando socket y preparando código QR limpio...</div>
                </div>
              ) : currentStatus === 'connected' ? (
                <div className="flex flex-col items-center text-center py-2">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3 ring-8 ring-emerald-500/10">
                    <CheckCircle2 size={36} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">¡Línea WhatsApp Conectada!</h3>
                  <p className="text-xs text-slate-400 max-w-xs mb-3">
                    Esta línea está lista para enviar y recibir mensajes directamente desde el CRM con el Agente IA.
                  </p>

                  {currentUserInfo && (
                    <div className="w-full bg-[#182229] border border-slate-700/60 rounded-2xl p-3 mb-4 text-left max-w-sm">
                      <div className="text-[11px] text-slate-400 mb-0.5">Número y Cuenta Vinculada:</div>
                      <div className="text-xs font-bold text-emerald-400">{currentUserInfo.name || currentUserInfo.id?.split(':')[0] || 'WhatsApp Business'}</div>
                      <div className="text-[11px] text-slate-300 font-mono">+{currentUserInfo.id?.split('@')[0]?.split(':')[0]}</div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDisconnectSelected}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition"
                    >
                      <LogOut size={14} />
                      Desconectar Línea
                    </button>
                    <button
                      onClick={handleResetSelected}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                      title="Reiniciar sesión y forzar nuevo código QR"
                    >
                      <RefreshCw size={14} />
                      Re-vincular
                    </button>
                  </div>
                </div>
              ) : currentQr ? (
                <div className="flex flex-col items-center w-full max-w-md">
                  {/* QR Container */}
                  <div className="relative p-3 bg-white rounded-2xl shadow-xl border-4 border-emerald-500/40 mb-3 group">
                    <img
                      src={currentQr}
                      alt="WhatsApp QR Code"
                      className="w-48 h-48 object-contain rounded-lg"
                    />
                  </div>

                  {/* Actions for QR */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={handleResetSelected}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#182229] hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition"
                    >
                      <RefreshCw size={13} />
                      <span>Forzar Nuevo QR Limpio</span>
                    </button>
                  </div>

                  {/* Instructions */}
                  <div className="w-full bg-[#182229] border border-slate-800 rounded-2xl p-3 text-xs text-slate-300 space-y-1.5">
                    <div className="font-semibold text-emerald-400 flex items-center gap-1.5 mb-0.5">
                      <Smartphone size={13} /> Pasos para escanear en tu celular:
                    </div>
                    <div className="flex items-start gap-2 text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[9px] flex-shrink-0">1</span>
                      <span>Abre <strong>WhatsApp</strong> en el teléfono del operador.</span>
                    </div>
                    <div className="flex items-start gap-2 text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[9px] flex-shrink-0">2</span>
                      <span>Toca <strong>Dispositivos vinculados</strong> ➔ <strong>Vincular un dispositivo</strong>.</span>
                    </div>
                    <div className="flex items-start gap-2 text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[9px] flex-shrink-0">3</span>
                      <span>Apunta la cámara a este código QR para sincronizar.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-4 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                    <AlertCircle size={28} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">Línea no conectada</h3>
                  <p className="text-xs text-slate-400 max-w-xs mb-4">
                    Genera un código QR para vincular el número de WhatsApp de este operario al CRM.
                  </p>
                  <button
                    onClick={() => handleResetSelected()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/25 transition active:scale-95"
                  >
                    <RefreshCw size={15} />
                    Generar Código QR para {selectedUserId === 'default' ? 'Línea Central' : (selectedUserObj?.name || 'Operario')}
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${currentStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="capitalize">{currentStatus === 'connected' ? 'Línea activa' : currentStatus === 'qr_ready' ? 'Esperando escaneo' : 'Desconectado'}</span>
              </div>
              <button
                onClick={handleResetSelected}
                className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium text-xs"
              >
                <RefreshCw size={12} /> Forzar Generación de QR
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
