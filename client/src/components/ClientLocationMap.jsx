import React, { useState, useEffect, useRef } from 'react';
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
  AlertCircle,
  Route,
  Zap,
  Crosshair
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_BRANCHES = [
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
  initialCoords = null,
  onClose, 
  onConfirmLocation 
}) {
  const [searchInput, setSearchInput] = useState(address);
  const [coords, setCoords] = useState(initialCoords || { lat: -31.3828, lng: -64.2372 });
  const [geoData, setGeoData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [isRouting, setIsRouting] = useState(false);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const customerMarkerRef = useRef(null);
  const branchMarkersRef = useRef([]);
  const routeLayerRef = useRef(null);

  // 1. Geocodificar Dirección Escrita
  const geocodeAddress = async (addrToSearch) => {
    if (!addrToSearch) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addrToSearch })
      });
      const data = await res.json();
      if (data.success && data.coordinates) {
        setCoords(data.coordinates);
        setGeoData(data);
        const branch = data.closestBranch || DEFAULT_BRANCHES[0];
        setSelectedBranch(branch);
        calculateOptimalRoute(data.coordinates, branch);
      }
    } catch (err) {
      console.error('Error al geocodificar:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Geocodificación Inversa al Hacer Click en el Mapa
  const reverseGeocodeCoords = async (newLat, newLng) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/reverse-geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: newLat, lng: newLng })
      });
      const data = await res.json();
      if (data.success) {
        setSearchInput(data.address);
        setCoords({ lat: newLat, lng: newLng });
        setGeoData(data);
        const branch = data.closestBranch || selectedBranch || DEFAULT_BRANCHES[0];
        setSelectedBranch(branch);
        calculateOptimalRoute({ lat: newLat, lng: newLng }, branch);
      }
    } catch (err) {
      console.error('Error en geocodificación inversa:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Cálculo de Mejor Recorrido (Ruta Óptima de Entrega)
  const calculateOptimalRoute = async (destCoords, branch) => {
    if (!destCoords || !branch) return;
    setIsRouting(true);
    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: branch.lat, lng: branch.lng },
          destination: destCoords
        })
      });
      const data = await res.json();
      if (data.success) {
        setRouteInfo(data);
        drawRouteOnMap(data.routeGeoJson, destCoords, branch);
      }
    } catch (err) {
      console.error('Error calculando ruta:', err);
    } finally {
      setIsRouting(false);
    }
  };

  // 4. Inicializar Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [coords.lat, coords.lng],
        zoom: 14,
        zoomControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      // Evento de Click en el mapa para marcar ubicación del cliente
      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        reverseGeocodeCoords(lat, lng);
      });

      mapInstanceRef.current = map;
    }

    // Inicializar búsqueda si hay dirección
    if (address) {
      geocodeAddress(address);
    } else if (initialCoords) {
      reverseGeocodeCoords(initialCoords.lat, initialCoords.lng);
    } else {
      geocodeAddress('Av. José Roque Funes 1115, Córdoba');
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 5. Dibujar Marcadores y Ruta en el Mapa
  const drawRouteOnMap = (geoJson, clientCoords, branch) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Limpiar capa de ruta previa
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    // Limpiar marcadores de sucursal previos
    branchMarkersRef.current.forEach(m => map.removeLayer(m));
    branchMarkersRef.current = [];

    // Icono Personalizado del Cliente (Pin Rojo/Esmeralda)
    const customerIcon = L.divIcon({
      className: 'custom-customer-pin',
      html: `
        <div style="background-color: #10b981; color: #022c22; font-weight: 800; font-size: 11px; padding: 4px 8px; border-radius: 9999px; border: 2px solid white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.4); display: flex; align-items: center; gap: 4px; white-space: nowrap; transform: translate(-50%, -100%);">
          <span>📍 ${customerName || 'Cliente'}</span>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    if (customerMarkerRef.current) {
      customerMarkerRef.current.setLatLng([clientCoords.lat, clientCoords.lng]);
    } else {
      customerMarkerRef.current = L.marker([clientCoords.lat, clientCoords.lng], { 
        icon: customerIcon,
        draggable: true 
      }).addTo(map);

      customerMarkerRef.current.on('dragend', (e) => {
        const { lat, lng } = e.target.getLatLng();
        reverseGeocodeCoords(lat, lng);
      });
    }

    // Iconos de Sucursales
    const branchesList = geoData?.allBranches || DEFAULT_BRANCHES;
    branchesList.forEach(b => {
      const isSelected = b.id === branch.id;
      const branchIcon = L.divIcon({
        className: 'custom-branch-pin',
        html: `
          <div style="background-color: ${isSelected ? '#3b82f6' : '#1e293b'}; color: white; font-weight: bold; font-size: 10px; padding: 3px 6px; border-radius: 8px; border: 2px solid ${isSelected ? '#93c5fd' : '#475569'}; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 3px; white-space: nowrap; transform: translate(-50%, -100%);">
            <span>🥩 ${b.name}</span>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });

      const marker = L.marker([b.lat, b.lng], { icon: branchIcon }).addTo(map);
      marker.on('click', () => {
        setSelectedBranch(b);
        calculateOptimalRoute(clientCoords, b);
      });
      branchMarkersRef.current.push(marker);
    });

    // Dibujar Polyline de Ruta
    if (geoJson && geoJson.coordinates) {
      const latLngs = geoJson.coordinates.map(c => [c[1], c[0]]);
      routeLayerRef.current = L.polyline(latLngs, {
        color: '#10b981',
        weight: 5,
        opacity: 0.9,
        dashArray: '8, 8',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      const bounds = L.latLngBounds([
        [clientCoords.lat, clientCoords.lng],
        [branch.lat, branch.lng],
        ...latLngs
      ]);
      map.fitBounds(bounds, { padding: [50, 50] });
    } else {
      // Línea directa si no hay geometría OSRM
      routeLayerRef.current = L.polyline([
        [branch.lat, branch.lng],
        [clientCoords.lat, clientCoords.lng]
      ], {
        color: '#3b82f6',
        weight: 4,
        dashArray: '5, 10'
      }).addTo(map);

      map.setView([clientCoords.lat, clientCoords.lng], 14);
    }
  };

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${selectedBranch?.lat || -31.3828},${selectedBranch?.lng || -64.2372}&destination=${coords.lat},${coords.lng}`;
  const wazeUrl = `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-[#182229] border border-slate-700/80 rounded-3xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-[#111b21]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <MapPin size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Mapa Interactivo de Entrega & Mejor Recorrido
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Córdoba
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Seleccioná en el mapa o buscá la dirección de: <span className="text-slate-200 font-semibold">{customerName}</span>
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

        {/* Search Bar & Instructions */}
        <div className="p-3 sm:p-4 bg-[#141e24] border-b border-slate-800 flex flex-col sm:flex-row items-center gap-2">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              geocodeAddress(searchInput);
            }}
            className="flex items-center gap-2 w-full flex-1"
          >
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar calle, altura o barrio en Córdoba (ej: Rafael Núñez 4250, Menéndez Pidal 3575)..."
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
              <span>Buscar</span>
            </button>
          </form>

          <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shrink-0">
            <Crosshair size={13} />
            <span>Hacé click en cualquier punto del mapa para marcar</span>
          </div>
        </div>

        {/* Main Map & Branch Logistics Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-y-auto">
          
          {/* Left / Center: Leaflet Interactive Map */}
          <div className="lg:col-span-2 relative min-h-[320px] lg:min-h-[460px] bg-[#0b141a]">
            {isLoading || isRouting ? (
              <div className="absolute top-4 left-4 z-[1000]">
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold bg-[#182229]/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-700 shadow-xl">
                  <RefreshCw size={14} className="animate-spin text-emerald-400" />
                  <span>{isLoading ? 'Geolocalizando...' : 'Calculando mejor recorrido...'}</span>
                </div>
              </div>
            ) : null}

            {/* Container for Leaflet */}
            <div ref={mapContainerRef} className="w-full h-full min-h-[320px] lg:min-h-[460px]" />

            {/* Route Floating Stats Overlay */}
            {routeInfo && (
              <div className="absolute top-4 right-4 z-[1000] bg-[#111b21]/95 backdrop-blur-md border border-emerald-500/40 p-3 rounded-2xl shadow-2xl text-xs space-y-1.5 max-w-xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <Route size={13} /> Mejor Recorrido:
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px]">
                    {routeInfo.distanceKm} km
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 flex items-center justify-between pt-1 border-t border-slate-800">
                  <span className="flex items-center gap-1 text-slate-400">
                    <Clock size={12} /> Tiempo de viaje:
                  </span>
                  <span className="font-bold text-white font-mono">
                    ~{routeInfo.durationMin} min
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  Desde: <span className="text-white font-semibold">{selectedBranch?.name}</span>
                </div>
              </div>
            )}

            {/* Floating Navigation Badges */}
            <div className="absolute bottom-3 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div className="bg-[#111b21]/95 backdrop-blur-md border border-slate-700/80 p-2.5 rounded-2xl shadow-xl pointer-events-auto text-[11px] space-y-0.5">
                <div className="flex items-center gap-1.5 font-bold text-white">
                  <MapPin size={13} className="text-emerald-400" />
                  <span className="truncate max-w-[220px] sm:max-w-xs">{searchInput || 'Córdoba'}</span>
                </div>
                <div className="font-mono text-slate-400 text-[10px]">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </div>
              </div>

              <div className="flex items-center gap-1.5 pointer-events-auto">
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-sky-400 border border-slate-700 text-xs font-semibold backdrop-blur-md transition shadow"
                >
                  <ExternalLink size={12} /> Google Maps
                </a>
                <a
                  href={wazeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-sky-300 border border-slate-700 text-xs font-semibold backdrop-blur-md transition shadow"
                >
                  <Compass size={12} /> Waze
                </a>
              </div>
            </div>
          </div>

          {/* Right: Closest Branch & Logistics Selection */}
          <div className="p-4 sm:p-5 bg-[#182229] border-t lg:border-t-0 lg:border-l border-slate-800 space-y-4 overflow-y-auto">
            
            {/* Closest Branch Card */}
            {selectedBranch && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-emerald-400 uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <Store size={12} /> Sucursal Seleccionada:
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px]">
                    {selectedBranch.distanceKm || routeInfo?.distanceKm || '1.5'} km
                  </span>
                </div>
                <div className="text-sm font-bold text-white">{selectedBranch.name}</div>
                <div className="text-xs text-slate-300 leading-tight">{selectedBranch.address}</div>
                
                <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[11px] text-emerald-300">
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> Despacho estimado:
                  </span>
                  <span className="font-bold">
                    {routeInfo ? `${routeInfo.durationMin} min` : '15 - 25 min'}
                  </span>
                </div>
              </div>
            )}

            {/* List of all branches with click to calculate route */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Nuestras 6 Sedes en Córdoba:</span>
                <span className="text-[10px] text-slate-500">Distancia</span>
              </div>

              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {(geoData?.allBranches || DEFAULT_BRANCHES).map((branch) => {
                  const isSelected = selectedBranch?.id === branch.id;
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => {
                        setSelectedBranch(branch);
                        calculateOptimalRoute(coords, branch);
                      }}
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
                    closestBranch: selectedBranch,
                    route: routeInfo
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
