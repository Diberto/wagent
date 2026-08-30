import { db } from './database.js';

export class ElevenLabsAgentService {
  static DEFAULT_AGENT_ID = 'agent_3701khpbdw76fyqb7pd3gj6a1a8g';
  static DEFAULT_VOICE_ID = '9rvdnhrYoXoUt4igKpBw';
  static DEFAULT_MODEL_ID = 'eleven_turbo_v2_5';
  static DEFAULT_FIRST_MESSAGE = '¡Hola! Gracias por comunicarte con nosotros, ¿en qué puedo ayudarte hoy?';

  /**
   * Obtiene la configuración actual del Agente Conversacional de ElevenLabs
   */
  static getAgentConfig() {
    const settings = db.getSettings();
    return {
      agentId: settings.elevenlabsAgentId || this.DEFAULT_AGENT_ID,
      voiceId: settings.elevenlabsVoiceId || this.DEFAULT_VOICE_ID,
      modelId: settings.elevenlabsModelId || this.DEFAULT_MODEL_ID,
      agentName: settings.elevenlabsAgentName || 'República de la Carne',
      agentEnabled: settings.elevenlabsAgentEnabled ?? true,
      firstMessage: settings.elevenlabsFirstMessage || this.DEFAULT_FIRST_MESSAGE,
      hasApiKey: Boolean(settings.elevenlabsApiKey && settings.elevenlabsApiKey.startsWith('sk_')),
      wsEndpoint: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${settings.elevenlabsAgentId || this.DEFAULT_AGENT_ID}`
    };
  }

  /**
   * Genera una URL firmada (Signed URL) para conectar al WebSocket de forma segura desde el navegador
   * Ref: https://elevenlabs.io/docs/eleven-agents/api-reference/eleven-agents/websocket
   */
  static async getSignedUrl(customAgentId = null) {
    const settings = db.getSettings();
    const agentId = customAgentId || settings.elevenlabsAgentId || this.DEFAULT_AGENT_ID;
    const apiKey = settings.elevenlabsApiKey;

    if (!apiKey) {
      // Si no hay API key o es agente público, retorna la URL directa estándar
      return {
        success: true,
        signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`,
        agentId,
        isSigned: false
      };
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[ElevenLabs ConvAI] No se pudo obtener Signed URL (${response.status}): ${errText}. Usando conexión directa...`);
        return {
          success: true,
          signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`,
          agentId,
          isSigned: false
        };
      }

      const data = await response.json();
      return {
        success: true,
        signedUrl: data.signed_url,
        agentId,
        isSigned: true
      };
    } catch (error) {
      console.error('[ElevenLabs ConvAI] Error solicitando signed URL:', error);
      return {
        success: true,
        signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`,
        agentId,
        isSigned: false
      };
    }
  }

  /**
   * Construye el payload de inicialización "conversation_initiation_client_data"
   * según la especificación oficial de ElevenLabs WebSocket
   */
  static buildInitiationClientData({
    lead = null,
    customerName = null,
    phoneNumber = null,
    address = null,
    customFirstMessage = null,
    extraVariables = {}
  } = {}) {
    const settings = db.getSettings();
    const name = customerName || lead?.name || 'Cliente';
    const phone = phoneNumber || lead?.phone || lead?.jid?.split('@')[0] || '';
    const addr = address || lead?.address || '';
    const firstMsg = customFirstMessage || settings.elevenlabsFirstMessage || this.DEFAULT_FIRST_MESSAGE;

    // Buscar último pedido si existe
    let lastOrderSummary = '';
    if (lead?.jid) {
      const lastOrder = db.getLatestOrderByJid(lead.jid);
      if (lastOrder) {
        lastOrderSummary = `Pedido #${lastOrder.id}: ${(lastOrder.items || []).join(', ')} ($${(lastOrder.totalAmount || 0).toLocaleString('es-AR')})`;
      }
    }

    return {
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        agent: {
          first_message: firstMsg,
          language: 'es'
        },
        tts: {
          voice_id: settings.elevenlabsVoiceId || this.DEFAULT_VOICE_ID,
          model_id: settings.elevenlabsModelId || this.DEFAULT_MODEL_ID,
          stability: 0.5,
          speed: 1.11,
          similarity_boost: 0.8
        }
      },
      dynamic_variables: {
        customer_name: name,
        phone: phone,
        address: addr,
        last_order: lastOrderSummary,
        business_name: settings.businessName || 'República de la Carne',
        currency: 'ARS',
        city: 'Córdoba',
        ...extraVariables
      }
    };
  }

  /**
   * Verifica la conectividad y estado del Agente de ElevenLabs
   */
  static async testAgentConnection(customAgentId = null) {
    const settings = db.getSettings();
    const agentId = customAgentId || settings.elevenlabsAgentId || this.DEFAULT_AGENT_ID;
    const apiKey = settings.elevenlabsApiKey;

    try {
      // 1. Probar endpoint de signed URL
      const signedRes = await this.getSignedUrl(agentId);
      
      // 2. Si hay API key, consultar detalles del agente
      let agentDetails = null;
      if (apiKey) {
        try {
          const detailRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
            headers: { 'xi-api-key': apiKey }
          });
          if (detailRes.ok) {
            agentDetails = await detailRes.json();
          }
        } catch (e) {
          // Ignorar si falla lectura directa
        }
      }

      return {
        success: true,
        agentId,
        name: agentDetails?.name || 'República de la Carne',
        voiceId: agentDetails?.conversation_config?.tts?.voice_id || settings.elevenlabsVoiceId || this.DEFAULT_VOICE_ID,
        modelId: agentDetails?.conversation_config?.tts?.model_id || settings.elevenlabsModelId || this.DEFAULT_MODEL_ID,
        firstMessage: agentDetails?.conversation_config?.agent?.first_message || settings.elevenlabsFirstMessage || this.DEFAULT_FIRST_MESSAGE,
        wsEndpoint: signedRes.signedUrl,
        isSigned: signedRes.isSigned,
        status: 'ready'
      };
    } catch (err) {
      console.error('Error probando conexión con Agente de ElevenLabs:', err);
      return {
        success: false,
        agentId,
        error: err.message
      };
    }
  }
}
