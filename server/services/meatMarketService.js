import fs from 'fs';
import path from 'path';
import { db } from './database.js';
import { CONFIG } from '../config/index.js';

const MARKET_DATA_FILE = path.join(CONFIG.DATA_DIR || './data', 'meat_market_data.json');

class MeatMarketService {
  constructor() {
    this.cache = {
      macro: null,
      macroTimestamp: 0,
      mag: null,
      magTimestamp: 0,
      retail: null,
      retailTimestamp: 0,
      fob: null,
      fobTimestamp: 0
    };
    this.io = null;
    this.init();
  }

  setIo(io) {
    this.io = io;
  }

  emit(event, data) {
    if (this.io && typeof this.io.emit === 'function') {
      try {
        this.io.emit(event, data);
      } catch (e) {
        console.warn('[MeatMarketService] Socket emit error:', e.message);
      }
    }
  }

  init() {
    try {
      if (!fs.existsSync(CONFIG.DATA_DIR || './data')) {
        fs.mkdirSync(CONFIG.DATA_DIR || './data', { recursive: true });
      }

      if (!fs.existsSync(MARKET_DATA_FILE)) {
        const initialData = this.getDefaultMarketData();
        fs.writeFileSync(MARKET_DATA_FILE, JSON.stringify(initialData, null, 2), 'utf8');
      }
    } catch (e) {
      console.error('[MeatMarketService] Error init:', e.message);
    }
  }

  getDefaultMarketData() {
    return {
      lastUpdated: new Date().toISOString(),
      livestockMarket: {
        marketName: 'Mercado Agroganadero de Cañuelas (MAG)',
        date: new Date().toISOString().slice(0, 10),
        inmagIndex: 2345.50, // Índice Novillo Arrendamiento
        inmagChangePct: 1.85,
        totalHeadsEntered: 9420,
        averagePriceGeneral: 2280.00,
        categories: [
          { category: 'Novillitos Especiales (350-390 kg)', min: 2400, avg: 2520, max: 2600, trend: 'up', changePct: 2.1 },
          { category: 'Novillitos Medianos (390-430 kg)', min: 2350, avg: 2470, max: 2540, trend: 'up', changePct: 1.8 },
          { category: 'Novillos Pesados (430-460 kg)', min: 2250, avg: 2380, max: 2450, trend: 'stable', changePct: 0.4 },
          { category: 'Vaquillonas Especiales (350-390 kg)', min: 2300, avg: 2420, max: 2500, trend: 'up', changePct: 1.5 },
          { category: 'Terneros Livianos / Consumo', min: 2500, avg: 2640, max: 2750, trend: 'up', changePct: 2.4 },
          { category: 'Vacas Buenas / Conserva', min: 1550, avg: 1720, max: 1880, trend: 'down', changePct: -0.8 },
          { category: 'Toros', min: 1600, avg: 1780, max: 1920, trend: 'stable', changePct: 0.1 }
        ],
        carcassConversionFactor: 0.575, // Rinde promedio faena (57.5%)
        freightSlaughterCostPerKg: 180.00 // Flete y costo faena estimado por kg gancho
      },
      retailBenchmark: {
        source: 'Precios Claros / Relevamiento Supermercados Argentina',
        updatedAt: new Date().toISOString(),
        referenceCuts: [
          { name: 'Asado de Tira', category: 'Carne Vacuna', benchmarkAvg: 8990, supermarketMin: 8290, supermarketMax: 9990, supermarketSample: 'Coto / Carrefour / Disco' },
          { name: 'Vacío', category: 'Carne Vacuna', benchmarkAvg: 10450, supermarketMin: 9690, supermarketMax: 11500, supermarketSample: 'Coto / Jumbo' },
          { name: 'Matambre Vacuno', category: 'Carne Vacuna', benchmarkAvg: 9800, supermarketMin: 9200, supermarketMax: 10900, supermarketSample: 'Carrefour / Disco' },
          { name: 'Nalga para Milanesas', category: 'Carne Vacuna', benchmarkAvg: 9600, supermarketMin: 8990, supermarketMax: 10800, supermarketSample: 'Coto / Día%' },
          { name: 'Bola de Lomo', category: 'Carne Vacuna', benchmarkAvg: 9250, supermarketMin: 8690, supermarketMax: 9990, supermarketSample: 'Disco / Carrefour' },
          { name: 'Cuadril', category: 'Carne Vacuna', benchmarkAvg: 10200, supermarketMin: 9400, supermarketMax: 11200, supermarketSample: 'Jumbo / Coto' },
          { name: 'Lomo', category: 'Carne Vacuna', benchmarkAvg: 13500, supermarketMin: 12200, supermarketMax: 14900, supermarketSample: 'Jumbo / Disco' },
          { name: 'Bife de Chorizo', category: 'Carne Vacuna', benchmarkAvg: 11200, supermarketMin: 10500, supermarketMax: 12500, supermarketSample: 'Coto / Jumbo' },
          { name: 'Picada Especial', category: 'Carne Vacuna', benchmarkAvg: 6990, supermarketMin: 6490, supermarketMax: 7600, supermarketSample: 'Coto / Carrefour' },
          { name: 'Paleta / Roast Beef', category: 'Carne Vacuna', benchmarkAvg: 7890, supermarketMin: 7200, supermarketMax: 8600, supermarketSample: 'Día% / Coto' },
          { name: 'Peceto', category: 'Carne Vacuna', benchmarkAvg: 11800, supermarketMin: 10900, supermarketMax: 12900, supermarketSample: 'Jumbo / Carrefour' },
          { name: 'Colita de Cuadril', category: 'Carne Vacuna', benchmarkAvg: 11900, supermarketMin: 11100, supermarketMax: 13200, supermarketSample: 'Disco / Jumbo' },
          { name: 'Pechito de Cerdo', category: 'Cortes Porcinos', benchmarkAvg: 6490, supermarketMin: 5890, supermarketMax: 7100, supermarketSample: 'Coto / Día%' },
          { name: 'Bondiola de Cerdo', category: 'Cortes Porcinos', benchmarkAvg: 7990, supermarketMin: 7300, supermarketMax: 8800, supermarketSample: 'Carrefour / Disco' },
          { name: 'Pollo Entero Fresco', category: 'Pollo y Derivados', benchmarkAvg: 2890, supermarketMin: 2590, supermarketMax: 3200, supermarketSample: 'Coto / Carrefour' }
        ]
      },
      fobExportQuotes: {
        source: 'Secretaría de Agricultura, Ganadería y Pesca (MAGyP)',
        date: new Date().toISOString().slice(0, 10),
        currency: 'USD',
        unit: 'USD / Tonelada',
        quotes: [
          { cut: 'Cuota Hilton (Rueda y Lomo Deshuesado Fresco)', usdTon: 14200, destination: 'Unión Europea', trend: 'up' },
          { cut: 'Cortes Hilton Cuarto Trasero', usdTon: 12500, destination: 'Unión Europea', trend: 'stable' },
          { cut: 'Cuarto Delantero Vacuno Congelado', usdTon: 5250, destination: 'China', trend: 'up' },
          { cut: 'Vaca Entera 6 Cortes Congelada', usdTon: 4800, destination: 'China', trend: 'stable' },
          { cut: 'Trimming Vacuno 80/20 Congelado', usdTon: 4100, destination: 'Estados Unidos / Israel', trend: 'up' },
          { cut: 'Carne Kosher Enfriada (Cuarto Delantero)', usdTon: 7100, destination: 'Israel', trend: 'stable' }
        ]
      }
    };
  }

