import { db } from './database.js';

/**
 * RapilogService - Integración con la API oficial de logística y cadetería Rapilog Argentina
 * Documentación oficial: https://rapilog.com.ar/documentacionapi/
 * Ambientes:
 *  - UAT: https://uat.rapilog.com.ar
 *  - Producción: https://rapilog.com.ar
 */
class RapilogService {
  constructor() {
    this.name = 'RapilogService';
  }

  /**
   * Obtiene la configuración activa de Rapilog desde los settings del sistema
   */
  getConfig() {
    const settings = db.getSettings() || {};
    return {
      enabled: Boolean(settings.rapilogConfig?.enabled),
      environment: settings.rapilogConfig?.environment || 'uat', // 'uat' | 'production'
      token: (settings.rapilogConfig?.token || '').trim(),
      defaultModality: settings.rapilogConfig?.defaultModality || 'OnDemandSmart', // 'OnDemandSmart' | 'Food' | 'NextDaySmart'
      originBranchId: settings.rapilogConfig?.originBranchId || 'br-1',
      autoNotifyCustomer: settings.rapilogConfig?.autoNotifyCustomer !== false,
      vehicleType: Number(settings.rapilogConfig?.vehicleType) || 1
    };
  }

  /**
   * URL base de la API según el ambiente configurado
   */
  getBaseUrl(envOverride = null) {
    const config = this.getConfig();
    const env = envOverride || config.environment;
    return env === 'production' 
      ? 'https://rapilog.com.ar' 
      : 'https://uat.rapilog.com.ar';
  }

  /**
   * Headers obligatorios para comunicarse con la API de Rapilog
   */
  getHeaders(tokenOverride = null) {
    const config = this.getConfig();
    const token = tokenOverride || config.token;
    return {
      'Content-Type': 'application/json',
      'Token': token,
      'User-Agent': 'WAgent-RepublicaDeLaCarne/1.0'
    };
  }

