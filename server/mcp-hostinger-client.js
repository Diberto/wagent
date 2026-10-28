#!/usr/bin/env node
/**
 * MCP Server Stdio Bridge para Hostinger WAgent Production
 * Conecta cualquier cliente MCP local (Antigravity, Cursor, Claude) con el despliegue en vivo en Hostinger.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const HOSTINGER_URL = process.env.HOSTINGER_URL || 'https://bot.republicadelacarne.com';
const API_KEY = process.env.HOSTINGER_API_KEY || 'wagent_live_c609bbf9bc07482254815e8759db73c922db145d17d4c2b7';

async function hostingerFetch(endpoint, options = {}) {
  const url = `${HOSTINGER_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Hostinger API error [${res.status}]: ${errorText || res.statusText}`);
  }
  return res.json();
}

export function createHostingerMcpServer() {
  const server = new Server(
    {
      name: 'wagent-hostinger-production',
      version: '1.3.3'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'hostinger_wagent_get_system_summary',
          description: 'Obtiene el resumen operativo en tiempo real del despliegue en Hostinger (sucursales, total productos, pedidos del día, métricas).',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'hostinger_wagent_get_products',
          description: 'Consulta y filtra el catálogo de cortes y productos en el servidor Hostinger en producción.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Término de búsqueda por nombre o PLU' },
              category: { type: 'string', description: 'Categoría (Carne Vacuna, Pollo, Porcino, etc.)' },
              minPrice: { type: 'number', description: 'Precio mínimo' },
              maxPrice: { type: 'number', description: 'Precio máximo' },
              limit: { type: 'number', description: 'Cantidad máxima de resultados (default 50)' }
            }
          }
        },
        {
          name: 'hostinger_wagent_get_stock',
          description: 'Consulta los niveles de stock en cámaras frigoríficas por sucursal en Hostinger.',
          inputSchema: {
            type: 'object',
            properties: {
              branchId: { type: 'string', description: 'ID de la sucursal (ej: br-1)' },
              productId: { type: 'string', description: 'ID de producto específico' },
              lowStockOnly: { type: 'boolean', description: 'Filtrar solo alertas de stock bajo' }
            }
          }
        },
        {
          name: 'hostinger_wagent_get_orders',
          description: 'Consulta el listado de pedidos registrados en el CRM de Hostinger.',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', description: 'pending, confirmed, preparing, delivered, cancelled' },
              phone: { type: 'string', description: 'Teléfono del cliente' },
              date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
              branchId: { type: 'string', description: 'ID de sucursal' },
              limit: { type: 'number', description: 'Límite de pedidos' }
            }
          }
        },
        {
          name: 'hostinger_wagent_get_order_details',
          description: 'Obtiene el detalle completo de un pedido en Hostinger por su ID.',
          inputSchema: {
            type: 'object',
            properties: {
              orderId: { type: 'string', description: 'ID o comprobante del pedido' }
            },
            required: ['orderId']
          }
        },
        {
          name: 'hostinger_wagent_create_order',
          description: 'Crea un nuevo pedido de carnicería en el servidor Hostinger en producción.',
          inputSchema: {
            type: 'object',
            properties: {
              customerName: { type: 'string', description: 'Nombre del cliente' },
              phone: { type: 'string', description: 'Teléfono o WhatsApp' },
              deliveryType: { type: 'string', enum: ['delivery', 'pickup'] },
              address: { type: 'string', description: 'Dirección de envío si es delivery' },
              branchId: { type: 'string', description: 'Sucursal de despacho' },
              paymentMethod: { type: 'string', description: 'Efectivo, Transferencia, Mercado Pago' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    description: { type: 'string' },
                    quantity: { type: 'number' },
                    unitPrice: { type: 'number' }
                  },
                  required: ['description', 'quantity', 'unitPrice']
                }
              },
              notes: { type: 'string', description: 'Notas adicionales del pedido' }
            },
            required: ['customerName', 'phone', 'deliveryType', 'items']
          }
        },
        {
          name: 'hostinger_wagent_trigger_deploy',
          description: 'Dispara el webhook de auto-actualización en el servidor Hostinger para compilar y sincronizar con GitHub.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case 'hostinger_wagent_get_system_summary': {
          const data = await hostingerFetch('/api/v1/external/summary');
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
          };
        }

        case 'hostinger_wagent_get_products': {
          const params = new URLSearchParams();
          if (args.query) params.append('query', args.query);
          if (args.category) params.append('category', args.category);
          if (args.minPrice) params.append('minPrice', String(args.minPrice));
          if (args.maxPrice) params.append('maxPrice', String(args.maxPrice));
          if (args.limit) params.append('limit', String(args.limit));

          const data = await hostingerFetch(`/api/v1/external/products?${params.toString()}`);
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
          };
        }

        case 'hostinger_wagent_get_stock': {
          const params = new URLSearchParams();
          if (args.branchId) params.append('branchId', args.branchId);
          if (args.productId) params.append('productId', args.productId);
          if (args.lowStockOnly) params.append('lowStockOnly', 'true');

          const data = await hostingerFetch(`/api/v1/external/stock?${params.toString()}`);
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
          };
        }

        case 'hostinger_wagent_get_orders': {
          const params = new URLSearchParams();
          if (args.status) params.append('status', args.status);
          if (args.phone) params.append('phone', args.phone);
          if (args.date) params.append('date', args.date);
          if (args.branchId) params.append('branchId', args.branchId);
          if (args.limit) params.append('limit', String(args.limit));

          const data = await hostingerFetch(`/api/v1/external/orders?${params.toString()}`);
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
          };
        }

        case 'hostinger_wagent_get_order_details': {
          const data = await hostingerFetch(`/api/v1/external/orders/${encodeURIComponent(args.orderId)}`);
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
          };
        }

        case 'hostinger_wagent_create_order': {
          const data = await hostingerFetch('/api/v1/external/orders', {
            method: 'POST',
            body: JSON.stringify(args)
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
          };
        }

        case 'hostinger_wagent_trigger_deploy': {
          const data = await hostingerFetch('/api/system/webhook-deploy', {
            method: 'POST',
            body: JSON.stringify({ timestamp: new Date().toISOString(), source: 'mcp-hostinger-bridge' })
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
          };
        }

        default:
          throw new Error(`Herramienta no implementada: ${name}`);
      }
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `❌ Error en ${name}: ${err.message}` }]
      };
    }
  });

  return server;
}

// Ejecución Stdio directa
if (process.argv[1] && process.argv[1].endsWith('mcp-hostinger-client.js')) {
  async function run() {
    const server = createHostingerMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🚀 [WAgent Hostinger MCP] Bridge Stdio conectado a https://bot.republicadelacarne.com');
  }

  run().catch((err) => {
    console.error('❌ Error fatal en Hostinger MCP Bridge:', err);
    process.exit(1);
  });
}
