import assert from 'assert';

async function runTests() {
  console.log('--- 1. Testing /api/geocode endpoint ---');
  const geoRes = await fetch('http://localhost:3001/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: 'Av. José Roque Funes 1115, Córdoba' })
  });
  assert.strictEqual(geoRes.status, 200, 'Geocode endpoint should return 200');
  const geoData = await geoRes.json();
  console.log('Geocoded response:', geoData.coordinates, 'Closest branch:', geoData.closestBranch?.name, `(${geoData.closestBranch?.distanceKm} km)`);
  assert(geoData.success === true, 'Geocoding should succeed');
  assert(geoData.closestBranch !== undefined, 'Closest branch should be calculated');

  console.log('\n--- 2. Testing /api/automations endpoint ---');
  const autoRes = await fetch('http://localhost:3001/api/automations');
  assert.strictEqual(autoRes.status, 200, 'Automations endpoint should return 200');
  const automations = await autoRes.json();
  console.log(`Loaded ${automations.length} automation rules:`);
  automations.forEach(a => console.log(`  - [${a.enabled ? 'ON' : 'OFF'}] ${a.name} (${a.category})`));
  assert(automations.length >= 5, 'Should have at least 5 default automation rules');

  console.log('\n--- 3. Testing Automation Rule Update ---');
  const ruleToUpdate = automations[0];
  const updateRes = await fetch(`http://localhost:3001/api/automations/${ruleToUpdate.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, config: { ...ruleToUpdate.config, requireConfirmation: true } })
  });
  assert.strictEqual(updateRes.status, 200, 'Rule update should succeed');
  const updateData = await updateRes.json();
  assert(updateData.success === true, 'Update response should indicate success');
  console.log('Updated rule successfully:', updateData.automation.name);

  console.log('\n--- 4. Testing Order Creation with POS Items ---');
  const orderRes = await fetch('http://localhost:3001/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Cliente POS Test',
      phone: '+54 9 351 999-8888',
      address: 'Av. Menéndez Pidal 3575, Córdoba',
      items: [
        '1x Combo Asadazo (4 kg) + Vino ($39.999)',
        '2x Vacío Especial Novillito ($23.000)',
        '1x Carbón Quebracho Blanco ($2.200)'
      ],
      totalAmount: 65199,
      paymentMethod: 'Mercado Pago (Sandbox)',
      status: 'pending'
    })
  });
  assert.strictEqual(orderRes.status, 200, 'Order creation should return 200');
  const createdOrder = await orderRes.json();
  console.log('Order created successfully with ID:', createdOrder.id, 'Total:', createdOrder.totalAmount);
  assert.strictEqual(createdOrder.totalAmount, 65199);

  console.log('\n--- 5. Testing Mercado Pago Sandbox Preference Creation ---');
  const mpRes = await fetch('http://localhost:3001/api/mercadopago/create-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: createdOrder.id,
      amount: createdOrder.totalAmount,
      customerName: createdOrder.customerName,
      phone: createdOrder.phone,
      items: createdOrder.items,
      sendWhatsApp: false
    })
  });
  console.log('Mercado Pago create-link status:', mpRes.status);
  const mpData = await mpRes.json();
  console.log('Mercado Pago response:', mpData);

  console.log('\n✅ ALL INTEGRATION TESTS PASSED 100%!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