  /**
   * Valida la conectividad y la autenticidad del Token consultando un recurso de lectura
   */
  async testConnection({ token = null, environment = null } = {}) {
    const config = this.getConfig();
    const activeToken = (token || config.token || '').trim();
    const activeEnv = environment || config.environment;

    if (!activeToken) {
      return {
        success: false,
        error: 'No se ha proporcionado un Token de autenticación de Rapilog.'
      };
    }

    const baseUrl = this.getBaseUrl(activeEnv);

    try {
      // Consultamos el catálogo de estados o vehículos para validar el token
      const res = await fetch(`${baseUrl}/v1/LastMile/Estados`, {
        method: 'GET',
        headers: this.getHeaders(activeToken)
      });

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Token de Rapilog no autorizado en ambiente ${activeEnv.toUpperCase()} (HTTP ${res.status}). Verifica tus credenciales.`
        };
      }

      if (!res.ok) {
        let errDetail = '';
        try {
          const errJson = await res.json();
          errDetail = errJson.Message || errJson.error || JSON.stringify(errJson);
        } catch {
          errDetail = res.statusText;
        }
        return {
          success: false,
          error: `Rapilog devolvió código HTTP ${res.status}: ${errDetail}`
        };
      }

      const estados = await res.json();
      return {
        success: true,
        message: `¡Conexión exitosa con Rapilog Argentina (${activeEnv.toUpperCase()})! Token autenticado correctamente.`,
        environment: activeEnv,
        estadosDisponibles: Array.isArray(estados) ? estados.length : null
      };
    } catch (err) {
      console.error('[RapilogService] Error probando conexión:', err);
      return {
        success: false,
        error: `Error de red al conectar con Rapilog (${baseUrl}): ${err.message}`
      };
    }
  }

  /**
   * Cotiza un viaje bajo demanda (OnDemandSmart / Food)
   * @param {Object} params
   * @param {Object} params.originCoords { lat, lng }
   * @param {Object} params.destinationCoords { lat, lng }
   * @param {string} [params.modality] 'OnDemandSmart' | 'Food'
   */
  async cotizar({ originCoords, destinationCoords, modality = null } = {}) {
    const config = this.getConfig();
    if (!config.token) {
      throw new Error('Rapilog no está configurado con un Token válido.');
    }

    if (!originCoords?.lat || !originCoords?.lng || !destinationCoords?.lat || !destinationCoords?.lng) {
      throw new Error('Coordenadas de origen y destino requeridas para cotizar con Rapilog.');
    }

    const baseUrl = this.getBaseUrl();
    const activeModality = modality || config.defaultModality;

    const payload = {
      LatitudOrigen: Number(originCoords.lat),
      LongitudOrigen: Number(originCoords.lng),
      LatitudDestino: Number(destinationCoords.lat),
      LongitudDestino: Number(destinationCoords.lng)
    };

    const endpoint = activeModality === 'Food'
      ? `${baseUrl}/v1/OnDemandSmart/Cotizar` // Food comparte cotización OnDemand
      : `${baseUrl}/v1/OnDemandSmart/Cotizar`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data.Message || data.error || 'No se pudo cotizar el viaje en Rapilog.';
      throw new Error(errMsg);
    }

    const precio = typeof data.Precio === 'number' ? data.Precio : parseFloat(data.Precio || 0);

    return {
      success: true,
      precio,
      precioFormateado: `$ ${precio.toLocaleString('es-AR')}`,
      vigenciaMinutos: 3,
      origen: originCoords,
      destino: destinationCoords,
      modality: activeModality
    };
  }

  /**
   * Despacha un pedido creando el viaje en Rapilog
   * @param {Object} params
   * @param {Object} params.order Pedido de WAgent
   * @param {Object} [params.branch] Sucursal de origen
   * @param {string} [params.modality] Modalidad
   * @param {string} [params.observation] Indicaciones para el cadete
   */
  async crearPedidoEnvio({ order, branch = null, modality = null, observation = '' } = {}) {
    const config = this.getConfig();
    if (!config.token) {
      throw new Error('Rapilog no cuenta con un Token configurado en el sistema.');
    }

    if (!order) {
      throw new Error('Se requiere un objeto de pedido válido.');
    }

    const baseUrl = this.getBaseUrl();
    const activeModality = modality || config.defaultModality;

    // Resolver sucursal de origen
    const branches = db.getBranches() || [];
    const originBranch = branch || branches.find(b => b.id === (order.branchId || config.originBranchId)) || branches[0] || {
      id: 'br-1',
      name: 'República de la Carne - Sucursal Central Urca',
      address: 'Av. José Roque Funes 1115, Córdoba',
      phone: '+5493513906947',
      lat: -31.3828,
      lng: -64.2372
    };

    // Coordenadas de destino del cliente
    const destLat = Number(order.lat || order.coordinates?.lat || -31.3828);
    const destLng = Number(order.lng || order.coordinates?.lng || -64.2372);
    const destAddress = order.address || order.deliveryAddress || 'Córdoba, Argentina';
    const customerName = order.customerName || order.customer?.name || 'Cliente';
    const customerPhone = order.customerPhone || order.phone || '';
    const orderId = order.id || `ORD-${Date.now()}`;

    // Construir payload conforme a la especificación CrearPedido de Rapilog
    const payload = {
      NombreOrigen: originBranch.name || 'República de la Carne',
      DireccionOrigen: originBranch.address || 'Av. José Roque Funes 1115',
      ObservacionOrigen: 'Retirar en mostrador de carnicería. Pedido refrigerado listo.',
      BarrioOrigen: 'Urca',
      TelefonoOrigen: originBranch.phone || '+5493513906947',
      LatitudOrigen: Number(originBranch.lat),
      LongitudOrigen: Number(originBranch.lng),
      CiudadOrigen: 'Córdoba',
      CPOrigen: '5009',

      NombreDestino: customerName,
      DireccionDestino: destAddress,
      ObservacionDestino: observation || order.notes || 'Entregar en mano al cliente. Carne fresca.',
      BarrioDestino: order.neighborhood || 'Córdoba',
      TelefonoDestino: customerPhone,
      LatitudDestino: destLat,
      LongitudDestino: destLng,
      CiudadDestino: 'Córdoba',
      CPDestino: '5000',

      ReferenciaExterna: String(orderId),
      Paquetes: [
        {
          Largo: 25,
          Ancho: 20,
          Alto: 15,
          Peso: Math.max(1, Math.round(Number(order.totalWeightKg) || 2)),
          Cantidad: 1,
          ReferenciaExterna: `BULTO-${orderId}`
        }
      ]
    };

    // Endpoint según modalidad
    let endpoint = `${baseUrl}/v1/OnDemandSmart/Post`;
    if (activeModality === 'Food') {
      endpoint = `${baseUrl}/v1/Food/Post`;
    } else if (activeModality === 'NextDaySmart') {
      endpoint = `${baseUrl}/v1/NextDaySmart/Post`;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data.Message || data.error || `Error creando viaje en Rapilog (HTTP ${res.status})`;
      throw new Error(errMsg);
    }

    // Estructurar información de despacho
    const shipmentInfo = {
      idPedidoRapilog: data.IdPedido,
      trackingId: data.TrackingId || String(data.IdPedido),
      trackingEncriptado: data.TrackingEncriptado || null,
      trackingLink: data.Link || `https://rapilog.com.ar/seguimientoPedido?id=${data.TrackingEncriptado || data.TrackingId}`,
      etiquetaUrl: data.Etiqueta || null,
      descargaEtiquetaUrl: data.Descarga || null,
      estado: data.Estado || 10,
      estadoNombre: 'Pedido Creado / En preparación',
      precio: data.Precio || null,
      modalidad: activeModality,
      sucursalOrigen: originBranch.name,
      fechaDespacho: new Date().toISOString()
    };

    return shipmentInfo;
  }

