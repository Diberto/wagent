import express from 'express';
import { meatMarketService } from '../services/meatMarketService.js';

const router = express.Router();

// 1. Resumen integral de mercado (MAG, Retail, Macro e Inflación)
router.get('/overview', async (req, res) => {
  try {
    const data = await meatMarketService.getFullMarketOverview();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Indicadores Macroeconómicos (INDEC / ArgentinaDatos)
router.get('/macro', async (req, res) => {
  try {
    const data = await meatMarketService.fetchLiveMacroData();
    res.json({ success: true, macro: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Mercado Agroganadero (MAG / Cañuelas)
router.get('/livestock', (req, res) => {
  try {
    const data = meatMarketService.getLivestockQuotes();
    res.json({ success: true, livestock: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Benchmark Minorista WAgent vs Supermercados
router.get('/retail-benchmark', (req, res) => {
  try {
    const data = meatMarketService.getRetailBenchmark();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Precios FOB Exportación (MAGyP)
router.get('/fob', (req, res) => {
  try {
    const data = meatMarketService.getFobExportQuotes();
    res.json({ success: true, fob: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Calculadora de Desposte & Rendimiento de Media Res
router.post('/yield-calculator', (req, res) => {
  try {
    const { carcassWeightKg, costPerKgGancho, customYieldMap } = req.body;
    const result = meatMarketService.calculateCarcassYield({
      carcassWeightKg: Number(carcassWeightKg) || 115,
      costPerKgGancho: costPerKgGancho ? Number(costPerKgGancho) : null,
      customYieldMap
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 7. Ajuste Inteligente de Precios al Catálogo (por inflación o suba del MAG)
router.post('/apply-price-adjustment', (req, res) => {
  try {
    const { category, adjustmentType, value, roundTo, appliedBy } = req.body;
    const result = meatMarketService.applySmartPriceAdjustment({
      category: category || 'all',
      adjustmentType: adjustmentType || 'percentage',
      value: Number(value) || 0,
      roundTo: Number(roundTo) || 50,
      appliedBy: appliedBy || 'Admin'
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
