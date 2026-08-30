import WooCommerceRestApiPackage from '@woocommerce/woocommerce-rest-api';
import { db } from './database.js';

// Manejar importación CJS/ESM
const WooCommerceRestApi = WooCommerceRestApiPackage.default || WooCommerceRestApiPackage;

class WooCommerceService {
  constructor() {
    this.client = null;
    this.io = null;
  }

  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Obtiene o instancia el cliente de WooCommerce según la configuración actual
   */
  getClient(customConfig = null) {
    const settings = customConfig || db.getSettings();
    const url = (settings.wooUrl || '').trim();
    const consumerKey = (settings.wooConsumerKey || '').trim();
    const consumerSecret = (settings.wooConsumerSecret || '').trim();

    if (!url || !consumerKey || !consumerSecret) {
      return null;
    }

    try {
      return new WooCommerceRestApi({
        url: url.replace(/\/$/, ''),
        consumerKey,
        consumerSecret,
        version: 'wc/v3',
        queryStringAuth: url.startsWith('http://') // Habilitar query string auth si no es HTTPS
      });
    } catch (err) {
      console.error('Error instanciando WooCommerce Client:', err.message);
      return null;
    }
  }

  /**
   * Prueba la conexión a la tienda WordPress / WooCommerce
   */
  async testConnection(customConfig = null) {
    const client = this.getClient(customConfig);
    if (!client) {
      return {
        success: false,
        error: 'Faltan credenciales: asegúrate de ingresar URL, Consumer Key y Consumer Secret de WooCommerce.'
      };
    }

    try {
      // Intentar obtener el estado o al menos 1 producto
      const response = await client.get('products', { per_page: 1 });
      
      const success = response.status >= 200 && response.status < 300;
      const count = response.headers?.['x-wp-total'] ? parseInt(response.headers['x-wp-total'], 10) : (response.data?.length || 0);

      db.addWooCommerceLog({
        type: 'test_connection',
        status: success ? 'success' : 'error',
        details: success ? `Conexión exitosa con WordPress. Total productos en tienda: ${count}` : `Error HTTP ${response.status}`,
        count
      });

      return {
        success: true,
        message: '¡Conexión exitosa con WooCommerce!',
        totalProducts: count,
        url: customConfig?.wooUrl || db.getSettings().wooUrl
      };
    } catch (err) {
      console.error('Error al probar conexión con WooCommerce:', err.message);
      
      const errorMessage = err.response?.data?.message || err.message || 'No se pudo conectar con WordPress / WooCommerce';
      
      db.addWooCommerceLog({
        type: 'test_connection',
        status: 'error',
        details: `Fallo de conexión: ${errorMessage}`
      });

      return {
        success: false,
        error: errorMessage,
        statusCode: err.response?.status
      };
    }
  }

  /**
   * Sincroniza y descarga todos los productos de WooCommerce hacia el catálogo local de WAgent
   */
  async syncProducts() {
    const client = this.getClient();
    if (!client) {
      throw new Error('WooCommerce no está configurado. Por favor ingresa las credenciales en Ajustes de Integraciones.');
    }

    try {
      console.log('🔄 Iniciando sincronización de productos desde WooCommerce...');
      let page = 1;
      let allProducts = [];
      let totalPages = 1;

      // Traer productos paginados
      while (page <= totalPages && page <= 10) {
        const res = await client.get('products', {
          per_page: 100,
          page,
          status: 'publish'
        });

        if (res.data && Array.isArray(res.data)) {
          allProducts = allProducts.concat(res.data);
        }

        if (res.headers && res.headers['x-wp-totalpages']) {
          totalPages = parseInt(res.headers['x-wp-totalpages'], 10);
        } else {
          break;
        }
        page++;
      }

      console.log(`📦 Se obtuvieron ${allProducts.length} productos de WooCommerce.`);

      // Mapear al formato interno de productos de WAgent
      const mappedProducts = allProducts.map(wp => {
        const price = parseFloat(wp.sale_price || wp.regular_price || wp.price || 0);
        const categories = (wp.categories || []).map(c => c.name).join(', ');
        const image = wp.images && wp.images[0] ? wp.images[0].src : '';
        const inStock = wp.stock_status === 'instock';
        const stockQty = wp.stock_quantity !== null ? wp.stock_quantity : (inStock ? 99 : 0);

        return {
          id: `woo-${wp.id}`,
          wooId: wp.id,
          name: wp.name || 'Producto sin nombre',
          sku: wp.sku || `WOO-${wp.id}`,
          barcode: wp.sku || String(wp.id),
          category: categories || 'General',
          price: isNaN(price) ? 0 : price,
          unit: 'unidad',
          stock: stockQty,
          minStock: 5,
          inStock,
          image,
          description: wp.short_description ? wp.short_description.replace(/<[^>]*>?/gm, '').trim() : (wp.description ? wp.description.replace(/<[^>]*>?/gm, '').slice(0, 120) : ''),
          permalink: wp.permalink || '',
          source: 'woocommerce',
          syncedAt: new Date().toISOString()
        };
      });

      // Guardar en la base de datos de WAgent
      const syncedCount = db.upsertProductsFromWooCommerce(mappedProducts);

      // Actualizar timestamp de última sincronización
      db.updateSettings({
        wooLastSync: new Date().toISOString(),
        wooTotalSyncedProducts: mappedProducts.length
      });

      // Registrar en el log de auditoría
      db.addWooCommerceLog({
        type: 'pull_products',
        status: 'success',
        details: `Sincronizados ${syncedCount} productos correctamente desde la tienda.`,
        count: syncedCount
      });

      if (this.io) {
        this.io.emit('woo:synced', {
          count: syncedCount,
          timestamp: new Date().toISOString()
        });
        this.io.emit('products:updated', db.getProducts());
      }

      return {
        success: true,
        count: syncedCount,
        products: mappedProducts
      };
    } catch (err) {
      console.error('Error sincronizando productos de WooCommerce:', err);
      const errorMessage = err.response?.data?.message || err.message;
      
      db.addWooCommerceLog({
        type: 'pull_products',
        status: 'error',
        details: `Error al sincronizar productos: ${errorMessage}`
      });

      throw new Error(`Error en sincronización WooCommerce: ${errorMessage}`);
    }
  }