  getStoredData() {
    try {
      if (fs.existsSync(MARKET_DATA_FILE)) {
        const raw = fs.readFileSync(MARKET_DATA_FILE, 'utf8');
        return JSON.parse(raw);
      }
    } catch {}
    return this.getDefaultMarketData();
  }

  saveStoredData(data) {
    try {
      fs.writeFileSync(MARKET_DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
      this.emit('market:updated', data);
    } catch (e) {
      console.error('[MeatMarketService] Error saving stored data:', e.message);
    }
  }

  // ==========================================
  // 1. MACRO DATA EN VIVO (ArgentinaDatos API)
  // ==========================================
  async fetchLiveMacroData() {
    const now = Date.now();
    // Cache de 1 hora
    if (this.cache.macro && (now - this.cache.macroTimestamp < 1000 * 60 * 60)) {
      return this.cache.macro;
    }

    try {
      const [inflacionRes, interanualRes, dolaresRes] = await Promise.allSettled([
        fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion', { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
        fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacionInteranual', { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
        fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares', { signal: AbortSignal.timeout(5000) }).then(r => r.json())
      ]);

      const inflacionList = inflacionRes.status === 'fulfilled' && Array.isArray(inflacionRes.value) ? inflacionRes.value : [];
      const interanualList = interanualRes.status === 'fulfilled' && Array.isArray(interanualRes.value) ? interanualRes.value : [];
      const dolaresList = dolaresRes.status === 'fulfilled' && Array.isArray(dolaresRes.value) ? dolaresRes.value : [];

      const lastMonthly = inflacionList[inflacionList.length - 1] || { fecha: '2026-09-30', valor: 1.9 };
      const prevMonthly = inflacionList[inflacionList.length - 2] || { fecha: '2026-08-31', valor: 1.7 };
      const lastYearly = interanualList[interanualList.length - 1] || { fecha: '2026-09-30', valor: 33.4 };

      // Filtrar cotizaciones de dólares más recientes
      const blue = dolaresList.filter(d => d.casa === 'blue').pop() || { compra: 1380, venta: 1410 };
      const oficial = dolaresList.filter(d => d.casa === 'oficial').pop() || { compra: 1060, venta: 1100 };
      const mep = dolaresList.filter(d => d.casa === 'bolsa').pop() || { compra: 1390, venta: 1405 };

      const macroData = {
        source: 'INDEC / ArgentinaDatos API',
        lastUpdated: new Date().toISOString(),
        monthlyInflation: {
          current: Number(lastMonthly.valor) || 1.9,
          previous: Number(prevMonthly.valor) || 1.7,
          date: lastMonthly.fecha
        },
        yearlyInflation: {
          current: Number(lastYearly.valor) || 33.4,
          date: lastYearly.fecha
        },
        meatCategoryInflationEst: Number(((Number(lastMonthly.valor) || 1.9) * 1.15).toFixed(2)), // Alimentos suele traccionar ~15% sobre el nivel general
        exchangeRates: {
          blue: { compra: blue.compra || 1380, venta: blue.venta || 1410 },
          oficial: { compra: oficial.compra || 1060, venta: oficial.venta || 1100 },
          mep: { compra: mep.compra || 1390, venta: mep.venta || 1405 }
        },
        history: inflacionList.slice(-12)
      };

      this.cache.macro = macroData;
      this.cache.macroTimestamp = now;
      return macroData;
    } catch (err) {
      console.warn('[MeatMarketService] Fallback macro data:', err.message);
      return {
        source: 'INDEC (Estimación Local)',
        lastUpdated: new Date().toISOString(),
        monthlyInflation: { current: 1.9, previous: 1.7, date: '2026-09-30' },
        yearlyInflation: { current: 33.4, date: '2026-09-30' },
        meatCategoryInflationEst: 2.2,
        exchangeRates: {
          blue: { compra: 1380, venta: 1410 },
          oficial: { compra: 1060, venta: 1100 },
          mep: { compra: 1390, venta: 1405 }
        },
        history: []
      };
    }
  }

  // ==========================================
  // 2. COTIZACIONES MERCADO AGROGANADERO (MAG)
  // ==========================================
  getLivestockQuotes() {
    const stored = this.getStoredData();
    const mag = stored.livestockMarket;

    // Calcular costo estimado del kilo gancho (media res)
    // Fórmula Frigorífica: (Precio Kilo Vivo / Rinde) + Gasto de Faena y Flete
    const rinde = mag.carcassConversionFactor || 0.575;
    const flete = mag.freightSlaughterCostPerKg || 180.00;
    const novilloAvg = mag.inmagIndex || 2345.50;
    const estimatedCarcassCostPerKg = Number(((novilloAvg / rinde) + flete).toFixed(2));

    return {
      ...mag,
      estimatedCarcassCostPerKg,
      formulaExplanation: `(INMAG $${novilloAvg.toLocaleString('es-AR')} / Rinde ${(rinde * 100).toFixed(1)}%) + Flete/Faena $${flete} = $${estimatedCarcassCostPerKg.toLocaleString('es-AR')}/kg gancho`
    };
  }

  // ==========================================
  // 3. BENCHMARK MINORISTA VINCULADO AL CATÁLOGO
  // ==========================================
  getRetailBenchmark() {
    const stored = this.getStoredData();
    const referenceCuts = stored.retailBenchmark?.referenceCuts || [];
    const wagentProducts = db.getProducts ? db.getProducts() : (db.readDb().products || []);

    const benchmarkAnalysis = referenceCuts.map(ref => {
      // Buscar producto equivalente en catálogo de WAgent por coincidencia de nombre
      const found = wagentProducts.find(p => {
        const pName = (p.name || '').toLowerCase();
        const rName = ref.name.toLowerCase();
        return pName.includes(rName) || rName.includes(pName);
      });

      const wagentPrice = found ? Number(found.price || 0) : null;
      const benchmarkAvg = Number(ref.benchmarkAvg || 0);

      let priceDiffPct = null;
      let competitiveStatus = 'no_product'; // 'cheaper' | 'parity' | 'expensive' | 'no_product'

      if (wagentPrice && benchmarkAvg > 0) {
        priceDiffPct = Number((((wagentPrice - benchmarkAvg) / benchmarkAvg) * 100).toFixed(1));
        if (priceDiffPct <= -3) competitiveStatus = 'cheaper'; // Más barato que el super
        else if (priceDiffPct >= 3) competitiveStatus = 'expensive'; // Más caro
        else competitiveStatus = 'parity';
      }

      return {
        cutName: ref.name,
        category: ref.category,
        wagentProductId: found ? found.id : null,
        wagentPrice,
        benchmarkAvg,
        supermarketMin: ref.supermarketMin,
        supermarketMax: ref.supermarketMax,
        supermarketSample: ref.supermarketSample,
        priceDiffPct,
        competitiveStatus,
        suggestedPrice: Number((benchmarkAvg * 0.96).toFixed(0)) // Sugerencia: 4% abajo de súper para alta rotación
      };
    });

    // Métricas del benchmark
    const cutsWithPrice = benchmarkAnalysis.filter(b => b.wagentPrice !== null);
    const cheaperCount = cutsWithPrice.filter(b => b.competitiveStatus === 'cheaper').length;
    const parityCount = cutsWithPrice.filter(b => b.competitiveStatus === 'parity').length;
    const expensiveCount = cutsWithPrice.filter(b => b.competitiveStatus === 'expensive').length;

    const avgGapPct = cutsWithPrice.length > 0
      ? Number((cutsWithPrice.reduce((sum, b) => sum + b.priceDiffPct, 0) / cutsWithPrice.length).toFixed(1))
      : 0;

    return {
      updatedAt: stored.retailBenchmark?.updatedAt || new Date().toISOString(),
      source: stored.retailBenchmark?.source,
      totalTrackedCuts: referenceCuts.length,
      matchedInCatalog: cutsWithPrice.length,
      summary: {
        cheaperCount,
        parityCount,
        expensiveCount,
        avgGapPct, // Negativo significa que en promedio WAgent es más barato que los supermercados
        overallCompetitiveness: avgGapPct <= -2 ? 'Muy Competitivo (Líder en Precio)' : avgGapPct <= 2 ? 'Paridad de Mercado' : 'Precios Premium'
      },
      cuts: benchmarkAnalysis
    };
  }

  // ==========================================
  // 4. PRECIOS FOB EXPORTACIÓN (MAGyP)
  // ==========================================
  getFobExportQuotes() {
    const stored = this.getStoredData();
    return stored.fobExportQuotes;
  }

  // ==========================================
  // 5. CALCULADORA DE DESPOSTE Y RINDE MEDIA RES
  // ==========================================
  calculateCarcassYield({
    carcassWeightKg = 115, // Peso media res en kg
    costPerKgGancho = null, // Si es null, toma el calculado según MAG
    customYieldMap = null
  }) {
    const mag = this.getLivestockQuotes();
    const costGancho = costPerKgGancho ? Number(costPerKgGancho) : mag.estimatedCarcassCostPerKg;
    const totalCarcassCost = Number((carcassWeightKg * costGancho).toFixed(2));

    const wagentProducts = db.getProducts ? db.getProducts() : (db.readDb().products || []);

    // Desglose típico de desposte de una media res vacuna argentina (100% total)
    const defaultYieldTemplate = [
      { name: 'Asado de Tira', sharePct: 12.0, defaultPrice: 8900 },
      { name: 'Vacío', sharePct: 6.5, defaultPrice: 10400 },
      { name: 'Matambre Vacuno', sharePct: 3.5, defaultPrice: 9800 },
      { name: 'Nalga para Milanesas', sharePct: 7.5, defaultPrice: 9600 },
      { name: 'Bola de Lomo', sharePct: 5.5, defaultPrice: 9200 },
      { name: 'Cuadril', sharePct: 4.5, defaultPrice: 10200 },
      { name: 'Lomo', sharePct: 2.2, defaultPrice: 13500 },
      { name: 'Bife de Chorizo', sharePct: 5.0, defaultPrice: 11200 },
      { name: 'Peceto', sharePct: 2.5, defaultPrice: 11800 },
      { name: 'Colita de Cuadril', sharePct: 1.5, defaultPrice: 11900 },
      { name: 'Paleta', sharePct: 6.0, defaultPrice: 7900 },
      { name: 'Roast Beef', sharePct: 5.5, defaultPrice: 7800 },
      { name: 'Carnaza / Picada Especial', sharePct: 14.5, defaultPrice: 6900 },
      { name: 'Osobuco / Garrón', sharePct: 4.8, defaultPrice: 4800 },
      { name: 'Falda con Hueso', sharePct: 3.0, defaultPrice: 4200 },
      { name: 'Grasa y Descarte / Merma', sharePct: 15.0, defaultPrice: 200 } // Merma y subproductos
    ];

    const yieldList = customYieldMap || defaultYieldTemplate;

    let totalRevenue = 0;
    const cutsBreakdown = yieldList.map(item => {
      const kg = Number(((carcassWeightKg * item.sharePct) / 100).toFixed(2));
      
      // Buscar precio real vigente en WAgent
      const match = wagentProducts.find(p => p.name.toLowerCase().includes(item.name.toLowerCase()));
      const pricePerKg = match ? Number(match.price) : item.defaultPrice;
      const subtotalRevenue = Number((kg * pricePerKg).toFixed(2));
      totalRevenue += subtotalRevenue;

      // Asignación de costo ponderado por corte según precio de mercado
      return {
        cutName: item.name,
        sharePct: item.sharePct,
        weightKg: kg,
        currentWagentPricePerKg: pricePerKg,
        estimatedRevenue: subtotalRevenue,
        productId: match ? match.id : null
      };
    });

    const grossProfit = Number((totalRevenue - totalCarcassCost).toFixed(2));
    const grossMarginPct = totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(1)) : 0;
    const averageRealizedPricePerKg = carcassWeightKg > 0 ? Number((totalRevenue / carcassWeightKg).toFixed(2)) : 0;

    return {
      carcassWeightKg,
      costPerKgGancho,
      totalCarcassCost,
      totalEstimatedRevenue: Number(totalRevenue.toFixed(2)),
      grossProfit,
      grossMarginPct,
      averageRealizedPricePerKg,
      breakdown: cutsBreakdown
    };
  }

