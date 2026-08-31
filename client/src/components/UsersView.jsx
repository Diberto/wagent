import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Copy, 
  Check, 
  X, 
  UserCheck, 
  Key, 
  Store, 
  Bike, 
  Lock, 
  Unlock, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  LogIn, 
  Sliders, 
  Shield, 
  Eye, 
  EyeOff 
} from 'lucide-react';

export default function UsersView({ socket, currentUser, onSwitchUser }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  const [selectedUserIds, setSelectedUserIds] = useState([]);

  // Modal State
  const [userModal, setUserModal] = useState(null); // null | { mode: 'create'|'edit', data: { ... } }
  const [showPin, setShowPin] = useState(false);

  const availableTabsList = [
    { id: 'inbox', label: 'Mensajes & Audios WhatsApp' },
    { id: 'pos', label: 'POS Mostrador (Punto de Venta)' },
    { id: 'orders', label: 'Gestión de Pedidos' },
    { id: 'drivers', label: 'Repartidores & Delivery' },
    { id: 'customers', label: 'Dossier de Clientes' },
    { id: 'branches', label: 'Sucursales de Carne' },
    { id: 'catalog', label: 'Catálogo de Cortes & Precios' },
    { id: 'kanban', label: 'Embudo de Ventas (Kanban)' },
    { id: 'callcenter', label: 'Llamadas Telefónicas IA' },
    { id: 'knowledge', label: 'Base de Conocimiento (RAG)' },
    { id: 'analytics', label: 'Métricas & Estadísticas' },
    { id: 'users', label: 'Área de Usuarios & Permisos' },
    { id: 'settings', label: 'Configuración del Sistema' }
  ];

  const actionPermissionsList = [
    { id: 'canEditSettings', label: 'Modificar Ajustes de IA y Sistema' },
    { id: 'canManageUsers', label: 'Crear, Editar y Eliminar Usuarios' },
    { id: 'canDeleteOrders', label: 'Eliminar o Cancelar Pedidos' },
    { id: 'canManageBranches', label: 'Administrar Sucursales' },
    { id: 'canManageDrivers', label: 'Administrar Flota de Repartidores' },
    { id: 'canManageProducts', label: 'Modificar Precios y Cortes en Catálogo' },
    { id: 'canViewFinancials', label: 'Ver Balances de Dinero y Métricas Financieras' },
    { id: 'canToggleAi', label: 'Activar / Pausar el Agente IA Global' }
  ];

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [uRes, rRes, bRes, dRes] = await Promise.all([
        fetch('/api/users').then(r => r.json()),
        fetch('/api/roles').then(r => r.json()),
        fetch('/api/branches').then(r => r.json()),
        fetch('/api/drivers').then(r => r.json())
      ]);

      setUsers(Array.isArray(uRes) ? uRes : []);
      setRoles(Array.isArray(rRes) ? rRes : []);
      setBranches(Array.isArray(bRes) ? bRes : []);
      setDrivers(Array.isArray(dRes) ? dRes : []);
    } catch (err) {
      console.error('Error cargando usuarios:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    if (socket) {
      socket.on('user:new', (newUser) => {
        setUsers(prev => [newUser, ...prev.filter(u => u.id !== newUser.id)]);
      });

      socket.on('user:update', (updated) => {
        setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      });

      socket.on('user:delete', (deletedId) => {
        setUsers(prev => prev.filter(u => u.id !== deletedId));
      });

      return () => {
        socket.off('user:new');
        socket.off('user:update');
        socket.off('user:delete');
      };
    }
  }, [socket]);

  const handleToggleSelectAllUsers = () => {
    if (selectedUserIds.length === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(filteredUsers.map(u => u.id));
    }
  };

  const handleToggleSelectUser = (e, id) => {
    e.stopPropagation();
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkUpdateUsers = async (updates) => {
    try {
      const res = await fetch('/api/users/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedUserIds, updates })
      });
      if (res.ok) {
        await fetchData();
        setSelectedUserIds([]);
      }
    } catch (e) {
      console.error('Error actualizando usuarios en lote:', e);
    }
  };

  const handleBulkDeleteUsers = async () => {
    if (!window.confirm(`¿Estás seguro de eliminar los ${selectedUserIds.length} usuarios seleccionados?`)) return;
    try {
      const res = await fetch('/api/users/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedUserIds })
      });
      if (res.ok) {
        await fetchData();
        setSelectedUserIds([]);
      }
    } catch (e) {
      console.error('Error eliminando usuarios en lote:', e);
    }
  };

  const handleOpenCreateUser = () => {
    const defaultRole = roles.find(r => r.id === 'cajero') || roles[0] || {
      id: 'cajero',
      tabs: ['pos', 'orders', 'customers', 'catalog'],
      permissions: {}
    };

    setUserModal({
      mode: 'create',
      data: {
        name: '',
        username: '',
        email: '',
        fiscalCondition: 'CF',
        cuit: '',
        role: defaultRole.id,
        branchId: '',
        driverId: '',
        pin: '1234',
        status: 'active',
        tabs: [...(defaultRole.tabs || [])],
        permissions: { ...(defaultRole.permissions || {}) }
      }
    });
    setShowPin(false);
  };

  const handleOpenEditUser = (user) => {
    setUserModal({
      mode: 'edit',
      data: {
        id: user.id,
        name: user.name || '',
        username: user.username || '',
        email: user.email || '',
        fiscalCondition: user.fiscalCondition || 'CF',
        cuit: user.cuit || '',
        role: user.role || 'cajero',
        branchId: user.branchId || '',
        driverId: user.driverId || '',
        pin: user.pin || '1234',
        status: user.status || 'active',
        tabs: [...(user.tabs || [])],
        permissions: { ...(user.permissions || {}) }
      }
    });
    setShowPin(false);
  };

  const handleRoleChangeInModal = (newRoleId) => {
    const roleDef = roles.find(r => r.id === newRoleId);
    if (roleDef) {
      setUserModal(prev => ({
        ...prev,
        data: {
          ...prev.data,
          role: newRoleId,
          tabs: [...(roleDef.tabs || [])],
          permissions: { ...(roleDef.permissions || {}) }
        }
      }));
    } else {
      setUserModal(prev => ({
        ...prev,
        data: { ...prev.data, role: newRoleId }
      }));
    }
  };

  const handleToggleTabPermission = (tabId) => {
    if (!userModal) return;
    const currentTabs = userModal.data.tabs || [];
    const updatedTabs = currentTabs.includes(tabId)
      ? currentTabs.filter(t => t !== tabId)
      : [...currentTabs, tabId];

    setUserModal({
      ...userModal,
      data: { ...userModal.data, tabs: updatedTabs }
    });
  };

  const handleToggleActionPermission = (actionKey) => {
    if (!userModal) return;
    const currentPerms = userModal.data.permissions || {};
    setUserModal({
      ...userModal,
      data: {
        ...userModal.data,
        permissions: {
          ...currentPerms,
          [actionKey]: !currentPerms[actionKey]
        }
      }
    });
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userModal) return;

    try {
      const isCreate = userModal.mode === 'create';
      const url = isCreate ? '/api/users' : `/api/users/${userModal.data.id}`;
      const method = isCreate ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userModal.data)
      });

      const saved = await res.json();
      if (res.ok) {
        if (isCreate) {
          setUsers(prev => [saved, ...prev]);
        } else {
          setUsers(prev => prev.map(u => u.id === saved.id ? saved : u));
          // If current logged-in user was updated, update in app
          if (currentUser && currentUser.id === saved.id && onSwitchUser) {
            onSwitchUser(saved);
          }
        }
        setUserModal(null);
      } else {
        alert(saved.error || 'Error al guardar usuario');
      }
    } catch (err) {
      console.error('Error guardando usuario:', err);
    }
  };

  const handleDuplicateUser = async (userId) => {
    try {
      const res = await fetch(`/api/users/${userId}/duplicate`, { method: 'POST' });
      const cloned = await res.json();
      if (res.ok) {
        setUsers(prev => [cloned, ...prev]);
      }
    } catch (err) {
      console.error('Error duplicando usuario:', err);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('¿Estás seguro de eliminar este usuario del sistema?')) return;
    try {
      await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      console.error('Error eliminando usuario:', err);
    }
  };

  const getRoleBadge = (roleId) => {
    switch (roleId) {
      case 'agente_ia_principal':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-gradient-to-r from-emerald-500/20 to-purple-500/20 text-emerald-300 border border-emerald-400/40 shadow-sm">🤖 Agente IA Principal (Central)</span>;
      case 'admin':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-purple-500/15 text-purple-400 border border-purple-500/30">👑 Administrador Total</span>;
      case 'gerencia':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-500/15 text-blue-400 border border-blue-500/30">📊 Gerencia</span>;
      case 'encargado':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">🏪 Encargado Sucursal</span>;
      case 'cajero':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30">💳 Cajero / POS</span>;
      case 'repartidor':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-sky-500/15 text-sky-400 border border-sky-500/30">🛵 Repartidor</span>;
      case 'cliente':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-lime-500/15 text-lime-400 border border-lime-500/30">🛒 Cliente</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-slate-700/30 text-slate-300 border border-slate-700">{roleId}</span>;
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-hidden p-4 sm:p-6 space-y-5">
      
      {/* Header & Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Users size={18} />
            </div>
            Gestión de Usuarios, Perfiles & Permisos (RBAC)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configura roles personalizables para Admin, Gerencia, Encargados, Cajeros y Repartidores con permisos por área
          </p>
        </div>

        <button
          onClick={handleOpenCreateUser}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-purple-500 hover:bg-purple-400 text-white font-extrabold text-xs shadow-lg shadow-purple-500/20 transition-all active:scale-95 whitespace-nowrap self-start sm:self-auto"
        >
          <Plus size={16} />
          Nuevo Usuario
        </button>
      </div>

      {/* Role Summary Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { role: 'admin', label: 'Admin', count: users.filter(u => u.role === 'admin').length, color: 'text-purple-400' },
          { role: 'gerencia', label: 'Gerencia', count: users.filter(u => u.role === 'gerencia').length, color: 'text-blue-400' },
          { role: 'encargado', label: 'Encargados', count: users.filter(u => u.role === 'encargado').length, color: 'text-emerald-400' },
          { role: 'cajero', label: 'Cajeros', count: users.filter(u => u.role === 'cajero').length, color: 'text-amber-400' },
          { role: 'repartidor', label: 'Repartidores', count: users.filter(u => u.role === 'repartidor').length, color: 'text-sky-400' },
          { role: 'cliente', label: 'Clientes', count: users.filter(u => u.role === 'cliente').length, color: 'text-lime-400' },
        ].map(r => (
          <div key={r.role} className="bg-[#182229] border border-slate-800 rounded-2xl p-3 space-y-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{r.label}</div>
            <div className={`text-xl font-extrabold ${r.color}`}>{r.count}</div>
          </div>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#111b21] p-2.5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2 w-full sm:w-80">
          <input
            type="checkbox"
            checked={selectedUserIds.length === filteredUsers.length && filteredUsers.length > 0}
            onChange={handleToggleSelectAllUsers}
            className="rounded text-purple-500 bg-[#182229] border-slate-700 focus:ring-0 cursor-pointer ml-1"
            title="Seleccionar todos los usuarios"
          />
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, usuario o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-1.5 bg-[#182229] border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 text-xs">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'admin', label: '👑 Admin' },
            { id: 'gerencia', label: '📊 Gerencia' },
            { id: 'encargado', label: '🏪 Encargados' },
            { id: 'cajero', label: '💳 Cajeros' },
            { id: 'repartidor', label: '🛵 Repartidores' },
            { id: 'cliente', label: '🛒 Clientes' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setRoleFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
                roleFilter === f.id
                  ? 'bg-purple-500 text-white shadow-sm'
                  : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* User Cards Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={28} className="animate-spin text-purple-500" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-xs space-y-2">
            <Users size={36} className="mx-auto text-slate-600" />
            <div>No hay usuarios registrados en este filtro.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredUsers.map(user => {
              const isCurrent = currentUser && currentUser.id === user.id;
              const isChecked = selectedUserIds.includes(user.id);
              const branch = branches.find(b => b.id === user.branchId);
              const driver = drivers.find(d => d.id === user.driverId);
              const tabsCount = (user.tabs || []).length;

              return (
                <div
                  key={user.id}
                  className={`bg-[#182229] border rounded-3xl p-5 shadow-xl space-y-4 flex flex-col justify-between transition ${
                    isCurrent 
                      ? 'border-purple-500/80 ring-1 ring-purple-500/40' 
                      : isChecked
                      ? 'border-purple-500/50 bg-purple-500/5'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleToggleSelectUser(e, user.id)}
                          className="rounded text-purple-500 bg-[#111b21] border-slate-700 focus:ring-0 cursor-pointer shrink-0"
                        />
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/30 to-blue-500/20 border border-purple-500/40 flex items-center justify-center text-sm font-black text-white shadow-md">
                          {user.avatar || 'U'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-white leading-tight">{user.name}</h3>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500 text-white">
                                Tú
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">@{user.username}</div>
                        </div>
                      </div>

                      {getRoleBadge(user.role)}
                    </div>

                    {/* Meta info: Branch / Driver / Permissions */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800/80 space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block">Sucursal:</span>
                        <div className="text-slate-200 font-semibold truncate flex items-center gap-1">
                          <Store size={12} className="text-emerald-400 shrink-0" />
                          <span>{branch?.name || 'Todas / Central'}</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800/80 space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block">Acceso a Vistas:</span>
                        <div className="text-slate-200 font-semibold truncate">
                          {tabsCount} {tabsCount === 1 ? 'área' : 'áreas activas'}
                        </div>
                      </div>
                    </div>

                    {/* Permissions Badges */}
                    <div className="flex flex-wrap gap-1">
                      {user.permissions?.canEditSettings && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          ⚙️ Ajustes
                        </span>
                      )}
                      {user.permissions?.canManageUsers && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          👥 Usuarios
                        </span>
                      )}
                      {user.permissions?.canViewFinancials && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          💰 Finanzas
                        </span>
                      )}
                      {user.permissions?.canManageDrivers && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          🛵 Flota
                        </span>
                      )}
                    </div>

                    {/* Ver Lead link for clientes */}
                    {user.linkedLeadId && (
                      <div className="px-2.5 py-1.5 rounded-xl bg-lime-500/10 border border-lime-500/20 text-[11px] text-lime-300 flex items-center gap-1.5 font-semibold">
                        <span>🔗</span>
                        <span>Vinculado a Lead de WhatsApp</span>
                      </div>
                    )}
                    {user.phone && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <span>📱</span> {user.phone}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => onSwitchUser && onSwitchUser(user)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                        isCurrent
                          ? 'bg-purple-500 text-white border-purple-400'
                          : 'bg-[#111b21] hover:bg-purple-950/40 text-purple-400 border-slate-700/60'
                      }`}
                      title="Cambiar al perfil de este usuario para operar en el sistema"
                    >
                      <LogIn size={13} />
                      <span>{isCurrent ? 'Activo Ahora' : 'Ingresar como'}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditUser(user)}
                        className="p-2 rounded-xl bg-[#111b21] hover:bg-purple-950/40 text-slate-400 hover:text-purple-400 border border-slate-700/60 transition"
                        title="Editar usuario y permisos"
                      >
                        <Edit3 size={14} />
                      </button>

                      <button
                        onClick={() => handleDuplicateUser(user.id)}
                        className="p-2 rounded-xl bg-[#111b21] hover:bg-sky-950/40 text-slate-400 hover:text-sky-400 border border-slate-700/60 transition"
                        title="Duplicar usuario"
                      >
                        <Copy size={14} />
                      </button>

                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-2 rounded-xl bg-[#111b21] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
                        title="Eliminar usuario"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>


      {/* Create / Edit User Modal */}
      {userModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-xl shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {userModal.mode === 'create' ? 'Nuevo Usuario & Perfil' : 'Editar Usuario & Permisos'}
                  </h3>
                  <p className="text-xs text-slate-400">Asigna rol, credenciales, sucursal y permisos específicos</p>
                </div>
              </div>
              <button
                onClick={() => setUserModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              
              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nombre y Apellido:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Marcos Benítez"
                    value={userModal.data.name}
                    onChange={(e) => setUserModal({
                      ...userModal,
                      data: { ...userModal.data, name: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nombre de Usuario (Login):</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: marcos.reparto"
                    value={userModal.data.username}
                    onChange={(e) => setUserModal({
                      ...userModal,
                      data: { ...userModal.data, username: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Contact Email & PIN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Email de Contacto:</label>
                  <input
                    type="email"
                    placeholder="marcos@republicadelacarne.com"
                    value={userModal.data.email}
                    onChange={(e) => setUserModal({
                      ...userModal,
                      data: { ...userModal.data, email: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">PIN / Clave de Acceso Rápido:</label>
                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      maxLength={8}
                      placeholder="1234"
                      value={userModal.data.pin}
                      onChange={(e) => setUserModal({
                        ...userModal,
                        data: { ...userModal.data, pin: e.target.value }
                      })}
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono tracking-widest focus:outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Fiscal Condition & CUIT */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Condición Fiscal IVA:</label>
                  <select
                    value={userModal.data.fiscalCondition || 'CF'}
                    onChange={(e) => setUserModal({
                      ...userModal,
                      data: { ...userModal.data, fiscalCondition: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="CF">👤 Consumidor Final</option>
                    <option value="RI">🏢 IVA Responsable Inscripto (Factura A)</option>
                    <option value="MONO">💼 Monotributista</option>
                    <option value="EX">🏛️ IVA Exento</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">CUIT / DNI:</label>
                  <input
                    type="text"
                    placeholder="20-xxxxxxxx-x o DNI"
                    value={userModal.data.cuit || ''}
                    onChange={(e) => setUserModal({
                      ...userModal,
                      data: { ...userModal.data, cuit: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Role & Branch Linking */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[#111b21] rounded-2xl border border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Rol del Perfil:</label>
                  <select
                    value={userModal.data.role}
                    onChange={(e) => handleRoleChangeInModal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-slate-700 text-white font-bold focus:outline-none focus:border-purple-500"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.id === 'admin' ? '👑' : r.id === 'gerencia' ? '📊' : r.id === 'encargado' ? '🏪' : r.id === 'cajero' ? '💳' : r.id === 'repartidor' ? '🛵' : r.id === 'cliente' ? '🛒' : '👤'} {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Sucursal Asignada:</label>
                  <select
                    value={userModal.data.branchId || ''}
                    onChange={(e) => setUserModal({
                      ...userModal,
                      data: { ...userModal.data, branchId: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">🏢 Todas las Sucursales / Casa Central</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>📍 {b.name} ({b.address})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Repartidor Vinculado:</label>
                  <select
                    value={userModal.data.driverId || ''}
                    onChange={(e) => setUserModal({
                      ...userModal,
                      data: { ...userModal.data, driverId: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#182229] border border-slate-700 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">Sin vincular a repartidor</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.vehicle === 'Auto' ? '🚗' : '🛵'} {d.name} ({d.vehicle} - {d.phone || 'Sin tel'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Phone & JID for cliente / repartidor roles */}
              {(userModal.data.role === 'cliente' || userModal.data.role === 'repartidor') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">📱 Teléfono WhatsApp:</label>
                    <input
                      type="tel"
                      placeholder="+54 9 351 123-4567"
                      value={userModal.data.phone || ''}
                      onChange={(e) => setUserModal({ ...userModal, data: { ...userModal.data, phone: e.target.value } })}
                      className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Permite vincular automáticamente con leads de WhatsApp</p>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">🔗 Lead Vinculado (ID):</label>
                    <input
                      type="text"
                      placeholder="lead-XXXXXXXX (opcional)"
                      value={userModal.data.linkedLeadId || ''}
                      onChange={(e) => setUserModal({ ...userModal, data: { ...userModal.data, linkedLeadId: e.target.value || null } })}
                      className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono text-[11px] focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              )}


              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                    Áreas y Pestañas Visibles ({userModal.data.tabs?.length || 0}):
                  </label>
                  <button
                    type="button"
                    onClick={() => setUserModal({
                      ...userModal,
                      data: { ...userModal.data, tabs: availableTabsList.map(t => t.id) }
                    })}
                    className="text-purple-400 hover:text-purple-300 text-[10px] font-bold"
                  >
                    Seleccionar Todas
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#111b21] p-3 rounded-2xl border border-slate-800 max-h-40 overflow-y-auto">
                  {availableTabsList.map(tab => {
                    const isChecked = (userModal.data.tabs || []).includes(tab.id);
                    return (
                      <label
                        key={tab.id}
                        className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer select-none transition ${
                          isChecked
                            ? 'bg-purple-500/15 border-purple-500/40 text-white font-semibold'
                            : 'bg-[#182229] border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTabPermission(tab.id)}
                          className="w-3.5 h-3.5 rounded text-purple-500 focus:ring-0 cursor-pointer"
                        />
                        <span className="truncate">{tab.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Action Permissions Matrix */}
              <div className="space-y-2">
                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  Permisos de Acción Especiales:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#111b21] p-3 rounded-2xl border border-slate-800">
                  {actionPermissionsList.map(perm => {
                    const isChecked = !!userModal.data.permissions?.[perm.id];
                    return (
                      <label
                        key={perm.id}
                        className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer select-none transition ${
                          isChecked
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-semibold'
                            : 'bg-[#182229] border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleActionPermission(perm.id)}
                          className="w-3.5 h-3.5 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                        />
                        <span className="truncate">{perm.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setUserModal(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-extrabold transition shadow-lg shadow-purple-500/20"
                >
                  Guardar Usuario & Permisos
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Floating Bulk Bar for Users */}
      {selectedUserIds.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[#182229]/95 backdrop-blur-md border border-purple-500/40 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
            <span className="w-6 h-6 rounded-full bg-purple-500 text-white font-black text-xs flex items-center justify-center">
              {selectedUserIds.length}
            </span>
            <span className="text-xs font-bold text-white hidden sm:inline">Usuarios Seleccionados</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleBulkUpdateUsers({ status: 'active' })}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold border border-emerald-500/30 transition"
              title="Activar usuarios seleccionados"
            >
              ✅ Activar
            </button>

            <button
              onClick={() => handleBulkUpdateUsers({ status: 'inactive' })}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/30 transition"
              title="Desactivar usuarios seleccionados"
            >
              ⏸️ Desactivar
            </button>

            <button
              onClick={handleBulkDeleteUsers}
              className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-xs font-bold border border-rose-500/30 transition"
              title="Eliminar usuarios seleccionados"
            >
              <Trash2 size={13} className="inline mr-1" /> Eliminar
            </button>

            <button
              onClick={() => setSelectedUserIds([])}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition ml-1"
              title="Cancelar selección"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
