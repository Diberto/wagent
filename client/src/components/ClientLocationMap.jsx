import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Store, 
  Navigation, 
  Search, 
  ExternalLink, 
  X, 
  Check, 
  RefreshCw, 
  Clock,
  Compass,
  AlertCircle
} from 'lucide-react';

const BRANCH_PINS = [
  { id: 'br-1', name: 'Urca Central', address: 'Av. José Roque Funes 1115', lat: -31.3828, lng: -64.2372, phone: '+54 9 3513 906947' },
  { id: 'br-2', name: 'Urca 2 (Alto Tejeda)', address: 'Av. Menéndez Pidal 3575', lat: -31.3785, lng: -64.2320, phone: '+54 9 3518 623195' },
  { id: 'br-3', name: 'Intercountry (Corteza Mall)', address: 'Av. Los Álamos 1015', lat: -31.3650, lng: -64.2690, phone: '+54 9 3518 623194' },
  { id: 'br-4', name: 'Duarte Quirós', address: 'Av. Duarte Quirós 5130', lat: -31.4085, lng: -64.2490, phone: '+54 9 3518 156595' },
  { id: 'br-5', name: 'Villa Allende', address: 'Av. Figueroa Alcorta 480', lat: -31.2965, lng: -64.2950, phone: '+54 9 3513 540031' },
  { id: 'br-6', name: 'Country San Isidro', address: 'Av. Padre Luchesse km 2', lat: -31.3120, lng: -64.2750, phone: '+54 9 3518 769099' }
];

export default function ClientLocationMap({ 
  address = '', 
  customerName = 'Cliente', 
  onClose, 
  onConfirmLocation 
}) {
  const [searchInput, setSearchInput] = useState(address);
  const [coords, setCoords] = useState({ lat: -31.3828, lng: -64.2372 }); // Urca default
  const [geoData, setGeoData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState(null);

  const geocodeAddress = async (addrToSearch) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addrToSearch || 'Córdoba, Argentina' })
      });
      const data = await res.json();
      if (data.success && data.coordinates) {
        setCoords(data.coordinates);
        setGeoData(data);
        if (data.closestBranch) {
          setSelectedBranch(data.closestBranch);
        }
      }
    } catch (err) {
      console.error('Error al geocodificar dirección:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (address) {
      geocodeAddress(address);
    } else {
      geocodeAddress('Av. José Roque Funes 1115, Córdoba');
    }
  }, [address]);

  // Construct OSM Embedded Map URL with custom bounding box
  const delta = 0.015;
  const bbox = `${coords.lng - delta},${coords.lat - delta},${coords.lng + delta},${coords.lat + delta}`;
  const mapEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${coords.lat},${coords.lng}`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  const wazeUrl = `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#182229] border border-slate-700/80 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-[#111b21]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <MapPin size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Mapa de Geolocalización & Logística
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Córdoba
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Ubicación del cliente: <span className="text-slate-200 font-semibold">{customerName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 sm:p-4 bg-[#141e24] border-b border-slate-800">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              geocodeAddress(searchInput);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar dirección en Córdoba (ej: Rafael Núñez 4250, Roque Funes 1115, Menéndez Pidal 3575)..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#182229] border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition disabled:opacity-50"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>Buscar en Mapa</span>
            </button>
          </form>
        </div>

        {/* Main Map & Branch Logistics Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-y-auto">
          
          {/* Left / Center: Interactive Map */}
          <div className="lg:col-span-2 relative min-h-[300px] lg:min-h-[420px] bg-[#0b141a]">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold bg-[#182229] px-4 py-2 rounded-2xl border border-slate-700 shadow-xl">
                  <RefreshCw size={16} className="animate-spin" />
                  Geolocalizando dirección...
                </div>
              </div>
            ) : null}

            <iframe
              title="Mapa de Entrega"
              width="100%"
              height="100%"
              frameBorder="0"
              scrolling="no"
              marginHeight="0"
              marginWidth="0"
              src={mapEmbedUrl}
              className="w-full h-full min-h-[320px] filter contrast-125 saturate-110"
            />

            {/* Float Floating Navigation Badges */}
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div className="bg-[#111b21]/90 backdrop-blur-md border border-slate-700/80 p-2.5 rounded-2xl shadow-xl pointer-events-auto text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-white">
                  <MapPin size={13} className="text-emerald-400" />
                  <span className="truncate max-w-[200px] sm:max-w-xs">{searchInput || 'Córdoba'}</span>
                </div>
                <div className="font-mono text-slate-400 text-[10px]">
                  Lat: {coords.lat.toFixed(5)} | Lng: {coords.lng.toFixed(5)}
                </div>
              </div>

              <div className="flex items-center gap-1.5 pointer-events-auto">
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-sky-400 border border-slate-700 text-xs font-semibold backdrop-blur-md transition shadow"
                >
                  <ExternalLink size={12} /> Google Maps
                </a>
                <a
                  href={wazeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-sky-300 border border-slate-700 text-xs font-semibold backdrop-blur-md transition shadow"
                >
                  <Compass size={12} /> Waze
                </a>
              </div>
            </div>
          </div>

          {/* Right: Closest Branch & Logistics Summary */}
          <div className="p-4 sm:p-5 bg-[#182229] border-t lg:border-t-0 lg:border-l border-slate-800 space-y-4 overflow-y-auto">
            
            {/* Closest Branch Card */}
            {geoData?.closestBranch && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-emerald-400 uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <Store size={12} /> Sucursal Más Cercana:
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px]">
                    {geoData.closestBranch.distanceKm} km
                  </span>
                </div>
                <div className="text-sm font-bold text-white">{geoData.closestBranch.name}</div>
                <div className="text-xs text-slate-300 leading-tight">{geoData.closestBranch.address}</div>
                
                <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[11px] text-emerald-300">
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> Tiempo estimado delivery:
                  </span>
                  <span className="font-bold">
                    {Math.max(15, Math.round(geoData.closestBranch.distanceKm * 3.5 + 10))} min
                  </span>
                </div>
              </div>
            )}

            {/* List of all 6 branches in Córdoba */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Nuestras 6 Sedes en Córdoba:</span>
                <span className="text-[10px] text-slate-500">Distancia</span>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {(geoData?.allBranches || BRANCH_PINS).map((branch) => {
                  const isSelected = selectedBranch?.id === branch.id;
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => setSelectedBranch(branch)}
                      className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between text-xs ${
                        isSelected 
                          ? 'bg-[#111b21] border-emerald-500 text-white' 
                          : 'bg-[#111b21]/60 hover:bg-[#111b21] border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-white truncate flex items-center gap-1">
                          <Store size={12} className="text-emerald-400 shrink-0" />
                          <span className="truncate">{branch.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{branch.address}</div>
                      </div>
                      {branch.distanceKm !== undefined && (
                        <div className="text-right shrink-0">
                          <span className="font-mono text-emerald-400 font-bold text-xs">{branch.distanceKm} km</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
              {onConfirmLocation && (
                <button
                  type="button"
                  onClick={() => onConfirmLocation({
                    address: searchInput,
                    coordinates: coords,
                    closestBranch: geoData?.closestBranch
                  })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg transition"
                >
                  <Check size={16} /> Confirmar Dirección y Sucursal
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 rounded-xl bg-[#111b21] hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 transition"
              >
                Cerrar Mapa
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