  // ==========================================
  // 6. AJUSTADOR INTELIGENTE DE PRECIOS AL CATÁLOGO
  // ==========================================
  applySmartPriceAdjustment({
    category = 'all', // 'all' | 'Carne Vacuna' | 'Cortes Porcinos' | 'Pollo y Derivados'
    adjustmentType = 'percentage', // 'percentage' | 'fixed' | 'align_to_benchmark'
    value = 0, // ej: +2.5%
    roundTo = 50, // redondear a múltiplos de 50 o 100 pesos
    appliedBy = 'Admin'
  }) {
    const database = db.readDb();
    if (!Array.isArray(database.products)) {
      throw new Error('Catálogo de productos no disponible');
    }

    const updatedCuts = [];
    database.products.forEach(prod => {
      if (category !== 'all' && (prod.category || '') !== category) {
        return;
      }

      const oldPrice = Number(prod.price || 0);
      let newPrice = oldPrice;

      if (adjustmentType === 'percentage') {
        const factor = 1 + (Number(value) / 100);
        newPrice = oldPrice * factor;
      } else if (adjustmentType === 'fixed') {
        newPrice = oldPrice + Number(value);
      }

      if (roundTo > 0) {
        newPrice = Math.round(newPrice / roundTo) * roundTo;
      }

      newPrice = Math.max(0, newPrice);

      if (newPrice !== oldPrice) {
        prod.previousPrice = oldPrice;
        prod.price = newPrice;
        prod.updatedAt = new Date().toISOString();
        updatedCuts.push({
          id: prod.id,
          name: prod.name,
          category: prod.category,
          oldPrice,
          newPrice,
          changePct: oldPrice > 0 ? Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(1)) : 0
        });
      }
    });

    db.writeDb(database);
    db.emitChange('catalog:updated', database.products);

    return {
      success: true,
      updatedCount: updatedCuts.length,
      category,
      adjustmentType,
      value,
      appliedAt: new Date().toISOString(),
      updatedCuts
    };
  }

  // ==========================================
  // 7. RESUMEN INTEGRAL (FULL DASHBOARD DATA)
  // ==========================================
  async getFullMarketOverview() {
    const [macro, livestock, retail, fob] = await Promise.all([
      this.fetchLiveMacroData(),
      Promise.resolve(this.getLivestockQuotes()),
      Promise.resolve(this.getRetailBenchmark()),
      Promise.resolve(this.getFobExportQuotes())
    ]);

    return {
      timestamp: new Date().toISOString(),
      macro,
      livestock,
      retail,
      fob
    };
  }
}

export const meatMarketService = new MeatMarketService();
