import React, { useState, useEffect } from 'react';
import { 
  Bike, 
  Search, 
  Plus, 
  Phone, 
  MapPin, 
  DollarSign, 
  Edit3, 
  Trash2, 
  Copy, 
  Check, 
  X, 
  Send, 
  MessageSquare, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Clock, 
  ShoppingBag, 
  ShieldCheck, 
  Car, 
  Truck, 
  User, 
  Store
} from 'lucide-react';

export default function DriversView({ socket }) {
  const [drivers, setDrivers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  // Create / Edit Driver Modal
  const [driverModal, setDriverModal] = useState(null); // null | { mode: 'create'|'edit', data: { ... } }
  
  // Test WhatsApp State
  const [testingDriverId, setTestingDriverId] = useState(null);
  const [testSuccessId, setTestSuccessId] = useState(null);

  const fetchDrivers = async () => {
    setIsLoading(true);
    try {
      const [drvRes, brRes] = await Promise.all([
        fetch('/api/drivers').then(r => r.json()),
        fetch('/api/branches').then(r => r.json())
      ]);
      setDrivers(Array.isArray(drvRes) ? drvRes : []);
      setBranches(Array.isArray(brRes) ? brRes : []);
    } catch (err) {
      console.error('Error cargando repartidores:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();

    if (socket) {
      socket.on('driver:new', (newDriver) => {
        setDrivers(prev => [newDriver, ...prev.filter(d => d.id !== newDriver.id)]);
      });

      socket.on('driver:update', (updated) => {
        setDrivers(prev => prev.map(d => d.id === updated.id ? updated : d));
      });

      socket.on('driver:delete', (deletedId) => {
        setDrivers(prev => prev.filter(d => d.id !== deletedId));
      });

      return () => {
        socket.off('driver:new');
        socket.off('driver:update');
        socket.off('driver:delete');
      };
    }
  }, [socket]);

  const handleOpenCreateDriver = () => {
    setDriverModal({
      mode: 'create',
      data: {
        name: '',
        phone: '+549351',
        vehicle: 'Moto Honda CG 150',
        plate: '',
        branchId: branches[0]?.id || '',
        status: 'available',
        rating: 5.0
      }
    });
  };

  const handleOpenEditDriver = (driver) => {
    setDriverModal({
      mode: 'edit',
      data: { ...driver }
    });
  };

  const handleSaveDriver = async (e) => {
    e.preventDefault();
    if (!driverModal) return;

    try {
      const isCreate = driverModal.mode === 'create';
      const url = isCreate ? '/api/drivers' : `/api/drivers/${driverModal.data.id}`;
      const method = isCreate ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driverModal.data)
      });

      const saved = await res.json();
      if (res.ok) {
        if (isCreate) {
          setDrivers(prev => [saved, ...prev]);
        } else {
          setDrivers(prev => prev.map(d => d.id === saved.id ? saved : d));
        }
        setDriverModal(null);
      } else {
        alert(saved.error || 'Error al guardar repartidor');
      }
    } catch (err) {
      console.error('Error guardando repartidor:', err);
    }
  };

  const handleDuplicateDriver = async (driverId) => {
    try {
      const res = await fetch(`/api/drivers/${driverId}/duplicate`, { method: 'POST' });
      const cloned = await res.json();
      if (res.ok) {
        setDrivers(prev => [cloned, ...prev]);
      }
    } catch (err) {
      console.error('Error duplicando repartidor:', err);
    }
  };

  const handleDeleteDriver = async (driverId) => {
    if (!window.confirm('¿Estás seguro de eliminar este repartidor del sistema?')) return;
    try {
      await fetch(`/api/drivers/${driverId}`, { method: 'DELETE' });
      setDrivers(prev => prev.filter(d => d.id !== driverId));
    } catch (err) {
      console.error('Error eliminando repartidor:', err);
    }
  };

  const handleTestWhatsApp = async (driver) => {
    if (!driver.phone) {
      alert('Este repartidor no tiene número de teléfono registrado.');
      return;
    }

    setTestingDriverId(driver.id);
    try {
      const res = await fetch(`/api/drivers/${driver.id}/test-whatsapp`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setTestSuccessId(driver.id);
        setTimeout(() => setTestSuccessId(null), 3000);
      } else {
        alert(data.error || 'Error al enviar mensaje de prueba');
      }
    } catch (err) {
      console.error('Error testeando WhatsApp:', err);
    } finally {
      setTestingDriverId(null);
    }
  };

  const handleResetCashBalance = async (driver) => {
    if (!window.confirm(`¿Confirmar rendición de caja de $${(driver.cashCollectedBalance || 0).toLocaleString('es-AR')} para ${driver.name}?`)) return;
    try {
      const res = await fetch(`/api/drivers/${driver.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashCollectedBalance: 0 })
      });
      const updated = await res.json();
      if (res.ok) {
        setDrivers(prev => prev.map(d => d.id === updated.id ? updated : d));
      }
    } catch (err) {
      console.error('Error rindiendo caja:', err);
    }
  };

  // Metrics
  const totalDrivers = drivers.length;
  const onDeliveryCount = drivers.filter(d => d.status === 'on_delivery').length;
  const availableCount = drivers.filter(d => d.status === 'available').length;
  const totalCashToSettle = drivers.reduce((sum, d) => sum + (Number(d.cashCollectedBalance) || 0), 0);

  const filteredDrivers = drivers.filter(d => {
    const matchesSearch = 
      (d.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.phone || '').includes(search) ||
      (d.vehicle || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.plate || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getVehicleIcon = (vehicle = '') => {
    const v = vehicle.toLowerCase();
    if (v.includes('auto') || v.includes('coche')) return <Car size={16} className="text-sky-400" />;
    if (v.includes('furgon') || v.includes('camioneta')) return <Truck size={16} className="text-purple-400" />;
    return <Bike size={16} className="text-emerald-400" />;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-hidden p-4 sm:p-6 space-y-5">
      
      {/* Top Header & Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Bike size={18} />
            </div>
            Gestión de Repartidores & Delivery
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Control de flota, hojas de ruta por WhatsApp, confirmación interactiva de entregas y caja en mano
          </p>
        </div>

        <button
          onClick={handleOpenCreateDriver}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95 whitespace-nowrap self-start sm:self-auto"
        >
          <Plus size={16} />
          Nuevo Repartidor
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#182229] border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Repartidores</div>
          <div className="text-xl font-extrabold text-white">{totalDrivers}</div>
        </div>

        <div className="bg-[#182229] border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Disponibles</div>
          <div className="text-xl font-extrabold text-emerald-400">{availableCount}</div>
        </div>

        <div className="bg-[#182229] border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <div className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">En Reparto</div>
          <div className="text-xl font-extrabold text-sky-400">{onDeliveryCount}</div>
        </div>

        <div className="bg-[#182229] border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Efectivo a Rendir</div>
          <div className="text-xl font-extrabold text-amber-400 font-mono">
            ${totalCashToSettle.toLocaleString('es-AR')}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#111b21] p-2.5 rounded-2xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono o patente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-1.5 bg-[#182229] border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 text-xs">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'available', label: '🟢 Disponibles' },
            { id: 'on_delivery', label: '🛵 En Reparto' },
            { id: 'offline', label: '⚪ Desconectados' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
                statusFilter === f.id
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'bg-[#182229] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drivers Cards Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={28} className="animate-spin text-emerald-500" />
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-xs space-y-2">
            <Bike size={36} className="mx-auto text-slate-600" />
            <div>No hay repartidores registrados en este filtro.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDrivers.map(driver => {
              const branch = branches.find(b => b.id === driver.branchId);
              const isTesting = testingDriverId === driver.id;
              const isTestSuccess = testSuccessId === driver.id;

              return (
                <div
                  key={driver.id}
                  className="bg-[#182229] border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4 hover:border-slate-700 transition flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-[#111b21] border border-slate-700/80 flex items-center justify-center text-xl font-bold text-white shadow-md">
                          {getVehicleIcon(driver.vehicle)}
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white leading-tight flex items-center gap-2">
                            {driver.name}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                              driver.status === 'available'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : driver.status === 'on_delivery'
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/30 animate-pulse'
                                : 'bg-slate-700/30 text-slate-400 border-slate-700'
                            }`}>
                              {driver.status === 'available' ? 'Disponible' : driver.status === 'on_delivery' ? 'En Reparto' : 'Desconectado'}
                            </span>
                          </h3>
                          <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <Phone size={12} className="text-emerald-400" />
                            <span className="font-mono">{driver.phone || 'Sin WhatsApp'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Vehicle & Branch Details */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800/80 space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block">Vehículo:</span>
                        <div className="text-slate-200 font-semibold truncate">{driver.vehicle || 'Moto'}</div>
                        {driver.plate && <span className="text-[10px] font-mono text-emerald-400 font-bold block">Patente: {driver.plate}</span>}
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#111b21] border border-slate-800/80 space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block">Sucursal Base:</span>
                        <div className="text-slate-200 font-semibold truncate flex items-center gap-1">
                          <Store size={12} className="text-sky-400 shrink-0" />
                          <span>{branch?.name || 'Central'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Metrics Bar */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-[#111b21] border border-slate-800 text-center">
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold">Activos</div>
                        <div className="text-xs font-bold text-sky-400">{driver.activeDeliveriesCount || 0}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold">Entregados</div>
                        <div className="text-xs font-bold text-white">{driver.totalDeliveredCount || 0}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold">Caja en Mano</div>
                        <div className="text-xs font-black text-amber-400 font-mono">
                          ${(driver.cashCollectedBalance || 0).toLocaleString('es-AR')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions & WhatsApp Test Button */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleTestWhatsApp(driver)}
                        disabled={isTesting}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                          isTestSuccess
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-[#111b21] hover:bg-emerald-950/40 text-emerald-400 border-slate-700/60'
                        }`}
                        title="Enviar mensaje de prueba interactivo al WhatsApp del repartidor"
                      >
                        <MessageSquare size={13} className={isTesting ? 'animate-spin' : ''} />
                        <span>{isTesting ? 'Enviando...' : isTestSuccess ? '¡Enviado!' : 'Test WhatsApp'}</span>
                      </button>

                      {(driver.cashCollectedBalance > 0) && (
                        <button
                          onClick={() => handleResetCashBalance(driver)}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition"
                          title="Rendir y poner en $0 el saldo de caja cobrado"
                        >
                          Rendir Caja
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditDriver(driver)}
                        className="p-2 rounded-xl bg-[#111b21] hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 border border-slate-700/60 transition"
                        title="Editar repartidor"
                      >
                        <Edit3 size={14} />
                      </button>

                      <button
                        onClick={() => handleDuplicateDriver(driver.id)}
                        className="p-2 rounded-xl bg-[#111b21] hover:bg-sky-950/40 text-slate-400 hover:text-sky-400 border border-slate-700/60 transition"
                        title="Duplicar repartidor"
                      >
                        <Copy size={14} />
                      </button>

                      <button
                        onClick={() => handleDeleteDriver(driver.id)}
                        className="p-2 rounded-xl bg-[#111b21] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
                        title="Eliminar repartidor"
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

      {/* Create / Edit Driver Modal */}
      {driverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#182229] border border-slate-700/80 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <Bike size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {driverModal.mode === 'create' ? 'Nuevo Repartidor' : 'Editar Repartidor'}
                  </h3>
                  <p className="text-xs text-slate-400">Datos de contacto, vehículo y sucursal base</p>
                </div>
              </div>
              <button
                onClick={() => setDriverModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDriver} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nombre Completo del Repartidor:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Marcos Benítez"
                  value={driverModal.data.name}
                  onChange={(e) => setDriverModal({
                    ...driverModal,
                    data: { ...driverModal.data, name: e.target.value }
                  })}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Teléfono / Celular con WhatsApp:</label>
                <input
                  type="text"
                  required
                  placeholder="+54 9 351 XXX-XXXX"
                  value={driverModal.data.phone}
                  onChange={(e) => setDriverModal({
                    ...driverModal,
                    data: { ...driverModal.data, phone: e.target.value }
                  })}
                  className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Vehículo:</label>
                  <input
                    type="text"
                    placeholder="Ej: Moto Honda CG 150"
                    value={driverModal.data.vehicle}
                    onChange={(e) => setDriverModal({
                      ...driverModal,
                      data: { ...driverModal.data, vehicle: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Patente / Dominio:</label>
                  <input
                    type="text"
                    placeholder="Ej: A123BCD"
                    value={driverModal.data.plate}
                    onChange={(e) => setDriverModal({
                      ...driverModal,
                      data: { ...driverModal.data, plate: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Sucursal Base:</label>
                  <select
                    value={driverModal.data.branchId || ''}
                    onChange={(e) => setDriverModal({
                      ...driverModal,
                      data: { ...driverModal.data, branchId: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Todas / Central</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Estado Operativo:</label>
                  <select
                    value={driverModal.data.status}
                    onChange={(e) => setDriverModal({
                      ...driverModal,
                      data: { ...driverModal.data, status: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[#111b21] border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="available">🟢 Disponible</option>
                    <option value="on_delivery">🛵 En Reparto</option>
                    <option value="offline">⚪ Desconectado</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDriverModal(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-[#111b21] border border-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold transition"
                >
                  Guardar Repartidor
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
