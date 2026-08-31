import React, { useState, useEffect, useRef } from 'react';
import { Search, UserCheck, X, ChevronDown } from 'lucide-react';

const ROLE_CONFIG = {
  admin:      { label: '👑 Admin',      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  gerencia:   { label: '📊 Gerencia',   color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  encargado:  { label: '🏪 Encargado',  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  cajero:     { label: '💳 Cajero',     color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  repartidor: { label: '🛵 Repartidor', color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  cliente:    { label: '🛒 Cliente',    color: 'text-lime-400 bg-lime-500/10 border-lime-500/20' },
};

export default function UserPicker({
  role,
  value,
  onChange,
  placeholder = 'Seleccionar usuario...',
  clearable = true,
  disabled = false,
}) {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const url = role ? `/api/users?role=${encodeURIComponent(role)}` : '/api/users';
    fetch(url).then(r => r.json()).then(data => setUsers(Array.isArray(data) ? data : [])).catch(console.error);
  }, [role]);

  useEffect(() => {
    if (!value) { setSelected(null); return; }
    const found = users.find(u => u.id === value);
    if (found) setSelected(found);
    else if (users.length === 0) {
      fetch(`/api/users/${value}`).then(r => r.ok ? r.json() : null).then(u => u && setSelected(u)).catch(() => {});
    }
  }, [value, users]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = users.filter(u => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (u.name||'').toLowerCase().includes(q) || (u.username||'').toLowerCase().includes(q) ||
      (u.phone||'').replace(/\D/g,'').includes(q.replace(/\D/g,'')) || (u.email||'').toLowerCase().includes(q);
  });

  const handleSelect = (user) => { setSelected(user); setOpen(false); setQuery(''); onChange(user.id, user); };
  const handleClear = (e) => { e.stopPropagation(); setSelected(null); setQuery(''); onChange(null, null); };
  const roleConf = (roleId) => ROLE_CONFIG[roleId] || { label: roleId, color: 'text-slate-400 bg-slate-700/20 border-slate-700' };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(prev => !prev)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs transition-all text-left
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-purple-500/60'}
          ${open ? 'border-purple-500/80 bg-[#1a2633]' : 'border-slate-700 bg-[#182229]'}`}
      >
        {selected ? (
          <>
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500/30 to-blue-500/20 border border-purple-500/30 flex items-center justify-center text-[10px] font-black text-white shrink-0">
              {selected.avatar || (selected.name||'U').slice(0,2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white truncate">{selected.name}</div>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${roleConf(selected.role).color}`}>
                {roleConf(selected.role).label}
              </span>
            </div>
            {clearable && !disabled && (
              <button type="button" onClick={handleClear} className="p-0.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition">
                <X size={13} />
              </button>
            )}
          </>
        ) : (
          <>
            <UserCheck size={14} className="text-slate-400 shrink-0" />
            <span className="flex-1 text-slate-400">{placeholder}</span>
            <ChevronDown size={13} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-[#111b21] border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-slate-800">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nombre, teléfono..."
                className="w-full pl-7 pr-3 py-1.5 bg-[#182229] border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500" />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                No se encontraron usuarios
                {role && <span className="block text-[10px] mt-1">Rol requerido: {roleConf(role).label}</span>}
              </div>
            ) : filtered.map(user => (
              <button key={user.id} type="button" onClick={() => handleSelect(user)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition hover:bg-slate-800 text-left ${selected?.id === user.id ? 'bg-purple-500/10' : ''}`}>
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/10 border border-slate-700 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                  {user.avatar || (user.name||'U').slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{user.name}</div>
                  <div className="text-slate-400 truncate">{user.phone || user.email || user.username}</div>
                </div>
                <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${roleConf(user.role).color}`}>
                  {roleConf(user.role).label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
