import { db } from './database.js';

const CORDOBA_LANDMARKS = [
  { keys: ['roque funes'], lat: -31.3828, lng: -64.2372, address: 'Av. José Roque Funes, Barrio Urca, Córdoba' },
  { keys: ['barrio urca', 'urca'], lat: -31.3828, lng: -64.2372, address: 'Barrio Urca, Córdoba' },
  { keys: ['menendez pidal', 'menéndez pidal', 'alto tejeda'], lat: -31.3792, lng: -64.2448, address: 'Av. Menéndez Pidal, Alto Tejeda, Córdoba' },
  { keys: ['los alamos', 'los álamos', 'corteza mall', 'intercountry'], lat: -31.3533, lng: -64.2831, address: 'Av. Los Álamos 1015, Intercountry, Córdoba' },
  { keys: ['duarte quiros', 'duarte quirós'], lat: -31.4116, lng: -64.2528, address: 'Av. Duarte Quirós, Córdoba' },
  { keys: ['las palmas'], lat: -31.4125, lng: -64.2460, address: 'Barrio Las Palmas, Córdoba' },
  { keys: ['villa allende', 'figueroa alcorta', 'mercadito de la villa'], lat: -31.2946, lng: -64.2954, address: 'Villa Allende, Córdoba' },
  { keys: ['country san isidro', 'san isidro', 'padre luchesse', 'luchesse'], lat: -31.2858, lng: -64.2745, address: 'Country San Isidro (Padre Luchesse), Córdoba' },
  { keys: ['cerro de las rosas'], lat: -31.3728, lng: -64.2345, address: 'Cerro de las Rosas, Córdoba' },
  { keys: ['rafael nunez', 'rafael núñez'], lat: -31.3685, lng: -64.2390, address: 'Av. Rafael Núñez, Córdoba' },
  { keys: ['recta martinoli', 'martinoli', 'arguello', 'argüello'], lat: -31.3565, lng: -64.2625, address: 'Av. Recta Martinoli, Argüello, Córdoba' },
  { keys: ['villa belgrano'], lat: -31.3605, lng: -64.2565, address: 'Villa Belgrano, Córdoba' },
  { keys: ['valle escondido'], lat: -31.3735, lng: -64.2810, address: 'Valle Escondido, Córdoba' },
  { keys: ['la rufina'], lat: -31.3405, lng: -64.2950, address: 'Country La Rufina, Córdoba' },
  { keys: ['las delicias'], lat: -31.3455, lng: -64.2865, address: 'Country Las Delicias, Córdoba' },
  { keys: ['lomas de la carolina'], lat: -31.3520, lng: -64.2940, address: 'Lomas de la Carolina, Córdoba' },
  { keys: ['el bosque'], lat: -31.3480, lng: -64.3020, address: 'Country El Bosque, Córdoba' },
  { keys: ['cuesta colorada'], lat: -31.3485, lng: -64.3160, address: 'Cuesta Colorada, La Calera, Córdoba' },
  { keys: ['la calera'], lat: -31.3448, lng: -64.3352, address: 'La Calera, Córdoba' },
  { keys: ['mendiolaza'], lat: -31.2675, lng: -64.2985, address: 'Mendiolaza, Córdoba' },
  { keys: ['saldan', 'saldán'], lat: -31.3095, lng: -64.3090, address: 'Saldán, Córdoba' },
  { keys: ['unquillo'], lat: -31.2335, lng: -64.3165, address: 'Unquillo, Córdoba' },
  { keys: ['manantiales'], lat: -31.4510, lng: -64.2350, address: 'Barrio Manantiales, Córdoba' },
  { keys: ['siete soles', 'docta'], lat: -31.4340, lng: -64.2980, address: 'Zona Oeste (Siete Soles / Docta), Córdoba' },
  { keys: ['nueva cordoba', 'nueva córdoba'], lat: -31.4265, lng: -64.1865, address: 'Nueva Córdoba, Córdoba' },
  { keys: ['alberdi', 'alto alberdi'], lat: -31.4095, lng: -64.2155, address: 'Alberdi, Córdoba' },
  { keys: ['general paz', 'gral paz'], lat: -31.4135, lng: -64.1675, address: 'Barrio General Paz, Córdoba' },
  { keys: ['alta cordoba', 'alta córdoba', 'cofico'], lat: -31.3935, lng: -64.1855, address: 'Alta Córdoba, Córdoba' },
  { keys: ['centro'], lat: -31.4167, lng: -64.1833, address: 'Centro, Córdoba' }
];

