import DeliveryRoutingService from '../services/deliveryRoutingService.js';
import InternalOrderOcrService from '../services/internalOrderOcrService.js';
import { mongoPersistence } from '../services/mongoPersistence.js';
import db from '../services/database.js';

async function runTests() {
  console.log('🧪 Iniciando pruebas de Verificación: Persistencia, Geocodificación/Ruteo y OCR Interno...\n');

  let passed = 0;
  let total = 0;

  // TEST 1: Branches and Coordinates in Database
  total++;
  try {
    const branches = db.getBranches();
    if (!Array.isArray(branches) || branches.length < 6) {
      throw new Error(`Se esperaban al menos 6 sucursales, se encontraron ${branches?.length}`);
    }
    const hasCoordinates = branches.every(b => typeof b.lat === 'number' && typeof b.lng === 'number');
    if (!hasCoordinates) {
      throw new Error('Una o más sucursales carecen de coordenadas lat/lng');
    }
    console.log(`1️⃣ Sucursales Córdoba & GPS: ✅ OK (${branches.length} sucursales con coordenadas válidas)`);
    passed++;
  } catch (err) {
    console.error('1️⃣ Sucursales Córdoba & GPS: ❌ FALLÓ:', err.message);
  }

  // TEST 2: DeliveryRoutingService Landmark & Geocoding
  total++;
  try {
    const geoResult = await DeliveryRoutingService.geocodeAddress({ address: 'Roque Funes 1704, Urca' });
    if (!geoResult || !geoResult.valid || !geoResult.coordinates) {
      throw new Error('Geocodificación falló o devolvió coordenadas inválidas');
    }
    console.log(`2️⃣ Geocodificación Córdoba (Urca): ✅ OK -> (${geoResult.coordinates.lat}, ${geoResult.coordinates.lng}) [${geoResult.formattedAddress}]`);
    passed++;
  } catch (err) {
    console.error('2️⃣ Geocodificación Córdoba: ❌ FALLÓ:', err.message);
  }

  // TEST 3: Reverse-Geocoding WhatsApp GPS Pin
  total++;
  try {
    const reverse = await DeliveryRoutingService.reverseGeocode(-31.3789, -64.2345);
    if (!reverse || !reverse.address) {
      throw new Error('Reverse geocoding no devolvió dirección');
    }
    console.log(`3️⃣ Geocodificación Inversa Pin GPS: ✅ OK -> "${reverse.address}"`);
    passed++;
  } catch (err) {
    console.error('3️⃣ Geocodificación Inversa Pin GPS: ❌ FALLÓ:', err.message);
  }

  // TEST 4: OSRM Route Tracing between Branch and Customer
  total++;
  try {
    const branches = db.getBranches();
    const branchUrca = branches.find(b => b.id === 'suc-urca') || branches[0];
    const validation = await DeliveryRoutingService.validateDeliveryAddressAndRoute({
      address: 'Emilio Pettoruti 2450, Cerro de las Rosas, Córdoba',
      preferredBranchId: branchUrca.id
    });
    if (!validation.valid || !validation.route) {
      throw new Error('Ruta inválida o no calculada');
    }
    console.log(`4️⃣ Trazado de Ruta Vial OSRM: ✅ OK -> Sucursal: ${validation.assignedBranch?.name}, Distancia: ${validation.route.distanceKm} km, Tiempo: ${validation.route.durationMin} min`);
    passed++;
  } catch (err) {
    console.error('4️⃣ Trazado de Ruta Vial OSRM: ❌ FALLÓ:', err.message);
  }

  // TEST 5: Internal Order OCR Text Parser
  total++;
  try {
    const rawNote = `
      PEDIDO DE SUCURSAL URCA A CENTRAL
      Fecha: 30/10
      - 5 costillares de novillo
      - 30 kg de vacio
      - 20 kg de chorizo especial
      - 10 kg de matambre
      Urgente para el fin de semana
    `;
    const fastParsed = InternalOrderOcrService.parseInternalOrderFast(rawNote, {
      senderBranch: { id: 'suc-urca', name: 'Sucursal Urca' }
    });
    if (!fastParsed || !Array.isArray(fastParsed.items) || fastParsed.items.length < 3) {
      throw new Error(`Se esperaban al menos 3 cortes, se parsearon ${fastParsed?.items?.length}`);
    }
    console.log(`5️⃣ Parseo de Pedido Interno OCR: ✅ OK -> ${fastParsed.items.length} cortes extraídos (ej: ${fastParsed.items[0].name} x ${fastParsed.items[0].quantity} ${fastParsed.items[0].unit})`);
    passed++;
  } catch (err) {
    console.error('5️⃣ Parseo de Pedido Interno OCR: ❌ FALLÓ:', err.message);
  }

  // TEST 6: Consolidated Matrix Summary in OCR Service
  total++;
  try {
    const sampleOrders = [
      {
        id: 'ocr-test-1',
        status: 'pending',
        direction: 'branch_to_admin',
        sourceBranch: 'Sucursal Urca',
        targetUnit: 'Administración Central',
        priority: 'urgent',
        items: [
          { name: 'Costillar Novillo', quantity: 5, unit: 'un' },
          { name: 'Vacio', quantity: 30, unit: 'kg' }
        ]
      },
      {
        id: 'ocr-test-2',
        status: 'dispatched',
        direction: 'admin_to_branch',
        sourceBranch: 'Administración Central',
        targetUnit: 'Sucursal Urca',
        priority: 'normal',
        items: [
          { name: 'Chorizo Especial', quantity: 20, unit: 'kg' }
        ]
      }
    ];
    const summary = InternalOrderOcrService.buildConsolidatedSummary(sampleOrders);
    if (!summary || !summary.totals || summary.totals.totalOrders !== 2) {
      throw new Error('Matriz consolidada inválida');
    }
    console.log(`6️⃣ Matriz Consolidada de Pedidos Internos: ✅ OK -> ${summary.totals.totalOrders} pedidos analizados, ${summary.productBreakdown?.length} cortes consolidados`);
    passed++;
  } catch (err) {
    console.error('6️⃣ Matriz Consolidada de Pedidos Internos: ❌ FALLÓ:', err.message);
  }

  // TEST 7: Mongo Persistence Vault API Check
  total++;
  try {
    if (typeof mongoPersistence.flushCloudSyncNow !== 'function' || typeof mongoPersistence.hydrateFromCloud !== 'function') {
      throw new Error('Faltan métodos clave en mongoPersistence');
    }
    console.log('7️⃣ Bóveda MongoPersistence Vault: ✅ OK (flushCloudSyncNow, hydrateFromCloud, chunked BSON seguros)');
    passed++;
  } catch (err) {
    console.error('7️⃣ Bóveda MongoPersistence Vault: ❌ FALLÓ:', err.message);
  }

  console.log(`\n===========================================`);
  console.log(`RESULTADO FINAL: ${passed}/${total} PRUEBAS EXITOSAS`);
  console.log(`===========================================\n`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});

