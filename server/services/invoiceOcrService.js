import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from './database.js';
import { CONFIG } from '../config/index.js';
import { matchBestProduct } from './ai.js';

export class InvoiceOcrService {
  constructor() {
    this.geminiClient = null;
  }

  getGeminiClient() {
    const settings = db.getSettings();
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      throw new Error('API Key de Gemini no configurada en Ajustes ni variables de entorno.');
    }
    if (!this.geminiClient || this._currentKey !== apiKey) {
      this.geminiClient = new GoogleGenerativeAI(apiKey);
      this._currentKey = apiKey;
    }
    return this.geminiClient;
  }

  /**
   * Analiza una factura o recibo utilizando visión computacional e IA estructurada
   * @param {string|Buffer} imageSource - Ruta al archivo, base64 data URL o Buffer
   * @param {string} mimeType - 'image/jpeg', 'image/png', 'application/pdf', etc.
   */
  async analyzeInvoice(imageSource, mimeType = 'image/jpeg') {
    let base64Data = '';
    let resolvedMime = mimeType;

    if (Buffer.isBuffer(imageSource)) {
      base64Data = imageSource.toString('base64');
    } else if (typeof imageSource === 'string') {
      if (imageSource.startsWith('data:')) {
        const parts = imageSource.split(',');
        resolvedMime = parts[0].split(';')[0].replace('data:', '') || mimeType;
        base64Data = parts[1];
      } else if (fs.existsSync(imageSource)) {
        const buffer = fs.readFileSync(imageSource);
        base64Data = buffer.toString('base64');
        const ext = path.extname(imageSource).toLowerCase();
        if (ext === '.png') resolvedMime = 'image/png';
        else if (ext === '.pdf') resolvedMime = 'application/pdf';
        else if (ext === '.webp') resolvedMime = 'image/webp';
        else resolvedMime = 'image/jpeg';
      } else {
        base64Data = imageSource;
      }
    }

    const settings = db.getSettings();
    const modelName = settings.aiModel && settings.aiModel.includes('gemini') 
      ? settings.aiModel 
      : 'gemini-1.5-flash';

    const client = this.getGeminiClient();
    const model = client.getGenerativeModel({ model: modelName });

    const prompt = `Analiza detalladamente esta imagen de factura, boleta, remito o recibo de compra comercial (especialmente de rubro carnicería, frigorífico, avícola, verduras o almacén argentino).
Extrae TODOS los datos estructurados en formato JSON puro, sin bloques markdown de código (sin \`\`\`json).

Estructura requerida:
{
  "merchant": "Nombre o Razón Social del Proveedor",
  "cuit": "CUIT del emisor (ej: 30-XXXXXXXX-X) si aparece, sino vacío",
  "invoiceType": "Factura A | Factura B | Factura C | Remito | Ticket",
  "invoiceNumber": "Número de comprobante (ej: 0001-00012345)",
  "date": "YYYY-MM-DD (fecha de emisión de la factura)",
  "subtotal": 0.00,
  "taxAmount": 0.00,
  "total": 0.00,
  "category": "Carne Vacuna | Cortes Porcinos | Pollo | Achuras | Embutidos | Insumos | General",
  "items": [
    {
      "description": "Nombre exacto del corte o producto",
      "quantity": 1.00,
      "unit": "kg | un | caja | bolsa",
      "unitPrice": 0.00,
      "totalPrice": 0.00
    }
  ],
  "paymentMethod": "Cuenta Corriente | Contado | Transferencia | Cheque",
  "notes": "Observaciones relevantes detectadas"
}

Reglas estrictas:
1. Extrae cada ítem con su cantidad real (en kilos o unidades) y precios unitarios numéricos puros.
2. Si es carnicería o carne al peso, "quantity" debe reflejar los kilos netos pesados (ej: 145.5 kg).
3. Si la fecha está en formato DD/MM/AAAA conviértela siempre a YYYY-MM-DD.
4. Devuelve ÚNICAMENTE el objeto JSON válido.`;

    try {
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: resolvedMime
          }
        }
      ]);

      const text = result.response.text();
      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');

      const parsed = JSON.parse(cleaned);

      // Enriquecer y auto-vincular ítems con el catálogo de productos del sistema
      const catalog = db.getProducts();
      const enrichedItems = (parsed.items || []).map(it => {
        const matched = matchBestProduct(it.description, catalog);
        return {
          description: it.description,
          productId: matched ? matched.id : null,
          matchedProductName: matched ? matched.name : null,
          plu: matched ? matched.plu : null,
          quantity: Number(it.quantity) || 1,
          unit: it.unit || (matched ? matched.unit : 'kg'),
          unitPrice: Number(it.unitPrice) || 0,
          totalPrice: Number(it.totalPrice) || ((Number(it.quantity) || 1) * (Number(it.unitPrice) || 0))
        };
      });

      // Vincular o sugerir proveedor si ya existe en la base de datos
      const suppliers = db.readDb().suppliers || [];
      const cleanCuit = (parsed.cuit || '').replace(/\D/g, '');
      const matchedSupplier = suppliers.find(s => {
        if (cleanCuit && s.cuit && s.cuit.replace(/\D/g, '') === cleanCuit) return true;
        if (parsed.merchant && s.name && s.name.toLowerCase().includes(parsed.merchant.toLowerCase().slice(0, 6))) return true;
        return false;
      });

      return {
        success: true,
        data: {
          ...parsed,
          items: enrichedItems,
          supplierId: matchedSupplier ? matchedSupplier.id : null,
          matchedSupplierName: matchedSupplier ? matchedSupplier.name : null,
          rawResponse: cleaned
        }
      };
    } catch (err) {
      console.error('[InvoiceOcrService] Error escaneando factura con Gemini:', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }
}

export const invoiceOcrService = new InvoiceOcrService();
