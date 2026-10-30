import { OrderSyncEngine } from '../../server/services/orderSyncEngine.js';
import { db } from '../../server/services/database.js';

const quote = `¡Excelente, Don Juan! Con esos agregados el asado va a quedar de primera, ¡va a haber para todos! 🥩🔥

Le cuento que con estos nuevos ítems ya superamos el monto mínimo, así que el envío a domicilio está confirmado. Aquí tiene el detalle consolidado de su pedido:

*📋 Detalle actualizado de tu pedido (precios por kilo según corte):*

*   *Asado Surtido Premium:* 1.5 kg — *$17.980,50*
*   *Chorizo de Cerdo:* 4 unidades (2 iniciales + 2 sumadas, aprox. 0.800 kg) — *$11.808*
*   *Morcilla:* 2 unidades (1 inicial + 1 sumada, aprox. 0.400 kg) — *$4.200*
*   *Carbon x 4 KG:* 1 unidad — *$3.600*

*Total estimado: $37.588,50*

¡Ya estamos listos! Para coordinar el envío, por favor páseme su *dirección completa (Calle y número/altura, y barrio)*. 

Y para dejar todo organizado, ¿cómo prefiere realizar el pago?
1️⃣ *Efectivo* contraentrega.
2️⃣ *Transferencia* (Alias: *republica.carne.mp*).
3️⃣ *Link de Mercado Pago*.

¡Quedo a la espera de sus datos para que salga el pedido para su casa! 🍖🚚

(Nota: Los precios de los cortes son por kilo. El total informado es estimado y puede tener una leve variación según el pesaje exacto final en balanza).`;

const catalog = db.getProducts() || [];
const res = OrderSyncEngine.extractItemsFromAgentReply(quote, catalog);
console.log('Items extracted count:', res.items.length);
console.log('Total extracted:', res.total);
console.log('Items:', res.items);
console.log('Products:', res.products.map(p => ({ name: p.name, qty: p.quantity, subtotal: p.subtotal, unit: p.unit, unitPrice: p.unitPrice, isUnitMode: p.isUnitMode, unitCount: p.unitCount })));
