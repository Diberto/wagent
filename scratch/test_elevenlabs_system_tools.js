import assert from 'assert';
import { ElevenLabsAgentService } from '../server/services/elevenlabsAgent.js';
import { db } from '../server/services/database.js';

async function testSystemIntegration() {
  console.log('=== TEST: ElevenLabs Agent Full Bidirectional System Tools ===\n');

  // 1. Test getCatalogProducts
  console.log('--- 1. Testing getCatalogProducts ---');
  const prods = ElevenLabsAgentService.getCatalogProducts();
  console.log(`Productos cargados: ${prods.totalCount}`, prods.products.slice(0, 3));
  assert(prods.success, 'Debe ser exitoso');
  assert(prods.totalCount > 0, 'Debe haber productos');

  // 2. Test getBranchesInfo
  console.log('\n--- 2. Testing getBranchesInfo ---');
  const branches = ElevenLabsAgentService.getBranchesInfo();
  console.log(`Sucursales encontradas: ${branches.branches.length}`);
  assert.strictEqual(branches.branches.length, 6, 'Deben ser 6 sucursales');
  assert(branches.branches[0].name.includes('Urca'), 'Primera sucursal debe ser Urca');

  // 3. Test createOrderFromAgent
  console.log('\n--- 3. Testing createOrderFromAgent ---');
  const orderRes = await ElevenLabsAgentService.createOrderFromAgent({
    customerName: 'Juan Carlos Test',
    phoneNumber: '+54 9 351 555-1234',
    address: 'Av. Rafael Núñez 4500, Córdoba',
    items: [
      { name: 'Combo “Asadazo” (4 kg cortes + Vino de regalo)', quantity: 1, price: 39999 },
      { name: 'Chorizo Criollo Puro Cerdo (2kg x $10.000 promo)', quantity: 1, price: 10000 }
    ],
    deliveryType: 'delivery',
    paymentMethod: 'Efectivo contraentrega'
  });
  console.log('Order created by agent:', orderRes);
  assert(orderRes.success, 'Creación de orden debe ser exitosa');
  assert.strictEqual(orderRes.totalAmount, 49999, 'Total debe ser 49999');

  // 4. Test getCustomerOrderStatus
  console.log('\n--- 4. Testing getCustomerOrderStatus ---');
  const statusRes = ElevenLabsAgentService.getCustomerOrderStatus('+54 9 351 555-1234');
  console.log('Order status:', statusRes);
  assert(statusRes.success, 'Debe encontrar la orden');
  assert.strictEqual(statusRes.customerName, 'Juan Carlos Test', 'Nombre debe coincidir');
  assert.strictEqual(statusRes.totalAmount, 49999, 'Monto debe coincidir');

  // 5. Test updateCustomerData
  console.log('\n--- 5. Testing updateCustomerData ---');
  const updateRes = ElevenLabsAgentService.updateCustomerData({
    phoneNumber: '+54 9 351 555-1234',
    name: 'Juan Carlos VIP',
    address: 'Av. Rafael Núñez 4500, Dpto 4B',
    notes: 'Cliente preferencial - Prefiere retiro los viernes'
  });
  console.log('Update result:', updateRes);
  assert(updateRes.success, 'Actualización debe ser exitosa');
  assert.strictEqual(updateRes.customer.name, 'Juan Carlos VIP', 'Nombre actualizado debe coincidir');

  // 6. Test executeTool dispatcher
  console.log('\n--- 6. Testing executeTool dispatcher ---');
  const toolRes1 = await ElevenLabsAgentService.executeTool('get_products', { search: 'vacio' });
  assert(toolRes1.success, 'get_products via dispatcher debe ser exitoso');
  console.log('Tool search vacio:', toolRes1.products);

  const toolRes2 = await ElevenLabsAgentService.executeTool('get_branches_info');
  assert(toolRes2.success, 'get_branches_info via dispatcher debe ser exitoso');

  console.log('\n✅ TODAS LAS HERRAMIENTAS BIDIRECCIONALES DEL SISTEMA FUNCIONAN AL 100%!');
}

testSystemIntegration().catch(err => {
  console.error('Error en pruebas de integración:', err);
  process.exit(1);
});