  /**
   * Exporta / Envía un pedido generado en WAgent a WooCommerce
   */
  async pushOrder(orderId) {
    const client = this.getClient();
    if (!client) {
      throw new Error('WooCommerce no está configurado');
    }

    const order = db.getOrder(orderId);
    if (!order) {
      throw new Error(`Pedido ${orderId} no encontrado`);
    }

    try {
      // Parsear nombres
      const nameParts = (order.customerName || 'Cliente').split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || 'WhatsApp';

      // Líneas de producto
      const lineItems = [];
      const products = db.getProducts();

      // Si los items son cadenas tipo "• 1x Combo Asadazo ($39.999)"
      if (Array.isArray(order.items)) {
        for (const itemStr of order.items) {
          const matchedProd = products.find(p => itemStr.toLowerCase().includes((p.name || '').toLowerCase()) && p.wooId);
          if (matchedProd && matchedProd.wooId) {
            lineItems.push({
              product_id: matchedProd.wooId,
              quantity: 1,
              total: String(matchedProd.price)
            });
          }
        }
      }

      // Si no se pudo asociar a productos de WooCommerce por ID, crear un item de tarifa/custom
      const feeLines = [];
      if (lineItems.length === 0) {
        feeLines.push({
          name: `Pedido WhatsApp #${order.id} (${(order.items || []).join(', ') || 'Cortes varios'})`,
          total: String(order.totalAmount || 0),
          tax_status: 'none'
        });
      }

      const wooOrderPayload = {
        payment_method: 'cod',
        payment_method_title: order.paymentMethod || 'Efectivo / Transferencia (WhatsApp WAgent)',
        set_paid: order.status === 'delivered',
        status: order.status === 'delivered' ? 'completed' : 'processing',
        billing: {
          first_name: firstName,
          last_name: lastName,
          address_1: order.address || 'Entrega a convenir',
          phone: order.phone || '',
          email: `${(order.phone || 'cliente').replace(/\D/g, '')}@wagent.local`
        },
        shipping: {
          first_name: firstName,
          last_name: lastName,
          address_1: order.address || 'Entrega a convenir'
        },
        line_items: lineItems,
        fee_lines: feeLines,
        customer_note: `Pedido generado desde WAgent CRM WhatsApp. ID: ${order.id}. Notas: ${order.notes || 'Ninguna'}`
      };

      const res = await client.post('orders', wooOrderPayload);
      const createdWooOrder = res.data;

      // Actualizar el pedido en WAgent con el ID de WooCommerce
      db.updateOrderWooCommerce(order.id, {
        wooOrderId: createdWooOrder.id,
        wooOrderNumber: createdWooOrder.number,
        wooOrderUrl: createdWooOrder._links?.self?.[0]?.href || '',
        wooExportedAt: new Date().toISOString()
      });

      db.addWooCommerceLog({
        type: 'push_order',
        status: 'success',
        details: `Pedido ${order.id} exportado con éxito a WooCommerce como Orden #${createdWooOrder.id}.`,
        orderId: order.id,
        wooOrderId: createdWooOrder.id
      });

      return {
        success: true,
        wooOrderId: createdWooOrder.id,
        wooOrderNumber: createdWooOrder.number
      };
    } catch (err) {
      console.error('Error exportando pedido a WooCommerce:', err);
      const errorMessage = err.response?.data?.message || err.message;
      
      db.addWooCommerceLog({
        type: 'push_order',
        status: 'error',
        details: `Error al exportar pedido ${orderId}: ${errorMessage}`,
        orderId
      });

      throw new Error(`Fallo al exportar orden a WooCommerce: ${errorMessage}`);
    }
  }

  /**
   * Procesa webhooks entrantes de WooCommerce (pedidos creados, actualizados, productos modificados)
   */
  async handleWebhook(topic, payload) {
    console.log(`📡 Webhook recibido de WooCommerce [Topic: ${topic}]`);

    db.addWooCommerceLog({
      type: 'webhook',
      status: 'success',
      details: `Webhook recibido [${topic}]: ID ${payload?.id || 'N/A'}`
    });

    if (topic === 'order.created' || topic === 'order.updated') {
      const wooId = payload.id;
      const billing = payload.billing || {};
      const phone = billing.phone || '';
      const name = `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || 'Cliente Web';
      const total = parseFloat(payload.total || 0);

      // Si el cliente no existe, registrarlo como Lead
      if (phone) {
        db.createLead({
          phone,
          name,
          source: 'woocommerce',
          stage: payload.status === 'completed' ? 'closed_won' : 'proposal',
          value: total,
          notes: `Pedido WooCommerce #${payload.id} (${payload.status})`
        });
      }
    }

    if (topic === 'product.updated' || topic === 'product.created') {
      // Auto-sincronizar el producto si está habilitado
      try {
        await this.syncProducts();
      } catch (e) {
        console.error('Error en auto-sync de webhook:', e.message);
      }
    }

    if (this.io) {
      this.io.emit('woo:webhook', { topic, payload });
    }

    return { received: true };
  }
}

export const wooCommerceService = new WooCommerceService();