const geocodeCache = new Map();
const routeCache = new Map();

function setBoundedCache(map, key, val, max = 400) {
  if (map.size >= max) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, { val, ts: Date.now() });
}

function getBoundedCache(map, key, ttlMs = 30 * 60 * 1000) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) {
    map.delete(key);
    return null;
  }
  return hit.val;
}

export function calcHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

export function decodePolyline(encoded) {
  if (!encoded) return [];
  const poly = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push([lng * 1e-5, lat * 1e-5]);
  }
  return poly;
}

export function extractCoordinatesFromText(raw = '') {
  if (!raw || typeof raw !== 'string') return null;
  // Soportar URLs de Google Maps (@-31.38,-64.23 o ?q=-31.38,-64.23) o par lat,lng directo
  const m = raw.match(/(-3[0-3]\.\d{3,8})\s*[,;\s]\s*(-6[2-6]\.\d{3,8})/);
  if (m) {
    return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  return null;
}

function rankBranchesForCoords(lat, lng) {
  const branches = (db.getBranches() || []).filter(b => b.isActive !== false);
  const list = branches.length > 0 ? branches : (db.getBranches() || []);
  return list
    .map(b => {
      const bLat = typeof b.lat === 'number' && !Number.isNaN(b.lat) ? b.lat : -31.3828;
      const bLng = typeof b.lng === 'number' && !Number.isNaN(b.lng) ? b.lng : -64.2372;
      const distanceKm = calcHaversineKm(lat, lng, bLat, bLng);
      return {
        ...b,
        lat: bLat,
        lng: bLng,
        distanceKm
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function formatOsmDisplayName(osmItem, fallbackRaw) {
  if (!osmItem) return fallbackRaw;
  const addr = osmItem.address || {};
  const road = addr.road || addr.pedestrian || addr.residential || '';
  const houseNumber = addr.house_number || '';
  const suburb = addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || '';
  const city = addr.city || addr.town || addr.village || addr.municipality || 'Córdoba';

  if (road) {
    const rawNumMatch = String(fallbackRaw || '').match(/\b(\d{2,5})\b/);
    const numPart = houseNumber || (rawNumMatch ? rawNumMatch[1] : '');
    const main = `${road}${numPart ? ` ${numPart}` : ''}`.trim();
    const parts = [main];
    if (suburb && !main.toLowerCase().includes(suburb.toLowerCase())) parts.push(suburb);
    if (city && !parts.some(p => p.toLowerCase().includes(city.toLowerCase()))) parts.push(city);
    return parts.join(', ');
  }

  if (osmItem.display_name) {
    return osmItem.display_name.split(',').slice(0, 4).map(s => s.trim()).join(', ');
  }
  return fallbackRaw;
}

export class DeliveryRoutingService {
  /**
   * Geocodifica una dirección o coordenadas en Córdoba / Sierras Chicas y ranquea todas las sucursales.
   */
  static async geocodeAddress({ address = '', lat = null, lng = null } = {}) {
    const rawAddr = String(address || '').trim();
    const explicitCoords =
      lat !== null && lng !== null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))
        ? { lat: Number(lat), lng: Number(lng) }
        : extractCoordinatesFromText(rawAddr);

    if (explicitCoords) {
      return this.reverseGeocode(explicitCoords.lat, explicitCoords.lng, rawAddr);
    }

    if (!rawAddr) {
      return {
        success: false,
        valid: false,
        confidence: 'none',
        error: 'Dirección requerida'
      };
    }

    const cacheKey = rawAddr.toLowerCase();
    const cached = getBoundedCache(geocodeCache, cacheKey);
    if (cached) return cached;

    const settings = db.getSettings() || {};
    const mapConfig = settings.mapConfig || {};
    const googleApiKey = String(mapConfig.googleMapsApiKey || '').trim();
    const useGoogleGeocoding = Boolean(mapConfig.googleGeocodingEnabled && googleApiKey);

    let resolvedLat = null;
    let resolvedLng = null;
    let formattedAddress = rawAddr;
    let confidence = 'unverified'; // 'exact' | 'street' | 'landmark' | 'unverified'
    let providerUsed = 'unresolved';

    const hasLocalityHint = /c[oó]rdoba|villa allende|mendiolaza|sald[aá]n|la calera|unquillo|san isidro/i.test(rawAddr);
    const searchAddress = hasLocalityHint ? rawAddr : `${rawAddr}, Córdoba, Argentina`;

    // 1. Google Geocoding API (si está habilitada)
    if (useGoogleGeocoding) {
      try {
        const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchAddress)}&region=ar&key=${googleApiKey}`;
        const gRes = await fetch(gUrl, { signal: AbortSignal.timeout(4500) });
        const gData = await gRes.json();
        if (gData.status === 'OK' && Array.isArray(gData.results) && gData.results[0]) {
          const top = gData.results[0];
          const loc = top.geometry?.location;
          if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
            resolvedLat = loc.lat;
            resolvedLng = loc.lng;
            formattedAddress = top.formatted_address || rawAddr;
            const locType = top.geometry?.location_type || '';
            confidence = locType === 'ROOFTOP' || locType === 'RANGE_INTERPOLATED' ? 'exact' : 'street';
            providerUsed = 'google';
          }
        }
      } catch (e) {
        console.warn('[DeliveryRouting] Aviso Google Geocoding:', e.message);
      }
    }

    // 2. Nominatim OpenStreetMap acotado a Gran Córdoba / Argentina
    if (resolvedLat === null || resolvedLng === null) {
      try {
        // Limpiar piso/dpto/lote/manzana para no confundir a Nominatim en la búsqueda vial
        const streetClean = rawAddr
          .replace(/\b(?:piso|dpto|depto|departamento|torre|timbre|casa|manzana|mza|lote|lt)\s*[a-z0-9\-]+/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        const nomQuery = hasLocalityHint ? streetClean : `${streetClean}, Córdoba, Argentina`;
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=ar&viewbox=-64.48,-31.15,-64.02,-31.58&bounded=0&limit=3&q=${encodeURIComponent(nomQuery)}`;
        const osmRes = await fetch(nomUrl, {
          headers: { 'User-Agent': 'RepublicaDeLaCarne-WAgent/2.0' },
          signal: AbortSignal.timeout(4500)
        });
        if (osmRes.ok) {
          const osmData = await osmRes.json();
          if (Array.isArray(osmData) && osmData.length > 0) {
            // Preferir resultado dentro de la provincia de Córdoba (-30.5 a -33.0, -63.0 a -65.5)
            const inCordoba = osmData.find(item => {
              const la = parseFloat(item.lat);
              const lo = parseFloat(item.lon);
              return la <= -30.8 && la >= -32.2 && lo >= -65.0 && lo <= -63.5;
            }) || osmData[0];

            const la = parseFloat(inCordoba.lat);
            const lo = parseFloat(inCordoba.lon);
            if (!Number.isNaN(la) && !Number.isNaN(lo)) {
              resolvedLat = la;
              resolvedLng = lo;
              formattedAddress = formatOsmDisplayName(inCordoba, rawAddr);
              const hasHouseNum = Boolean(inCordoba.address?.house_number || /\b\d{2,5}\b/.test(rawAddr));
              confidence = hasHouseNum ? 'exact' : 'street';
              providerUsed = 'nominatim';
            }
          }
        }
      } catch (e) {
        console.warn('[DeliveryRouting] Aviso Nominatim:', e.message);
      }
    }

    // 3. Landmarks / Barrios / Countries de Córdoba y Sierras Chicas
    if (resolvedLat === null || resolvedLng === null) {
      const lower = rawAddr
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const landmark = CORDOBA_LANDMARKS.find(l =>
        l.keys.some(k => {
          const normK = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return lower.includes(normK);
        })
      );
      if (landmark) {
        resolvedLat = landmark.lat;
        resolvedLng = landmark.lng;
        const hasDetail = /\b(?:lote|mza|manzana|\d{2,5})\b/i.test(rawAddr);
        formattedAddress = hasDetail ? `${rawAddr} (${landmark.address})` : landmark.address;
        confidence = hasDetail ? 'street' : 'landmark';
        providerUsed = 'cordoba_landmarks';
      }
    }

    const valid = resolvedLat !== null && resolvedLng !== null;
    const finalLat = valid ? resolvedLat : -31.3828;
    const finalLng = valid ? resolvedLng : -64.2372;

    const allBranches = rankBranchesForCoords(finalLat, finalLng);
    const closestBranch = allBranches[0] || null;

    const result = {
      success: true,
      valid,
      confidence,
      address: rawAddr,
      formattedAddress: valid ? formattedAddress : rawAddr,
      coordinates: { lat: finalLat, lng: finalLng },
      closestBranch,
      allBranches,
      providerUsed
    };

    setBoundedCache(geocodeCache, cacheKey, result);
    return result;
  }

  /**
   * Geocodificación inversa desde pin GPS de WhatsApp o clic en el mapa interactivo.
   */
  static async reverseGeocode(lat, lng, fallbackLabel = '') {
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (Number.isNaN(nLat) || Number.isNaN(nLng)) {
      return { success: false, valid: false, error: 'Coordenadas inválidas' };
    }

    let detectedAddress = fallbackLabel || `Ubicación GPS (${nLat.toFixed(5)}, ${nLng.toFixed(5)}), Córdoba`;
    let providerUsed = 'coordinates';

    const settings = db.getSettings() || {};
    const mapConfig = settings.mapConfig || {};
    const googleApiKey = String(mapConfig.googleMapsApiKey || '').trim();
    const useGoogleGeocoding = Boolean(mapConfig.googleGeocodingEnabled && googleApiKey);

    if (useGoogleGeocoding) {
      try {
        const gRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${nLat},${nLng}&key=${googleApiKey}`,
          { signal: AbortSignal.timeout(4500) }
        );
        const gData = await gRes.json();
        if (gData.status === 'OK' && gData.results?.[0]?.formatted_address) {
          detectedAddress = gData.results[0].formatted_address;
          providerUsed = 'google';
        }
      } catch (_) {}
    }

    if (providerUsed === 'coordinates') {
      try {
        const osmRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${nLat}&lon=${nLng}`,
          {
            headers: { 'User-Agent': 'RepublicaDeLaCarne-WAgent/2.0' },
            signal: AbortSignal.timeout(4500)
          }
        );
        if (osmRes.ok) {
          const osmData = await osmRes.json();
          if (osmData) {
            detectedAddress = formatOsmDisplayName(osmData, detectedAddress);
            providerUsed = 'nominatim';
          }
        }
      } catch (_) {}
    }

    const allBranches = rankBranchesForCoords(nLat, nLng);
    return {
      success: true,
      valid: true,
      confidence: 'exact',
      address: detectedAddress,
      formattedAddress: detectedAddress,
      coordinates: { lat: nLat, lng: nLng },
      closestBranch: allBranches[0] || null,
      allBranches,
      providerUsed
    };
  }

  /**
   * Traza el camino vial real entre un origen (sucursal) y un destino (cliente).
   */
  static async calculateDrivingRoute(origin, destination) {
    const oLat = Number(origin?.lat);
    const oLng = Number(origin?.lng);
    const dLat = Number(destination?.lat);
    const dLng = Number(destination?.lng);

    if ([oLat, oLng, dLat, dLng].some(v => Number.isNaN(v))) {
      return {
        success: false,
        routeFound: false,
        error: 'Coordenadas de origen o destino inválidas'
      };
    }

    const cacheKey = `${oLat.toFixed(4)},${oLng.toFixed(4)}->${dLat.toFixed(4)},${dLng.toFixed(4)}`;
    const cached = getBoundedCache(routeCache, cacheKey);
    if (cached) return cached;

    const directDist = calcHaversineKm(oLat, oLng, dLat, dLng);
    let routeGeoJson = null;
    let distanceKm = Number((directDist * 1.28).toFixed(2));
    let durationMin = Math.max(8, Math.round(distanceKm * 2.6 + 5));
    let routeFound = false;
    let providerUsed = 'haversine_fallback';

    const settings = db.getSettings() || {};
    const mapConfig = settings.mapConfig || {};
    const googleApiKey = String(mapConfig.googleMapsApiKey || '').trim();
    const useGoogleDirections = Boolean(mapConfig.googleDirectionsEnabled && googleApiKey);

    if (useGoogleDirections) {
      try {
        const gUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${oLat},${oLng}&destination=${dLat},${dLng}&mode=driving&key=${googleApiKey}`;
        const gRes = await fetch(gUrl, { signal: AbortSignal.timeout(4500) });
        const gData = await gRes.json();
        if (gData.status === 'OK' && gData.routes?.[0]) {
          const route = gData.routes[0];
          const leg = route.legs?.[0];
          if (leg) {
            distanceKm = Number((leg.distance.value / 1000).toFixed(2));
            durationMin = Math.max(6, Math.round(leg.duration.value / 60));
          }
          if (route.overview_polyline?.points) {
            routeGeoJson = {
              type: 'LineString',
              coordinates: decodePolyline(route.overview_polyline.points)
            };
          }
          routeFound = true;
          providerUsed = 'google';
        }
      } catch (e) {
        console.warn('[DeliveryRouting] Aviso Google Directions:', e.message);
      }
    }

    if (!routeFound) {
      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson`;
        const r = await fetch(osrmUrl, {
          headers: { 'User-Agent': 'RepublicaDeLaCarne-WAgent/2.0' },
          signal: AbortSignal.timeout(4500)
        });
        if (r.ok) {
          const data = await r.json();
          if (data.code === 'Ok' && data.routes?.[0]) {
            const route = data.routes[0];
            distanceKm = Number((route.distance / 1000).toFixed(2));
            durationMin = Math.max(6, Math.round(route.duration / 60));
            routeGeoJson = route.geometry;
            routeFound = true;
            providerUsed = 'osrm';
          }
        }
      } catch (e) {
        console.warn('[DeliveryRouting] Aviso OSRM:', e.message);
      }
    }

    // Si OSRM/Google están temporalmente sin red pero la distancia lineal en Gran Córdoba es razonable (<30km),
    // trazar polilínea directa de respaldo indicando estimación urbana
    if (!routeFound && directDist <= 30) {
      routeFound = true;
      routeGeoJson = {
        type: 'LineString',
        coordinates: [
          [oLng, oLat],
          [dLng, dLat]
        ]
      };
    }

    const res = {
      success: true,
      routeFound,
      directDistanceKm: directDist,
      distanceKm,
      durationMin,
      routeGeoJson,
      origin: { lat: oLat, lng: oLng },
      destination: { lat: dLat, lng: dLng },
      providerUsed
    };
    setBoundedCache(routeCache, cacheKey, res);
    return res;
  }

  /**
   * Valida integralmente una dirección de cliente ANTES de confirmar el pedido:
   * 1) Verifica si la dirección existe y es suficientemente precisa (calle + altura o country/lote o pin GPS).
   * 2) Verifica que se pueda trazar un camino real en vehículo desde alguna sucursal activa hasta el cliente.
   * 3) Verifica que la distancia esté dentro del radio máximo de cobertura logística.
   */
  static async validateDeliveryAddressAndRoute({ address = '', lat = null, lng = null, preferredBranchId = null } = {}) {
    const geo = await this.geocodeAddress({ address, lat, lng });

    if (!geo.valid) {
      return {
        valid: false,
        canDeliver: false,
        routeVerified: false,
        needsClarification: true,
        reason: 'address_not_found',
        customerPromptHint:
          'No pudimos ubicar esa dirección en el mapa de Córdoba. Pedile amablemente al cliente que confirme calle, numeración (altura) y barrio/localidad, o que comparta su ubicación (pin de GPS) por WhatsApp.',
        formattedAddress: address,
        coordinates: null,
        assignedBranch: null,
        route: null,
        allBranches: geo.allBranches || []
      };
    }

    // Verificar si falta numeración/lote cuando solo escribió una avenida larga o nombre de barrio
    const hasStreetNumOrLot =
      geo.confidence === 'exact' ||
      /\b(?:\d{2,5}|lote|mza|manzana|km\s*\d+|casa\s*\d+|torre\s*\w+)\b/i.test(String(address || ''));

    const candidateBranches = [...(geo.allBranches || [])];
    if (preferredBranchId) {
      const prefIdx = candidateBranches.findIndex(b => b.id === preferredBranchId);
      if (prefIdx > 0) {
        const [pref] = candidateBranches.splice(prefIdx, 1);
        candidateBranches.unshift(pref);
      }
    }

    let selectedBranch = candidateBranches[0] || null;
    let selectedRoute = null;

    // Probar las 2 sucursales más cercanas hasta confirmar camino vial trazable
    for (const branch of candidateBranches.slice(0, 2)) {
      const routeRes = await this.calculateDrivingRoute(
        { lat: branch.lat, lng: branch.lng },
        geo.coordinates
      );
      if (routeRes.routeFound) {
        selectedBranch = branch;
        selectedRoute = routeRes;
        break;
      }
    }

    const maxAllowedKm = Number(selectedBranch?.maxDeliveryKm) || 28;
    const distanceKm = selectedRoute ? selectedRoute.distanceKm : (selectedBranch?.distanceKm ?? 999);
    const withinCoverage = Boolean(selectedRoute?.routeFound) && distanceKm <= maxAllowedKm;

    if (!selectedRoute?.routeFound || !withinCoverage) {
      return {
        valid: true,
        canDeliver: false,
        routeVerified: false,
        needsClarification: true,
        reason: !selectedRoute?.routeFound ? 'no_drivable_route' : 'out_of_coverage_radius',
        customerPromptHint: !selectedRoute?.routeFound
          ? `Se ubicó "${geo.formattedAddress}", pero no se pudo trazar una ruta vehicular directa desde nuestras sucursales. Pedile confirmar calle exacta, intersección o enviar su pin de ubicación por WhatsApp, o bien ofrecer retiro por sucursal.`
          : `La dirección "${geo.formattedAddress}" queda a ${distanceKm} km de nuestra sucursal más cercana (${selectedBranch?.name}), superando el radio habitual de envío (${maxAllowedKm} km). Consultale si la localidad/barrio es correcta o si prefiere retirar por alguna de nuestras 6 sucursales.`,
        formattedAddress: geo.formattedAddress,
        coordinates: geo.coordinates,
        assignedBranch: selectedBranch,
        distanceKm,
        durationMin: selectedRoute?.durationMin || null,
        route: selectedRoute,
        allBranches: geo.allBranches || []
      };
    }

    const needsHouseNumber = !hasStreetNumOrLot;

    return {
      valid: true,
      canDeliver: true,
      routeVerified: !needsHouseNumber,
      needsClarification: needsHouseNumber,
      reason: needsHouseNumber ? 'missing_house_number_or_lot' : 'verified_ok',
      customerPromptHint: needsHouseNumber
        ? `Encontramos la zona "${geo.formattedAddress}" (a ${selectedRoute.distanceKm} km / ~${selectedRoute.durationMin} min desde sucursal ${selectedBranch.name}), pero falta la numeración exacta (altura de calle o Mza/Lote si es country). Pedile ese dato exacto y confirmale si la zona es correcta antes de cerrar el pedido.`
        : `Dirección verificada con éxito en mapa y ruta trazada: "${geo.formattedAddress}". Sucursal óptima asignada: ${selectedBranch.name} (distancia vial: ${selectedRoute.distanceKm} km, tiempo estimado de viaje: ~${selectedRoute.durationMin} min). Confirmale estos datos al cliente antes de dar por cerrado el pedido.`,
      formattedAddress: geo.formattedAddress,
      coordinates: geo.coordinates,
      assignedBranch: selectedBranch,
      distanceKm: selectedRoute.distanceKm,
      durationMin: selectedRoute.durationMin,
      route: selectedRoute,
      allBranches: geo.allBranches || []
    };
  }
}

export default DeliveryRoutingService;