  /**
   * Consulta el estado de un envío en Rapilog por IdPedido o TrackingEncriptado
   */
  async consultarEnvio({ idPedido, trackingEncriptado = null, modality = null } = {}) {
    const config = this.getConfig();
    if (!config.token) {
      throw new Error('Rapilog no cuenta con un Token configurado en el sistema.');
    }

    const baseUrl = this.getBaseUrl();
    const activeModality = modality || config.defaultModality;

    const queryParams = new URLSearchParams();
    if (idPedido) queryParams.append('IdPedido', idPedido);
    if (trackingEncriptado) queryParams.append('TrackingEncriptado', trackingEncriptado);

    let endpoint = `${baseUrl}/v1/OnDemandSmart/GetQuery?${queryParams.toString()}`;
    if (activeModality === 'NextDaySmart') {
      endpoint = `${baseUrl}/v1/NextDaySmart/GetQuery?${queryParams.toString()}`;
    }

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: this.getHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data.Message || data.error || 'Error consultando estado en Rapilog.';
      throw new Error(errMsg);
    }

    return {
      success: true,
      data: data.Unico || data
    };
  }

  /**
   * Cancela un envío registrado en Rapilog
   */
  async cancelarEnvio({ idPedido, modality = null } = {}) {
    const config = this.getConfig();
    if (!config.token) {
      throw new Error('Rapilog no cuenta con un Token configurado.');
    }

    if (!idPedido) {
      throw new Error('IdPedido de Rapilog requerido para cancelar.');
    }

    const baseUrl = this.getBaseUrl();
    const activeModality = modality || config.defaultModality;

    let endpoint = `${baseUrl}/v1/OnDemandSmart/Cancel`;
    if (activeModality === 'NextDaySmart') {
      endpoint = `${baseUrl}/v1/NextDaySmart/Cancel`;
    }

    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ IdPedido: Number(idPedido) })
    });

    if (!res.ok) {
      let errMsg = 'No se pudo cancelar el pedido en Rapilog.';
      try {
        const d = await res.json();
        errMsg = d.Message || d.error || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    return {
      success: true,
      idPedido,
      message: `Envío #${idPedido} cancelado correctamente en Rapilog.`
    };
  }
}

export const rapilogService = new RapilogService();
export default rapilogService;
