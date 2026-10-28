import { db } from '../../server/services/database.js';
import { extractItemsFromHistoryAndText } from '../../server/services/ai.js';

const products = db.getProducts() || [];

const history = [
  { sender: 'user', content: 'quiero un asado para 4 personas  con 2 chorizos de cerdo y una morcilla' },
  { sender: 'bot', content: `¡Excelente elección, Don Juan! Un asadito bien completo para 4 personas, ¡de diez! 🥩🔥

Para calcular bien la ración (teniendo en cuenta unos 500g a 600g por persona), le propongo lo siguiente para que no falte nada en la parrilla:

*📋 Detalle de tu pedido (precios por kilo según corte):*

*   *Asado Surtido Premium:* 1.5 kg (para el plato fuerte) — *$17.980,50*
*   *Chorizo de Cerdo:* 2 unidades (aprox. 0.400 kg) — *$5.904*
*   *Morcilla:* 1 unidad (aprox. 0.200 kg) — *$2.100*

*Subtotal estimado:* *$25.984,50*` },
  { sender: 'user', content: 'sumame un carbon' },
  { sender: 'bot', content: `¡De una, Don Juan! Sumado entonces el carbón...

*📋 Detalle actualizado de tu pedido (precios por kilo según corte):*

*   *Asado Surtido Premium:* 1.5 kg — *$17.980,50*
*   *Chorizo de Cerdo:* 2 unidades (aprox. 0.400 kg) — *$5.904*
*   *Morcilla:* 1 unidad (aprox. 0.200 kg) — *$2.100*
*   *Carbon x 4 KG:* 1 unidad — *$3.600*

*Total estimado: $29.584,50*` },
  { sender: 'user', content: 'sumame 2 chorizos y una morccilla mas' },
  { sender: 'bot', content: `¡Excelente, Don Juan! Con esos agregados el asado va a quedar de primera, ¡va a haber para todos! 🥩🔥

*📋 Detalle actualizado de tu pedido (precios por kilo según corte):*

*   *Asado Surtido Premium:* 1.5 kg — *$17.980,50*
*   *Chorizo de Cerdo:* 4 unidades (2 iniciales + 2 sumadas, aprox. 0.800 kg) — *$11.808*
*   *Morcilla:* 2 unidades (1 inicial + 1 sumada, aprox. 0.400 kg) — *$4.200*
*   *Carbon x 4 KG:* 1 unidad — *$3.600*

*Total estimado: $37.588,50*

Y para dejar todo organizado, ¿cómo prefiere realizar el pago?
1️⃣ **Efectivo** contraentrega.
2️⃣ **Transferencia** (Alias: **republica.carne.mp**).
3️⃣ **Link de Mercado Pago**.` },
  { sender: 'user', content: 'Roque funes 1704' },
  { sender: 'bot', content: `¡Buenísimo, Don Juan! Ya tomé nota de la dirección: **Roque Funes 1704**. ¡Excelente zona, ahí en Urca!

Para cerrar el pedido y que salga para allá, solo me falta definir el medio de pago para que el equipo de despacho lo tenga claro al momento de llevarle la mercadería. ¿Cómo va a ser la cosa?

1️⃣ **Efectivo** contraentrega.
2️⃣ **Transferencia** (Alias: **republica.carne.mp**).
3️⃣ **Link de Mercado Pago**.

Confírmeme eso y ya queda todo listo, Don Juan.` }
];

console.log('--- Testing extractItemsFromHistoryAndText with user input "1" ---');
const res = extractItemsFromHistoryAndText(history, '1', products, { name: 'Don Juan' });
console.log('Items:', res.items);
console.log('Total:', res.total);
console.log('Products:', res.products.map(p => ({ name: p.name, quantity: p.quantity, subtotal: p.subtotal })));
process.exit(0);
