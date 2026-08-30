import assert from 'assert';
import { ElevenLabsAgentService } from '../server/services/elevenlabsAgent.js';
import { db } from '../server/services/database.js';

async function testElevenLabsAgent() {
  console.log('=== TEST: ElevenLabs Conversational AI Agent (Eleven Agents) ===\n');

  // 1. Test getAgentConfig
  console.log('--- 1. Testing getAgentConfig ---');
  const config = ElevenLabsAgentService.getAgentConfig();
  console.log('Agent Config:', config);
  assert.strictEqual(config.agentId, 'agent_3701khpbdw76fyqb7pd3gj6a1a8g', 'Agent ID debe coincidir');
  assert.strictEqual(config.voiceId, '9rvdnhrYoXoUt4igKpBw', 'Voice ID debe coincidir');
  assert.strictEqual(config.modelId, 'eleven_turbo_v2_5', 'Model ID debe coincidir');
  assert.strictEqual(config.agentEnabled, true, 'Agent Enabled debe ser true');

  // 2. Test buildInitiationClientData
  console.log('\n--- 2. Testing buildInitiationClientData (WebSocket Initiation Spec) ---');
  const lead = {
    jid: '5493516262475@s.whatsapp.net',
    name: 'Don Juan',
    phone: '+54 9 351 626-2475',
    address: 'Locelso 7100'
  };
  const initiationData = ElevenLabsAgentService.buildInitiationClientData({
    lead,
    customerName: 'Don Juan',
    phoneNumber: '+54 9 351 626-2475',
    address: 'Locelso 7100'
  });
  console.log('Initiation Payload:\n', JSON.stringify(initiationData, null, 2));

  assert.strictEqual(initiationData.type, 'conversation_initiation_client_data', 'Tipo debe ser conversation_initiation_client_data');
  assert.strictEqual(initiationData.dynamic_variables.customer_name, 'Don Juan', 'Customer name debe coincidir');
  assert.strictEqual(initiationData.conversation_config_override.tts.voice_id, '9rvdnhrYoXoUt4igKpBw', 'Voice ID en override debe coincidir');

  // 3. Test getSignedUrl
  console.log('\n--- 3. Testing getSignedUrl ---');
  const signedUrlResult = await ElevenLabsAgentService.getSignedUrl();
  console.log('Signed URL Result:', signedUrlResult);
  assert(signedUrlResult.signedUrl.startsWith('wss://'), 'Debe retornar un endpoint WebSocket wss://');

  // 4. Test testAgentConnection
  console.log('\n--- 4. Testing testAgentConnection ---');
  const testRes = await ElevenLabsAgentService.testAgentConnection();
  console.log('Test Connection Result:', testRes);
  assert.strictEqual(testRes.success, true, 'La prueba de conexión debe ser exitosa');

  console.log('\n✅ TODOS LOS TESTS DE ELEVENLABS CONVAI AGENT PASARON 100%!');
}

testElevenLabsAgent().catch(err => {
  console.error('Error en test de ElevenLabs:', err);
  process.exit(1);
});
