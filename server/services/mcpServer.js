import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { mcpToolsService } from './mcpToolsService.js';

export function createMcpServerInstance() {
  const server = new Server(
    {
      name: 'wagent-carniceria-mcp',
      version: '1.3.3'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Listado de herramientas MCP
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'wagent_get_system_summary',
          description: 'Obtiene un resumen en tiempo real del estado de WAgent Carnicería (sucursales, total productos, pedidos del día, pedidos pendientes, alertas de stock).',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'wagent_get_products',
          description: 'Consulta y filtra el catálogo de productos y cortes de carne (nombre, categoría, precio por kilo, PLU de balanza, disponibilidad).',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Término de búsqueda por nombre, corte o PLU' },
              category: { type: 'string', description: 'Categoría (ej: Carne Vacuna, Porcino, Pollo, Achuras)' },
              minPrice: { type: 'number', description: 'Precio mínimo por kg' },
              maxPrice: { type: 'number', description: 'Precio máximo por kg' },
              limit: { type: 'number', description: 'Límite de resultados (por defecto 100)' }
            }
          }
        },
        {
          name: 'wagent_get_stock',
          description: 'Consulta los niveles de stock en kilogramos de las cámaras frigoríficas por sucursal y detecta alertas de stock mínimo.',
          inputSchema: {
            type: 'object',
            properties: {
              branchId: { type: 'string', description: 'ID de la sucursal (ej: br-1, br-central)' },
              productId: { type: 'string', description: 'ID de un producto específico' },
              lowStockOnly: { type: 'boolean', description: 'Si es true, solo retorna cortes con stock por debajo del mínimo' }
            }
          }
        },
        {
          name: 'wagent_get_orders',
          description: 'Consulta el listado de pedidos de clientes en la carnicería.',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', description: 'Estado: pending, confirmed, preparing, delivered, cancelled' },
              phone: { type: 'string', description: 'Teléfono o WhatsApp del cliente' },
              date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
              branchId: { type: 'string', description: 'ID de la sucursal asignada' },
              limit: { type: 'number', description: 'Límite de resultados' }
            }
          }
        },
        {
          name: 'wagent_get_order_details',
          description: 'Obtiene los detalles completos de un pedido específico por ID o número de secuencia.',
          inputSchema: {
            type: 'object',
            properties: {
              orderId: { type: 'string', description: 'ID o número de comprobante del pedido' }
            },
            required: ['orderId']
          }
        },
        {
          name: 'wagent_create_order',
          description: 'Crea un nuevo pedido de carnicería en el CRM.',
          inputSchema: {
            type: 'object',
            properties: {
              customerName: { type: 'string', description: 'Nombre completo del cliente' },
              phone: { type: 'string', description: 'Teléfono o celular de contacto' },
              deliveryType: { type: 'string', description: 'delivery o pickup', enum: ['delivery', 'pickup'] },
              address: { type: 'string', description: 'Dirección de entrega (si deliveryType es delivery)' },
              branchId: { type: 'string', description: 'Sucursal de retiro o despacho' },
              paymentMethod: { type: 'string', description: 'Efectivo, Transferencia o Mercado Pago' },
              items: {
                type: 'array',
                description: 'Lista de cortes/productos con cantidad y precio',
                items: {
                  type: 'object',
                  properties: {
                    description: { type: 'string' },
                    quantity: { type: 'number' },
                    unitPrice: { type: 'number' },
                    unit: { type: 'string' }
                  },
                  required: ['description', 'quantity']
                }
              },
              notes: { type: 'string', description: 'Observaciones para el pedido o corte' }
            },
            required: ['customerName', 'phone', 'items']
          }
        },
        {
          name: 'wagent_get_users',
          description: 'Consulta clientes registrados, teléfonos, direcciones, puntos de fidelización y frecuencia de compra.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Búsqueda por nombre o teléfono' },
              limit: { type: 'number', description: 'Límite de resultados' }
            }
          }
        },
        {
          name: 'wagent_get_branches',
          description: 'Lista todas las sucursales físicas y depósitos de la carnicería.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'wagent_get_transfers',
          description: 'Consulta los remitos y traspasos de mercadería entre sucursales.',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', description: 'in_transit, received, cancelled' },
              fromBranchId: { type: 'string', description: 'ID de sucursal emisora' },
              toBranchId: { type: 'string', description: 'ID de sucursal receptora' }
            }
          }
        },
        {
          name: 'wagent_get_suppliers_and_invoices',
          description: 'Consulta los proveedores frigoríficos y el historial de facturas/remitos escaneados con TicketScan.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    };
  });

  // Ejecutor de herramientas MCP
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      let result;
      switch (name) {
        case 'wagent_get_system_summary':
          result = await mcpToolsService.getSystemSummary();
          break;

        case 'wagent_get_products':
          result = await mcpToolsService.getProducts(args);
          break;

        case 'wagent_get_stock':
          result = await mcpToolsService.getStock(args);
          break;

        case 'wagent_get_orders':
          result = await mcpToolsService.getOrders(args);
          break;

        case 'wagent_get_order_details':
          result = await mcpToolsService.getOrderDetails(args.orderId);
          if (!result) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Pedido "${args.orderId}" no encontrado.` }]
            };
          }
          break;

        case 'wagent_create_order':
          result = await mcpToolsService.createOrder(args);
          break;

        case 'wagent_get_users':
          result = await mcpToolsService.getUsers(args);
          break;

        case 'wagent_get_branches':
          result = await mcpToolsService.getBranches();
          break;

        case 'wagent_get_transfers':
          result = await mcpToolsService.getTransfers(args);
          break;

        case 'wagent_get_suppliers_and_invoices':
          result = await mcpToolsService.getSuppliersAndInvoices();
          break;

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Herramienta MCP desconocida: ${name}` }]
          };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error ejecutando ${name}: ${err.message}`
          }
        ]
      };
    }
  });

  return server;
}
