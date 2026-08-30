import React from 'react';
import { QrCode, Smartphone, CheckCircle2, AlertCircle, RefreshCw, LogOut, X } from 'lucide-react';

export default function QRModal({ isOpen, onClose, status, qrDataUrl, user, onConnect, onDisconnect }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#111b21] border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden">
        
        {/* Glow decoration */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <QrCode size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Vincular WhatsApp</h2>
              <p className="text-xs text-slate-400">Conexión directa Multi-Device mediante QR</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-6 flex flex-col items-center">
          {status === 'connected' ? (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 ring-8 ring-emerald-500/10 animate-bounce">
                <CheckCircle2 size={44} />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">¡WhatsApp Conectado!</h3>
              <p className="text-sm text-slate-400 max-w-xs mb-4">
                Tu cuenta está activa y el Agente de IA está listo para responder mensajes, audios y llamadas.
              </p>

              {user && (
                <div className="w-full bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 mb-6 text-left">
                  <div className="text-xs text-slate-400 mb-1">Cuenta Vinculada:</div>
                  <div className="text-sm font-semibold text-emerald-400">{user.name || user.id?.split(':')[0] || 'WhatsApp Business'}</div>
                  <div className="text-xs text-slate-400">{user.id?.split('@')[0]}</div>
                </div>
              )}

              <button
                onClick={onDisconnect}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-sm font-medium transition-colors"
              >
                <LogOut size={16} />
                Desconectar Cuenta
              </button>
            </div>
          ) : status === 'connecting' ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
              <h3 className="text-lg font-bold text-white mb-1">Iniciando Servidor WhatsApp</h3>
              <p className="text-xs text-slate-400">Generando socket y código QR seguro...</p>
            </div>
          ) : qrDataUrl ? (
            <div className="flex flex-col items-center w-full">
              {/* QR Container */}
              <div className="relative p-4 bg-white rounded-2xl shadow-xl border-4 border-emerald-500/30 mb-5 group">
                <img
                  src={qrDataUrl}
                  alt="WhatsApp QR Code"
                  className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-lg"
                />
              </div>

              {/* Instructions */}
              <div className="w-full bg-[#182229] border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 space-y-2.5">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5 mb-1">
                  <Smartphone size={14} /> Pasos para escanear en tu celular:
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] flex-shrink-0">1</span>
                  <span>Abre <strong>WhatsApp</strong> en tu teléfono.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] flex-shrink-0">2</span>
                  <span>Toca el <strong>Menú (⋮)</strong> en Android o <strong>Configuración</strong> en iPhone.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] flex-shrink-0">3</span>
                  <span>Selecciona <strong>Dispositivos vinculados</strong> y toca <strong>Vincular un dispositivo</strong>.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] flex-shrink-0">4</span>
                  <span>Apunta la cámara a este código QR para sincronizar.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">WhatsApp no conectado</h3>
              <p className="text-xs text-slate-400 max-w-xs mb-6">
                Presiona el botón para iniciar el motor de Baileys y generar un nuevo código QR.
              </p>
              <button
                onClick={onConnect}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/25 transition-transform active:scale-95"
              >
                <RefreshCw size={18} />
                Generar Código QR
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="capitalize">{status === 'connected' ? 'En línea' : status === 'qr_ready' ? 'Esperando escaneo' : status}</span>
          </div>
          {status === 'qr_ready' && (
            <button
              onClick={onConnect}
              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
            >
              <RefreshCw size={12} /> Refrescar QR
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
