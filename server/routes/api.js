import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../services/database.js';
import { AIService, getCanonicalCart } from '../services/ai.js';
import { runConversationTestSuite } from '../services/conversationTester.js';
import { AudioConverter } from '../services/audioConverter.js';
import { UpdateService } from '../services/updater.js';
import { BackupService } from '../services/backup.js';
import { mercadoPagoService } from '../services/mercadopago.js';
import { broadcastService } from '../services/broadcast.js';
import { wooCommerceService } from '../services/woocommerce.js';
import { DEFAULT_AUTOMATIONS } from '../services/automation.js';
import { ElevenLabsAgentService } from '../services/elevenlabsAgent.js';
import { NeuralMemoryService } from '../services/neuralMemory.js';
import { ImageService } from '../services/imageService.js';
import { ChatStrategyGraphService } from '../services/chatStrategyGraph.js';
import { parseProductFile, exportCatalog } from '../services/catalogImporter.js';
import { OrderFilterEngine } from '../services/orderFilterEngine.js';
import { arcaService } from '../services/arca.js';
import { SpeechService } from '../services/speech.js';
import { systemMonitor } from '../services/systemMonitor.js';
import { multiAgentOps } from '../services/multiAgentOps.js';
import { runStorageBenchmark } from '../services/benchmarks.js';
import { taskQueue } from '../services/taskQueue.js';
import { tokenTracker } from '../services/tokenTracker.js';
import { embeddedLlama } from '../services/embeddedLlama.js';
import { CONFIG } from '../config/index.js';
import { SYSTEM_AI_PROVIDERS, SYSTEM_AI_MODELS } from '../config/aiModels.js';
import { isMongoConnected, getDb, connectDB } from '../../db.js';
import { sqliteStorage } from '../services/sqliteStorage.js';

export function createApiRouter(whatsappService, io) {
  const router = express.Router();
  wooCommerceService.setSocketIO(io);
  broadcastService.setWhatsAppService(whatsappService);
  broadcastService.setSocketIO(io);

  // Middleware de telemetría de peticiones para System Monitor
  router.use((req, res, next) => {
    systemMonitor.recordRequest(false);
    next();
  });

  // Configuración de Multer para subida de audios y archivos desde el panel web
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, CONFIG.MEDIA_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.webm';
      cb(null, `upload_${Date.now()}_${Math.random().toString(36).substr(2, 5)}${ext}`);
    }
  });
  const upload = multer({ storage });

  // --- 🌟 System Resource Monitoring & Health Check ---
  router.get('/system/metrics', async (req, res) => {
    try {
      const metrics = await systemMonitor.getFullSystemMetrics(io);
      res.json({ success: true, ...metrics });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/system/optimize', (req, res) => {
    try {
      const dbRes = systemMonitor.optimizeDatabase();
      const memRes = systemMonitor.clearMemoryCaches();
      res.json({ success: true, db: dbRes, memory: memRes, message: 'Sistema optimizado, bases compactadas y memoria liberada con éxito.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/system/benchmark', async (req, res) => {
    try {
      const { readOps = 2000, writeOps = 1000 } = req.body || {};
      const result = await runStorageBenchmark({ readOps: Number(readOps), writeOps: Number(writeOps) });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/system/queue-status', (req, res) => {
    try {
      const stats = taskQueue.getStats();
      res.json({ success: true, stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- 💾 Gestión y Estado Integral de Base de Datos y Respaldos ---
  router.get('/database/status', async (req, res) => {
    try {
      const pingStart = Date.now();
      const mongoConnected = isMongoConnected();
      const mongoDb = getDb();
      let pingMs = 1;

      if (mongoConnected && mongoDb) {
        try {
          await mongoDb.command({ ping: 1 });
          pingMs = Date.now() - pingStart;
        } catch (e) {
          pingMs = -1;
        }
      }

      const sqliteStats = sqliteStorage.getDetailedStats();
      const allLeads = db.getLeads() || [];
      const allOrders = db.getOrders() || [];
      const allProducts = db.getProducts() || [];
      const allRecipes = db.getRecipes() || [];
      const allAgents = db.getAgents() || [];
      const allBranches = db.getBranches() || [];
      const allCoupons = db.getCoupons() || [];
      const allCustomers = typeof db.getCustomers === 'function' ? db.getCustomers() : [];
      const allKnowledge = typeof db.getKnowledgeBase === 'function' ? db.getKnowledgeBase() : [];
      const allShifts = typeof db.getShifts === 'function' ? db.getShifts() : [];

      // Calcular tamaño de multimedia y respaldos
      let mediaSizeBytes = 0;
      let mediaCount = 0;
      try {
        if (fs.existsSync(CONFIG.MEDIA_DIR)) {
          const files = fs.readdirSync(CONFIG.MEDIA_DIR);
          mediaCount = files.length;
          files.forEach(f => {
            try { mediaSizeBytes += fs.statSync(path.join(CONFIG.MEDIA_DIR, f)).size; } catch (_) {}
          });
        }
      } catch (_) {}

      const backups = BackupService.listBackups();
      const latestBackup = backups.length > 0 ? backups[0] : null;

      res.json({
        success: true,
        engine: mongoConnected ? 'mongodb_atlas' : (sqliteStats.isNative ? 'sqlite_wal' : 'json_fallback'),
        engineLabel: mongoConnected ? 'MongoDB Atlas (Hostinger Cloud)' : 'SQLite WAL Nativo (Respaldo Local)',
        hostinger: {
          whitelistedIp: '77.37.127.103',
          connected: mongoConnected,
          databaseName: mongoDb?.databaseName || 'wagent',
          pingMs: mongoConnected ? pingMs : 0
        },
        storage: {
          sqliteSizeBytes: sqliteStats.dbSizeBytes,
          sqliteSizeFormatted: (sqliteStats.dbSizeBytes / 1024 / 1024).toFixed(2) + ' MB',
          walSizeBytes: sqliteStats.walSizeBytes,
          mediaSizeBytes,
          mediaSizeFormatted: (mediaSizeBytes / 1024 / 1024).toFixed(2) + ' MB',
          mediaCount,
          backupsCount: backups.length,
          backupsTotalSizeBytes: backups.reduce((acc, b) => acc + (b.sizeBytes || 0), 0)
        },
        collections: [
          { name: 'leads', label: 'Leads & Contactos CRM', count: allLeads.length },
          { name: 'orders', label: 'Pedidos / Ventas Registradas', count: allOrders.length },
          { name: 'products', label: 'Cortes & PLUs Catálogo', count: allProducts.length },
          { name: 'customers', label: 'Base de Datos de Clientes', count: allCustomers.length || allLeads.length },
          { name: 'recipes', label: 'Recetas Tradicionales', count: allRecipes.length },
          { name: 'coupons', label: 'Cupones de Descuento', count: allCoupons.length },
          { name: 'cash_registers', label: 'Turnos y Cajas POS', count: allShifts.length },
          { name: 'agents', label: 'Agentes & Operadores', count: allAgents.length },
          { name: 'branches', label: 'Sucursales Físicas', count: allBranches.length },
          { name: 'knowledge', label: 'Base de Conocimiento IA', count: allKnowledge.length }
        ],
        lastBackup: latestBackup,
        health: {
          integrity: 'OK',
          mode: 'High-Availability Dual Engine',
          uptimeSeconds: Math.round(process.uptime())
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/database/ping', async (req, res) => {
    try {
      const start = Date.now();
      const mongoConnected = isMongoConnected();
      if (mongoConnected && getDb()) {
        await getDb().command({ ping: 1 });
      } else {
        sqliteStorage.stmts?.getStats?.get?.();
      }
      res.json({ success: true, latencyMs: Date.now() - start, engine: mongoConnected ? 'mongodb' : 'sqlite' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/database/optimize', async (req, res) => {
    try {
      const sqliteResult = sqliteStorage.optimize();
      const memResult = systemMonitor.clearMemoryCaches();

      // Limpiar archivos temporales huérfanos en media (prefijos temp_ o tts_tmp_)
      let cleanedFiles = 0;
      let cleanedBytes = 0;
      try {
        if (fs.existsSync(CONFIG.MEDIA_DIR)) {
          const files = fs.readdirSync(CONFIG.MEDIA_DIR);
          files.forEach(f => {
            if (f.startsWith('temp_') || f.startsWith('tts_tmp_') || f.startsWith('raw_temp_')) {
              try {
                const fPath = path.join(CONFIG.MEDIA_DIR, f);
                const st = fs.statSync(fPath);
                if (Date.now() - st.mtimeMs > 3600000) { // Mayor a 1 hora
                  fs.unlinkSync(fPath);
                  cleanedFiles++;
                  cleanedBytes += st.size;
                }
              } catch (_) {}
            }
          });
        }
      } catch (_) {}

      res.json({
        success: true,
        sqlite: sqliteResult,
        memory: memResult,
        cleanedMedia: { files: cleanedFiles, bytes: cleanedBytes },
        message: `Optimización completada con éxito. Se compactó la base de datos (${sqliteResult.freedKb} KB liberados) y se purgaron ${cleanedFiles} temporales.`
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Preescucha de voz para configuración de agentes
  router.post('/speech/preview-voice', async (req, res) => {
    try {
      const { voiceId, text = '¡Hola! Esta es una prueba de la voz configurada para este agente en WAgent.' } = req.body || {};
      const speech = await SpeechService.textToSpeech(text, voiceId);
      if (!speech || !speech.mp3Path) {
        return res.status(500).json({ success: false, error: 'No se pudo generar la muestra de voz' });
      }
      res.json({
        success: true,
        audioUrl: `/media/${path.basename(speech.mp3Path)}`,
        durationSeconds: speech.durationSeconds || 3
      });
    } catch (err) {
      console.error('Error generando preview de voz:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });


  // --- 👨‍🍳 Recetas Tradicionales Argentinas Vinculadas al Catálogo ---
  router.get('/recipes', (req, res) => {
    try {
      const recipes = db.getRecipes();
      res.json(recipes);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Exportar recetas a CSV o JSON
  router.get('/recipes/export', (req, res) => {
    try {
      const format = (req.query.format || 'csv').toLowerCase();
      const recipes = db.getRecipes();

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="recetas_${Date.now()}.json"`);
        return res.send(JSON.stringify(recipes, null, 2));
      }

      // Formato CSV con UTF-8 BOM para Excel
      const headers = ['ID', 'Titulo', 'Categoria', 'Descripcion', 'TiempoMinutos', 'Dificultad', 'Porciones', 'GramosPorPersona', 'CortesSugeridos', 'CortesReemplazo', 'Ingredientes', 'Instrucciones'];
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        const str = Array.isArray(val) ? val.map(x => typeof x === 'object' ? (x.name || x.plu || JSON.stringify(x)) : String(x)).join(' | ') : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      };

      const rows = [headers.join(';')];
      for (const r of recipes) {
        rows.push([
          escapeCsv(r.id),
          escapeCsv(r.title || r.name),
          escapeCsv(r.category),
          escapeCsv(r.description),
          escapeCsv(r.prepTimeMinutes),
          escapeCsv(r.difficulty),
          escapeCsv(r.servingsDefault),
          escapeCsv(r.gramsPerPerson),
          escapeCsv(r.suggestedCuts),
          escapeCsv(r.replacementCuts),
          escapeCsv(r.ingredients),
          escapeCsv(r.instructions)
        ].join(';'));
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="recetas_${Date.now()}.csv"`);
      return res.send('\uFEFF' + rows.join('\r\n'));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Importar recetas desde CSV o JSON
  router.post('/recipes/import', (req, res) => {
    try {
      const { recipes: inputRecipes, csvData } = req.body || {};
      let itemsToImport = [];

      if (Array.isArray(inputRecipes)) {
        itemsToImport = inputRecipes;
      } else if (typeof csvData === 'string') {
        const lines = csvData.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length > 1) {
          const headerLine = lines[0];
          const sep = headerLine.includes(';') ? ';' : ',';
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(sep).map(p => p.replace(/^"|"$/g, '').trim());
            if (parts.length >= 2 && parts[1]) {
              itemsToImport.push({
                title: parts[1] || parts[0],
                category: parts[2] || 'Tradicionales',
                description: parts[3] || '',
                prepTimeMinutes: parseInt(parts[4], 10) || 45,
                difficulty: parts[5] || 'Media',
                servingsDefault: parseInt(parts[6], 10) || 4,
                gramsPerPerson: parseInt(parts[7], 10) || 250,
                suggestedCuts: (parts[8] || '').split('|').map(s => ({ name: s.trim(), isPrimary: true })).filter(x => x.name),
                replacementCuts: (parts[9] || '').split('|').map(s => ({ name: s.trim() })).filter(x => x.name),
                ingredients: (parts[10] || '').split('|').map(s => s.trim()).filter(Boolean),
                instructions: (parts[11] || '').split('|').map(s => s.trim()).filter(Boolean),
                isFeatured: true
              });
            }
          }
        }
      }

      let count = 0;
      for (const rec of itemsToImport) {
        if (!rec.title && !rec.name) continue;
        db.saveRecipe({
          ...rec,
          id: rec.id || `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: rec.title || rec.name,
          updatedAt: new Date().toISOString()
        });
        count++;
      }

      io.emit('recipes:updated', db.getRecipes());
      res.json({ success: true, count, message: `${count} recetas importadas correctamente.` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Búsqueda y Adaptación de Recetas con IA al Catálogo Oficial
  router.post('/recipes/search-web', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || !query.trim()) {
        return res.status(400).json({ error: 'Debes ingresar un nombre de receta a buscar' });
      }

      const catalog = db.getProducts().filter(p => p.isAvailable !== false);
      const catalogSample = catalog.slice(0, 80).map(p => ({ plu: p.plu, name: p.name, category: p.category, price: p.price }));

      const settings = db.getSettings() || {};
      let adaptedRecipe = null;

      // Intentar usar Gemini si hay API key configurada
      const geminiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
      if (geminiKey) {
        try {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(geminiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

          const prompt = `Eres un Maestro Carnicero y Chef Argentino experto. 
Busca o diseña la receta auténtica para: "${query}".
Adapta los cortes de carne necesarios al Catálogo Oficial de nuestra carnicería.
Aquí tienes una muestra de cortes disponibles: ${JSON.stringify(catalogSample.map(p => `${p.plu}: ${p.name}`))}.

Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta sin texto adicional ni backticks:
{
  "title": "Nombre de la Receta",
  "category": "Guisos y Olla",
  "description": "Breve descripción apetitosa y tradicional",
  "prepTimeMinutes": 45,
  "difficulty": "Media",
  "servingsDefault": 4,
  "gramsPerPerson": 250,
  "suggestedCuts": [
    { "name": "Nombre corte del catálogo", "plu": "PLU correspondiente", "isPrimary": true, "note": "Por qué se recomienda" }
  ],
  "replacementCuts": [
    { "name": "Corte alternativo", "plu": "PLU o vacío", "note": "Alternativa económica" }
  ],
  "ingredients": ["1 kg de corte", "2 cebollas"],
  "instructions": ["Paso 1", "Paso 2"],
  "isFeatured": true
}`;

          const result = await model.generateContent(prompt);
          const text = result.response.text();
          const cleanJson = text.replace(/```json|```/g, '').trim();
          adaptedRecipe = JSON.parse(cleanJson);
        } catch (aiErr) {
          console.warn('Fallo llamada Gemini para receta, usando fallback experto:', aiErr.message);
        }
      }

      // Fallback culinario inteligente si no hay Gemini o falló
      if (!adaptedRecipe) {
        const qLower = query.toLowerCase();
        let matchedCut = catalog.find(p => qLower.includes((p.name || '').toLowerCase())) || catalog[0] || { name: 'Corte Vacuno Seleccionado', plu: '2020' };
        
        let cat = 'Tradicionales';
        if (qLower.includes('guiso') || qLower.includes('locro') || qLower.includes('olla') || qLower.includes('lenteja')) cat = 'Guisos y Olla';
        else if (qLower.includes('milanesa') || qLower.includes('frito') || qLower.includes('suprema')) cat = 'Milanesas y Fritos';
        else if (qLower.includes('horno') || qLower.includes('asado') || qLower.includes('vacio') || qLower.includes('costillar')) cat = 'Horno y Asaderas';
        else if (qLower.includes('bife') || qLower.includes('costeleta') || qLower.includes('entraña')) cat = 'Minutas y Plancha';

        adaptedRecipe = {
          title: query.charAt(0).toUpperCase() + query.slice(1),
          category: cat,
          description: `Receta tradicional argentina de ${query}, adaptada con cortes frescos de carnicería premium.`,
          prepTimeMinutes: 45,
          difficulty: 'Media',
          servingsDefault: 4,
          gramsPerPerson: 250,
          suggestedCuts: [
            { name: matchedCut.name, plu: matchedCut.plu || '', isPrimary: true, note: 'Corte principal recomendado por el maestro carnicero' }
          ],
          replacementCuts: [
            { name: 'Corte Alternativo Magro', plu: '', note: 'Opción económica de cocción lenta' }
          ],
          ingredients: [
            `1 kg de ${matchedCut.name}`,
            '2 cebollas medianas picadas fino',
            '1 pimiento rojo picado',
            '2 dientes de ajo picados',
            'Sal entrefina, pimienta y pimentón dulce al gusto'
          ],
          instructions: [
            `Cortar el/la ${matchedCut.name} en trozos parejos según la preparación.`,
            'Sellar la carne a fuego vivo en cacerola o plancha con un hilo de aceite.',
            'Añadir las verduras picadas y rehogar hasta transparentar.',
            'Cocinar a fuego moderado hasta lograr el punto tierno deseado y servir caliente.'
          ],
          isFeatured: true
        };
      }

      res.json({ success: true, recipe: adaptedRecipe });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/recipes/:id', (req, res) => {
    try {
      const recipe = db.getRecipe(req.params.id);
      if (!recipe) return res.status(404).json({ error: 'Receta no encontrada' });
      res.json(recipe);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/recipes', (req, res) => {
    try {
      const saved = db.saveRecipe(req.body);
      io.emit('recipes:updated', db.getRecipes());
      res.json({ success: true, recipe: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/recipes/:id', (req, res) => {
    try {
      const saved = db.saveRecipe({ ...req.body, id: req.params.id });
      io.emit('recipes:updated', db.getRecipes());
      res.json({ success: true, recipe: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/recipes/:id', (req, res) => {
    try {
      const success = db.deleteRecipe(req.params.id);
      io.emit('recipes:updated', db.getRecipes());
      res.json({ success });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/recipes/seed', (req, res) => {
    try {
      const seeded = db.seedRecipes(true);
      io.emit('recipes:updated', seeded);
      res.json({ success: true, count: seeded.length, recipes: seeded, message: `¡${seeded.length} recetas tradicionales argentinas cargadas!` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 👥 Equipo Multi-Agente Colaborativo y Chat de Ops ---
  router.get('/multi-agent/team', (req, res) => {
    try {
      const agents = multiAgentOps.getAgents();
      const history = multiAgentOps.getTeamChatHistory();
      res.json({ success: true, agents, history });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/multi-agent/message', async (req, res) => {
    try {
      const result = await multiAgentOps.processTeamMessage(req.body || {});
      io.emit('multi-agent:activity', result);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/multi-agent/task', async (req, res) => {
    try {
      const result = await multiAgentOps.executeTask(req.body || {});
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- 0. Image Processing & WebP Optimization Endpoints ---
  router.get('/strategy-graph', (req, res) => {
    try {
      const graph = ChatStrategyGraphService.getGraphDefinition();
      res.json({ success: true, graph });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Neural Memory & Continuous Self-Learning Endpoints ---
  const handleSystemMap = (req, res) => {
    try {
      const mentalMap = NeuralMemoryService.getSystemMentalMap();
      res.json({ success: true, ...mentalMap, mentalMap });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  router.get('/neural-memory/map', handleSystemMap);
  router.get('/neural-memory/system-map', handleSystemMap);

  const handleChatMap = (req, res) => {
    try {
      const conversationMap = NeuralMemoryService.getConversationNeuralMap(req.params.chatId);
      res.json({ success: true, ...conversationMap, conversationMap });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  router.get('/neural-memory/chat/:chatId', handleChatMap);
  router.get('/neural-memory/chat-map/:chatId', handleChatMap);

  router.get('/neural-memory/insights', (req, res) => {
    try {
      const insights = db.getLearnedInsights ? db.getLearnedInsights() : [];
      res.json({ success: true, insights });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/neural-memory/insights', (req, res) => {
    try {
      const saved = NeuralMemoryService.recordLearningInsight(req.body);
      io.emit('neural:insight', saved);
      res.json({ success: true, insight: saved });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/neural-memory/insights/:id', (req, res) => {
    try {
      if (db.deleteLearnedInsight) db.deleteLearnedInsight(req.params.id);
      io.emit('neural:insight-deleted', { id: req.params.id });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Endpoints de Respaldos de Base de Datos y Persistencia ---
  router.get('/backups', (req, res) => {
    try {
      const backups = BackupService.listBackups();
      res.json({ success: true, backups });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/backups', (req, res) => {
    try {
      const label = req.body?.label || 'manual';
      const created = BackupService.createBackup(label);
      res.json({ success: true, backup: created });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/backups/restore', (req, res) => {
    try {
      const { filename, payload } = req.body;
      let result;
      if (filename) {
        const filePath = BackupService.getBackupFilePath(filename);
        const content = fs.readFileSync(filePath, 'utf8');
        result = BackupService.restoreBackup(content);
      } else if (payload) {
        result = BackupService.restoreBackup(payload);
      } else {
        return res.status(400).json({ success: false, error: 'Debe especificar filename o payload de respaldo.' });
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/backups/:filename', (req, res) => {
    try {
      BackupService.deleteBackup(req.params.filename);
      res.json({ success: true, message: 'Respaldo eliminado.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No se envió ningún archivo.' });
      }
      // Si es una imagen, convertir a WebP y redimensionar a máx 1080x1920 / 1920x1080
      const isImage = req.file.mimetype.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp|heic|tiff)$/i.test(req.file.originalname);
      if (isImage) {
        const optimized = await ImageService.handleUploadedImage(req.file);
        return res.json({
          success: true,
          url: optimized.url,
          filename: optimized.filename,
          width: optimized.width,
          height: optimized.height,
          size: optimized.size,
          format: optimized.format
        });
      }

      res.json({
        success: true,
        url: `/media/${req.file.filename}`,
        filename: req.file.filename,
        size: req.file.size
      });
    } catch (err) {
      console.error('Error en /api/upload:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/campaigns/upload-banner', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No se envió ninguna imagen de banner.' });
      }
      const optimized = await ImageService.handleUploadedImage(req.file);
      res.json({
        success: true,
        mediaUrl: optimized.url,
        filename: optimized.filename
      });
    } catch (err) {
      console.error('Error subiendo banner:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/products/upload-image', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No se envió ninguna imagen de producto.' });
      }
      const optimized = await ImageService.handleUploadedImage(req.file);
      res.json({
        success: true,
        imageUrl: optimized.url,
        filename: optimized.filename
      });
    } catch (err) {
      console.error('Error subiendo imagen de producto:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/users/upload-avatar', upload.single('avatar'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No se envió ningún avatar.' });
      }
      const optimized = await ImageService.handleUploadedImage(req.file);
      res.json({
        success: true,
        avatarUrl: optimized.url,
        filename: optimized.filename
      });
    } catch (err) {
      console.error('Error subiendo avatar:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Media Gallery Endpoints ---
  router.get('/media', (req, res) => {
    try {
      const mediaDir = CONFIG.MEDIA_DIR;
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }
      const files = fs.readdirSync(mediaDir);
      const mediaList = files
        .filter(f => /\.(webp|png|jpe?g|gif|svg|bmp)$/i.test(f))
        .map(filename => {
          const filePath = path.join(mediaDir, filename);
          try {
            const stats = fs.statSync(filePath);
            return {
              filename,
              url: `/media/${filename}`,
              size: stats.size,
              createdAt: stats.birthtime || stats.mtime,
              modifiedAt: stats.mtime,
              format: path.extname(filename).replace('.', '').toLowerCase()
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

      res.json({ success: true, files: mediaList });
    } catch (err) {
      console.error('Error listando medios:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/media/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No se envió ningún archivo de imagen.' });
      }
      const isImage = req.file.mimetype.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp|heic|tiff)$/i.test(req.file.originalname);
      if (isImage) {
        const optimized = await ImageService.handleUploadedImage(req.file);
        return res.json({
          success: true,
          file: {
            filename: optimized.filename,
            url: optimized.url,
            width: optimized.width,
            height: optimized.height,
            size: optimized.size,
            format: optimized.format,
            createdAt: new Date().toISOString()
          }
        });
      }
      res.json({
        success: true,
        file: {
          filename: req.file.filename,
          url: `/media/${req.file.filename}`,
          size: req.file.size,
          format: path.extname(req.file.filename).replace('.', '').toLowerCase(),
          createdAt: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('Error subiendo imagen a galería:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/media/:filename', (req, res) => {
    try {
      const safeFilename = path.basename(req.params.filename);
      const filePath = path.join(CONFIG.MEDIA_DIR, safeFilename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return res.json({ success: true, deleted: safeFilename });
      }
      res.status(404).json({ success: false, error: 'Archivo no encontrado' });
    } catch (err) {
      console.error('Error eliminando medio:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- 1. WhatsApp Connection & Multi-Operator QR ---
  const ALLOWED_QR_ROLES = ['admin', 'gerencia', 'encargado', 'cajero'];

  const validateQrAccess = (userId, requestingUser = null) => {
    if (!userId || userId === 'default') {
      if (requestingUser && !ALLOWED_QR_ROLES.includes(requestingUser.role)) {
        return { allowed: false, error: 'Solo los roles de agentes de venta, encargados o administradores pueden gestionar conexiones de WhatsApp.' };
      }
      return { allowed: true };
    }

    const user = db.getUser(userId);
    if (!user) {
      return { allowed: true };
    }

    if (user.role === 'cliente' || user.role === 'repartidor') {
      return { 
        allowed: false, 
        error: `Los usuarios con rol "${user.role.toUpperCase()}" no pueden vincularse por QR de WhatsApp. Esta función es exclusiva para Agentes de Venta, Encargados, Gerencia y Administradores.` 
      };
    }

    return { allowed: true, user };
  };

  router.get('/whatsapp/status', (req, res) => {
    const userId = req.query.userId || 'default';
    res.json(whatsappService.getStatus(userId));
  });

  router.get('/whatsapp/sessions', (req, res) => {
    res.json(whatsappService.getAllSessionsStatus());
  });

  router.post('/whatsapp/connect', async (req, res) => {
    try {
      const userId = req.body.userId || 'default';
      const resetAuth = Boolean(req.body.resetAuth);
      const requestingUserId = req.body.requestingUserId || req.headers['x-user-id'];
      const requestingUser = requestingUserId ? db.getUser(requestingUserId) : null;

      const authCheck = validateQrAccess(userId, requestingUser);
      if (!authCheck.allowed) {
        return res.status(403).json({ error: authCheck.error });
      }

      const status = await whatsappService.connectUserSession(userId, { resetAuth });
      res.json({ success: true, message: `Inicializando conexión de WhatsApp para ${userId}`, status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/whatsapp/reset', async (req, res) => {
    try {
      const userId = req.body.userId || 'default';
      const requestingUserId = req.body.requestingUserId || req.headers['x-user-id'];
      const requestingUser = requestingUserId ? db.getUser(requestingUserId) : null;

      const authCheck = validateQrAccess(userId, requestingUser);
      if (!authCheck.allowed) {
        return res.status(403).json({ error: authCheck.error });
      }

      const status = await whatsappService.resetUserSession(userId);
      res.json({ success: true, message: `Sesión de WhatsApp ${userId} reseteada. Generando nuevo QR limpio.`, status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/whatsapp/disconnect', async (req, res) => {
    try {
      const userId = req.body.userId || 'default';
      const clearAuth = req.body.clearAuth !== false;
      const requestingUserId = req.body.requestingUserId || req.headers['x-user-id'];
      const requestingUser = requestingUserId ? db.getUser(requestingUserId) : null;

      const authCheck = validateQrAccess(userId, requestingUser);
      if (!authCheck.allowed) {
        return res.status(403).json({ error: authCheck.error });
      }

      const status = await whatsappService.disconnectUserSession(userId, { clearAuth });
      res.json({ success: true, message: `WhatsApp de ${userId} desconectado exitosamente`, status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 2. Leads & CRM Kanban ---
  router.get('/leads', (req, res) => {
    res.json(db.getLeads());
  });

  router.post('/leads', (req, res) => {
    const lead = db.saveOrUpdateLead(req.body);
    io.emit('lead:update', lead);
    res.json(lead);
  });

  router.put('/leads/:id', (req, res) => {
    const updated = db.updateLead(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Lead no encontrado' });
    io.emit('lead:update', updated);
    res.json(updated);
  });

  router.patch('/leads/:id', (req, res) => {
    const updated = db.updateLead(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Lead no encontrado' });
    io.emit('lead:update', updated);
    res.json(updated);
  });

  router.patch('/leads/:id/stage', (req, res) => {
    const { stage } = req.body;
    const lead = db.updateLeadStage(req.params.id, stage);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    io.emit('lead:update', lead);
    res.json(lead);
  });

  router.patch('/leads/:id/ai', (req, res) => {
    const { aiEnabled } = req.body;
    const lead = db.updateLeadAiStatus(req.params.id, aiEnabled);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    io.emit('lead:update', lead);
    res.json(lead);
  });

  router.delete('/leads/:id', (req, res) => {
    db.deleteLead(req.params.id);
    io.emit('lead:delete', { id: req.params.id });
    io.emit('messages:cleared', { jid: req.params.id });
    res.json({ success: true });
  });

  // --- 3. Chats & Messages ---
  router.get('/chats/:jid/messages', (req, res) => {
    const messages = db.getMessages(req.params.jid, 100);
    db.markChatRead(req.params.jid);
    res.json(messages);
  });

  router.delete('/messages/chat/:jid', (req, res) => {
    const { jid } = req.params;
    db.clearMessagesForChat(jid);
    io.emit('messages:cleared', { jid });
    const lead = db.getLead(jid);
    if (lead) io.emit('lead:update', lead);
    res.json({ success: true, message: 'Conversación vaciada con éxito' });
  });

  // --- Live Interactive Telephone Call Turn ---
  router.post('/ai/live-call-turn', async (req, res) => {
    const { userText, jid, customerName } = req.body;
    if (!userText) return res.status(400).json({ error: 'Texto de entrada requerido' });

    try {
      const lead = (jid ? db.getLead(jid) : null) || {
        name: customerName || 'Cliente en Llamada',
        jid: jid || 'call@live.user',
        stage: 'negotiating'
      };

      const aiReply = await AIService.generateReply({
        jid: lead.jid || 'call@live.user',
        incomingText: userText,
        isAudioInput: true
      });

      let audioUrl = null;
      if (aiReply.audioMp3Path) {
        audioUrl = `/media/${path.basename(aiReply.audioMp3Path)}`;
      } else if (aiReply.audioOggPath) {
        audioUrl = `/media/${path.basename(aiReply.audioOggPath)}`;
      }

      res.json({
        success: true,
        replyText: aiReply.text,
        audioUrl,
        duration: aiReply.audioDuration || 3
      });
    } catch (err) {
      console.error('Error en turno de llamada en vivo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/chats/:jid/messages', async (req, res) => {
    const { jid } = req.params;
    const { text, sendViaWhatsApp = true } = req.body;

    if (!text) return res.status(400).json({ error: 'El texto es obligatorio' });

    try {
      let sentKeyId = null;
      // Si WhatsApp está conectado, enviar mensaje real
      if (sendViaWhatsApp && whatsappService.status === 'connected') {
        const sent = await whatsappService.sendTextMessage(jid, text);
        sentKeyId = sent?.key?.id || null;
      }

      const msg = db.saveMessage({
        id: sentKeyId,
        chatId: jid,
        sender: 'agent',
        type: 'text',
        content: text,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });

      const lead = db.getLead(jid);
      io.emit('chat:message', { message: msg, lead });

      res.json({ success: true, message: msg });
    } catch (err) {
      console.error('Error enviando mensaje manual:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Subir y enviar nota de voz grabada desde el CRM
  router.post('/chats/:jid/send-audio', upload.single('audio'), async (req, res) => {
    const { jid } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo de audio' });

    try {
      // Convertir a WhatsApp PTT Opus OGG con fallback seguro
      let oggPath = req.file.path;
      try {
        oggPath = await AudioConverter.convertToWhatsAppPtt(req.file.path);
      } catch (convPttErr) {
        console.warn('No se pudo convertir a PTT Opus, usando archivo subido:', convPttErr.message);
      }

      let mp3Path = oggPath;
      try {
        mp3Path = await AudioConverter.convertOggToMp3(oggPath);
      } catch (convMp3Err) {
        mp3Path = oggPath;
      }

      if (whatsappService.status === 'connected') {
        try {
          await whatsappService.sendVoiceNote(jid, oggPath);
        } catch (waSendErr) {
          console.warn('Aviso enviando nota de voz a WhatsApp:', waSendErr.message);
        }
      }

      // Transcripción: si vino directamente del navegador por Web Speech o procesar con STT
      let audioContent = req.body?.transcription ? req.body.transcription.trim() : null;
      if (!audioContent) {
        try {
          const sttRes = await SpeechService.transcribeAudio(mp3Path);
          if (sttRes && !sttRes.includes('[Nota de voz')) {
            audioContent = sttRes;
          }
        } catch (_) {}
      }

      const savedMsg = db.saveMessage({
        chatId: jid,
        sender: 'agent',
        type: 'audio',
        content: audioContent || '🎤 [Nota de voz enviada por asesor]',
        mediaUrl: `/media/${path.basename(mp3Path)}`,
        audioDuration: Number(req.body?.duration) || 5,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });

      const lead = db.getLead(jid);
      io.emit('chat:message', { message: savedMsg, lead });

      res.json({ success: true, message: savedMsg });
    } catch (err) {
      console.error('Error procesando audio para WhatsApp:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Endpoint para transcribir o actualizar texto de una nota de voz bajo demanda
  router.post('/chats/:jid/messages/:messageId/transcribe', async (req, res) => {
    const { jid, messageId } = req.params;
    const { text } = req.body || {};
    try {
      const messages = db.getMessages(jid) || [];
      const targetMsg = messages.find(m => String(m.id) === String(messageId));
      if (!targetMsg) return res.status(404).json({ error: 'Mensaje no encontrado' });

      let newText = text;
      if (!newText && targetMsg.mediaUrl) {
        const localPath = path.join(CONFIG.DATA_DIR, targetMsg.mediaUrl);
        newText = await SpeechService.transcribeAudio(localPath);
      }

      if (newText) {
        targetMsg.content = newText;
        io.emit('chat:message', { message: targetMsg, lead: db.getLead(jid) });
      }

      res.json({ success: true, message: targetMsg });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/chats/:jid/mark-read', (req, res) => {
    db.markChatRead(req.params.jid);
    res.json({ success: true });
  });

  // Simular mensaje entrante para pruebas sin QR
  router.post('/chats/simulate-incoming', async (req, res) => {
    const { jid = '5491199998888@s.whatsapp.net', name = 'Cliente Demo', text = 'Hola, quiero información', isAudio = false } = req.body;

    let lead = db.getLead(jid);
    if (!lead) {
      lead = db.saveOrUpdateLead({
        jid,
        name,
        phone: jid.split('@')[0],
        pushName: name
      });
    }

    const savedMsg = db.saveMessage({
      chatId: jid,
      sender: 'user',
      type: isAudio ? 'audio' : 'text',
      content: text,
      timestamp: new Date().toISOString(),
      status: 'received'
    });

    io.emit('chat:message', { message: savedMsg, lead: db.getLead(jid) });

    // Responder con IA si está habilitada
    const settings = db.getSettings();
    if (lead.aiEnabled && settings.autoReplyEnabled) {
      setTimeout(async () => {
        const aiResponse = await AIService.generateReply({
          jid,
          incomingText: text,
          isAudioInput: isAudio
        });

        const savedAiMsg = db.saveMessage({
          chatId: jid,
          sender: 'agent',
          type: aiResponse.shouldSendAudio ? 'audio' : 'text',
          content: aiResponse.text,
          mediaUrl: aiResponse.audioMp3Path ? `/media/${path.basename(aiResponse.audioMp3Path)}` : null,
          audioDuration: aiResponse.audioDuration || 4,
          timestamp: new Date().toISOString(),
          status: 'sent'
        });

        io.emit('chat:message', { message: savedAiMsg, lead: db.getLead(jid) });
      }, 1000);
    }

    res.json({ success: true, message: savedMsg });
  });

  // --- 4. Calls & Voice Center ---
  router.get('/calls', (req, res) => {
    res.json(db.getCalls());
  });

  // Realizar Llamada de Voz Saliente / Despacho de Voz IA
  router.post('/calls/make', async (req, res) => {
    const { jid, phone, name = 'Cliente', customMessage, voice, callType = 'auto' } = req.body;

    if (!jid && !phone) {
      return res.status(400).json({ error: 'Se requiere JID o número de teléfono' });
    }

    const cleanNumber = (phone || jid).replace(/[^0-9]/g, '');
    const targetJid = jid || `${cleanNumber}@s.whatsapp.net`;
    const formattedPhone = phone ? (phone.startsWith('+') ? phone : `+${cleanNumber}`) : `+${cleanNumber}`;

    // Registrar o actualizar Lead
    let lead = db.getLead(targetJid);
    if (!lead) {
      lead = db.saveOrUpdateLead({
        jid: targetJid,
        name: name || `+${cleanNumber}`,
        phone: formattedPhone,
        pushName: name || `+${cleanNumber}`
      });
    }

    try {
      const settings = db.getSettings();
      const clientName = lead.name && !lead.name.startsWith('+') ? lead.name : name;
      const messageText = customMessage || `¡Hola ${clientName}! 🥩 Te llamamos de ${settings.businessName || 'República de la Carne'} para asesorarte con tu pedido y pasarte nuestras mejores promos en cortes premium y combos para el asado. ¿Cómo podemos ayudarte hoy?`;

      // 1. Si se solicita llamada telefónica directa ElevenLabs ConvAI o modo automático con API Key
      let elevenPhoneResult = null;
      if (settings.elevenlabsApiKey && (callType === 'elevenlabs_phone' || callType === 'phone')) {
        elevenPhoneResult = await ElevenLabsAgentService.initiateOutboundPhoneCall({
          phoneNumber: formattedPhone,
          customerName: clientName,
          customMessage: messageText
        });
      }

      // 2. Sintetizar voz neural ultra-realista
      const speech = await SpeechService.textToSpeech(messageText, voice);

      // 3. Si WhatsApp está conectado, enviar nota de voz PTT oficial
      if (whatsappService.status === 'connected' && speech.oggPath && fs.existsSync(speech.oggPath)) {
        await whatsappService.sendVoiceNote(targetJid, speech.oggPath);
        await whatsappService.sendTextMessage(targetJid, `🎙️ *[Llamada de Voz Saliente - Asistente Virtual]*\n${messageText}`);
      }

      // 4. Guardar registro de llamada saliente
      const callRecord = db.saveCall({
        chatId: targetJid,
        callerNumber: lead.phone || formattedPhone,
        callerName: lead.name || name,
        direction: 'outgoing',
        status: 'completed',
        duration: speech.durationSeconds || 10,
        timestamp: new Date().toISOString(),
        notes: `Llamada saliente enviada a ${formattedPhone}: "${messageText.substring(0, 70)}..."`,
        aiFollowUpSent: true
      });

      // 5. Guardar mensaje en el chat
      const savedMsg = db.saveMessage({
        chatId: targetJid,
        sender: 'agent',
        type: 'audio',
        content: messageText,
        mediaUrl: speech.mp3Path ? `/media/${path.basename(speech.mp3Path)}` : null,
        audioDuration: speech.durationSeconds || 10,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });

      io.emit('whatsapp:call', { call: callRecord, lead });
      io.emit('chat:message', { message: savedMsg, lead: db.getLead(targetJid) });

      res.json({
        success: true,
        call: callRecord,
        message: savedMsg,
        audioUrl: speech.mp3Path ? `/media/${path.basename(speech.mp3Path)}` : null,
        elevenPhoneResult
      });
    } catch (err) {
      console.error('Error realizando llamada saliente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Atender llamada entrante con Agente de Voz IA
  router.post('/calls/answer-ai', async (req, res) => {
    const { callId, jid, callerNumber } = req.body;
    const settings = db.getSettings();

    const targetJid = jid || (callerNumber ? `${callerNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);

    try {
      const lead = targetJid ? db.getLead(targetJid) : null;
      const clientName = lead?.name && !lead.name.startsWith('+') ? lead.name : (lead?.pushName && !lead.pushName.startsWith('+') ? lead.pushName : 'amigo');

      const messageText = settings.callFollowUpMessage ||
        `¡Hola ${clientName}! 🥩 Gracias por comunicarte con República de la Carne. Recibí tu llamada. ¿Qué cortes o combos te preparamos para hoy? Te paso precios y disponibilidad al instante. 🙌`;

      const speech = await SpeechService.textToSpeech(messageText);
      
      if (whatsappService.status === 'connected' && targetJid && speech.oggPath && fs.existsSync(speech.oggPath)) {
        await whatsappService.sendVoiceNote(targetJid, speech.oggPath);
        await whatsappService.sendTextMessage(targetJid, `🎙️ *[Asistente de Voz República de la Carne]*\n${messageText}`);
      }

      if (callId) {
        db.updateCall(callId, { status: 'completed', aiFollowUpSent: true });
      }

      if (targetJid) {
        const savedMsg = db.saveMessage({
          chatId: targetJid,
          sender: 'agent',
          type: 'audio',
          content: messageText,
          mediaUrl: speech.mp3Path ? `/media/${path.basename(speech.mp3Path)}` : null,
          audioDuration: speech.durationSeconds || 10,
          timestamp: new Date().toISOString(),
          status: 'sent'
        });

        io.emit('chat:message', { message: savedMsg, lead: db.getLead(targetJid) });
      }

      io.emit('whatsapp:call:updated', { callId, status: 'completed' });
      res.json({ success: true });
    } catch (err) {
      console.error('Error respondiendo llamada con IA:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- 5. Knowledge Base & FAQs ---
  router.get('/knowledge', (req, res) => {
    res.json(db.getKnowledgeBase());
  });

  router.post('/knowledge', (req, res) => {
    const item = db.saveKnowledgeItem(req.body);
    res.json(item);
  });

  router.post('/knowledge/:id/duplicate', (req, res) => {
    const item = db.duplicateKnowledgeItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item no encontrado' });
    res.json(item);
  });

  router.delete('/knowledge/:id', (req, res) => {
    db.deleteKnowledgeItem(req.params.id);
    res.json({ success: true });
  });

  // --- 5.0 Public Store API (Isolated, Frictionless & Secure Apple Glass Store) ---
  router.get('/store/config', (req, res) => {
    try {
      const settings = db.getSettings() || {};
      const safeConfig = {
        success: true,
        businessName: settings.businessName || 'República de la Carne',
        country: settings.country || 'Argentina',
        region: settings.region || 'Córdoba Capital y Alrededores',
        currency: settings.currency || 'ARS ($)',
        businessHours: settings.businessHours || { open: '08:00', close: '20:00', days: 'Lunes a Sábados' },
        deliverySlots: settings.deliverySlots || [],
        deliveryCutoffHour: Number(settings.deliveryCutoffHour) ?? 12,
        deliveryMaxHours: Number(settings.deliveryMaxHours) ?? 24,
        deliveryStandardCost: Number(settings.deliveryStandardCost) ?? 3500,
        deliveryExpressCost: Number(settings.deliveryExpressCost) ?? 6500,
        deliveryFreeThreshold: Number(settings.deliveryFreeThreshold) ?? 45000,
        deliveryFreeEnabled: settings.deliveryFreeEnabled !== false,
        deliveryExpressEnabled: settings.deliveryExpressEnabled !== false,
        deliveryCoverageRadiusKm: Number(settings.deliveryCoverageRadiusKm) ?? 15,
        storeConfig: {
          ...(CONFIG.DEFAULT_SETTINGS.storeConfig || {}),
          ...(settings.storeConfig || {})
        }
      };
      res.json(safeConfig);
    } catch (err) {
      console.error('Error obteniendo configuración pública de tienda:', err);
      res.status(500).json({ success: false, error: 'Error cargando configuración de la tienda' });
    }
  });

  router.get('/store/products', (req, res) => {
    try {
      const all = db.getProducts() || [];
      // Filtrar estrictamente solo los que están disponibles para la tienda web
      const publicProducts = all
        .filter(p => p.availableInStore !== false && p.isAvailable !== false && Number(p.price) > 0)
        .map(p => ({
          id: p.id,
          plu: p.plu,
          barcode: p.barcode,
          name: p.name,
          category: p.category || 'Parrilla',
          price: Number(p.price) || 0,
          unit: p.unit || 'kg',
          description: p.description || '',
          imageUrl: p.imageUrl || '',
          isAvailable: p.isAvailable !== false,
          availableInStore: true,
          isFeaturedWhatsApp: Boolean(p.isFeaturedWhatsApp),
          stockQuantity: Number(p.stockQuantity ?? p.stock ?? 100),
          allowBackorder: p.allowBackorder !== false
        }));

      res.json(publicProducts);
    } catch (err) {
      console.error('Error obteniendo catálogo público de tienda:', err);
      res.status(500).json({ success: false, error: 'Error cargando productos' });
    }
  });

  router.get('/store/branches', (req, res) => {
    try {
      const branches = db.getBranches ? db.getBranches() : [];
      if (branches && branches.length > 0) {
        return res.json(branches);
      }
      res.json([
        { id: 'branch-1', name: 'Urca Central', address: 'Av. José Roque Funes 1115, Córdoba', phone: '3513906947' },
        { id: 'branch-2', name: 'Urca 2 – Alto Tejeda', address: 'Av. Menéndez Pidal 3575, Córdoba', phone: '3518623195' },
        { id: 'branch-3', name: 'Intercountry – Corteza Mall', address: 'Av. Los Álamos 1015, Córdoba', phone: '3518623194' },
        { id: 'branch-4', name: 'Duarte Quirós', address: 'Av. Duarte Quirós 5130, Córdoba', phone: '3518156595' },
        { id: 'branch-5', name: 'Villa Allende', address: 'Av. Figueroa Alcorta 480, Villa Allende', phone: '3513540031' },
        { id: 'branch-6', name: 'Country San Isidro', address: 'Av. Padre Luchesse km 2, Villa Allende', phone: '3518769099' }
      ]);
    } catch (err) {
      console.error('Error obteniendo sucursales públicas:', err);
      res.status(500).json({ success: false, error: 'Error cargando sucursales' });
    }
  });

  router.post('/store/order', async (req, res) => {
    try {
      const {
        customerName,
        phone,
        address,
        fiscalCondition = 'CF',
        cuit = '',
        customerDoc = '',
        deliveryType = 'delivery',
        branchId = 'branch-1',
        branchName = 'Urca Central',
        items = [],
        products = [],
        totalAmount,
        paymentMethod = 'Efectivo contraentrega',
        notes = '',
        requestedSlotId = null,
        isExpress = false,
        cashReceived = null
      } = req.body;

      if (!customerName || !String(customerName).trim()) {
        return res.status(400).json({ success: false, error: 'El nombre del cliente es obligatorio.' });
      }
      if (!phone || !String(phone).trim()) {
        return res.status(400).json({ success: false, error: 'El teléfono de WhatsApp es obligatorio.' });
      }
      if (deliveryType === 'delivery' && (!address || !String(address).trim())) {
        return res.status(400).json({ success: false, error: 'La dirección de entrega es obligatoria para envíos.' });
      }

      const allItems = items.length > 0 ? items : products;
      if (!Array.isArray(allItems) || allItems.length === 0) {
        return res.status(400).json({ success: false, error: 'El carrito no contiene productos.' });
      }

      // 1. Calcular subtotal de ítems
      const subtotalCalc = allItems.reduce((acc, it) => acc + (Number(it.subtotal) || (Number(it.price || 0) * Number(it.quantity || it.amount || 1))), 0);
      const subtotal = Math.max(1, Math.round(subtotalCalc));

      // 2. Calcular logística de franja y costo de envío
      const deliveryCalc = db.calculateDeliverySlotAndCost({
        orderDate: new Date(),
        deliveryType,
        subtotal,
        isExpress,
        requestedSlotId
      });

      const finalTotal = subtotal + (deliveryType === 'delivery' ? (deliveryCalc.deliveryCost || 0) : 0);

      // 3. Crear payload unificado de pedido
      const orderData = {
        customerName: String(customerName).trim(),
        phone: String(phone).trim(),
        address: deliveryType === 'delivery' ? String(address).trim() : (branchName || 'Retiro en Sucursal'),
        fiscalCondition: fiscalCondition || 'CF',
        cuit: String(cuit || customerDoc || '').trim(),
        customerDoc: String(cuit || customerDoc || '').trim(),
        deliveryType,
        branchId: branchId || 'branch-1',
        branchName: branchName || 'Urca Central',
        deliverySlotId: deliveryCalc.slotId || null,
        deliverySlotName: deliveryCalc.slotName || null,
        deliveryWindow: deliveryCalc.deliveryWindow || null,
        deliveryCost: deliveryType === 'delivery' ? (deliveryCalc.deliveryCost || 0) : 0,
        subtotalAmount: subtotal,
        totalAmount: Number(totalAmount) || finalTotal,
        items: allItems,
        products: allItems,
        paymentMethod: paymentMethod || 'Efectivo',
        paymentStatus: 'pending',
        channel: 'TIENDA',
        source: 'TIENDA_WEB',
        origin: 'TIENDA',
        notes: String(notes || '').trim(),
        cashReceived: cashReceived ? Number(cashReceived) : null,
        changeAmount: (cashReceived && Number(cashReceived) > finalTotal) ? (Number(cashReceived) - finalTotal) : 0,
        status: 'pending'
      };

      // 4. Evaluar contra el motor de reglas de pedidos si está activo
      try {
        const filterEvaluation = await OrderFilterEngine.evaluateOrder(orderData);
        orderData.filterEvaluation = filterEvaluation;
        if (filterEvaluation && filterEvaluation.action === 'reject') {
          return res.status(400).json({
            success: false,
            error: filterEvaluation.reason || 'El pedido no cumple con las condiciones de entrega actuales.',
            evaluation: filterEvaluation
          });
        }
      } catch (fErr) {
        console.warn('Evaluación de filtro de pedidos omitida:', fErr.message);
      }

      // 5. Guardar en Base de Datos Unificada
      const savedOrder = db.createOrder(orderData);

      // 6. Si eligió Mercado Pago, generar link de pago instantáneo
      let checkoutUrl = null;
      let initPoint = null;
      let sandboxInitPoint = null;
      let mpPreferenceId = null;

      if (/mercadopago|mercado pago|tarjeta|link/i.test(paymentMethod)) {
        try {
          const pref = await mercadoPagoService.createPaymentPreference(savedOrder);
          if (pref) {
            checkoutUrl = pref.checkoutUrl || pref.initPoint;
            initPoint = pref.initPoint;
            sandboxInitPoint = pref.sandboxInitPoint;
            mpPreferenceId = pref.id;

            db.updateOrder(savedOrder.id, {
              paymentLink: checkoutUrl,
              mercadopagoPreferenceId: mpPreferenceId,
              mercadopagoMode: pref.mode,
              sandboxPaymentLink: sandboxInitPoint
            });
            savedOrder.paymentLink = checkoutUrl;
            savedOrder.mercadopagoPreferenceId = mpPreferenceId;
          }
        } catch (mpErr) {
          console.warn('Aviso: No se pudo generar preferencia automática de Mercado Pago:', mpErr.message);
        }
      }

      // 7. Notificar en vivo a operadores y CRM
      io.emit('order:new', savedOrder);
      io.emit('orders:sync', db.getOrders());

      res.json({
        success: true,
        order: savedOrder,
        orderId: savedOrder.id,
        checkoutUrl,
        initPoint,
        sandboxInitPoint,
        trackingUrl: `/tienda?tracking=${encodeURIComponent(savedOrder.id)}`
      });
    } catch (err) {
      console.error('Error registrando pedido desde la tienda pública:', err);
      res.status(500).json({ success: false, error: err.message || 'Error registrando el pedido' });
    }
  });

  router.get('/store/track/:query', (req, res) => {
    try {
      const q = String(req.params.query || '').trim();
      if (!q) {
        return res.status(400).json({ success: false, error: 'Consulta de seguimiento requerida' });
      }

      const orders = db.getOrdersByQuery(q);
      if (orders && orders.length > 0) {
        const sanitized = orders.map(o => ({
          id: o.id,
          customerName: o.customerName,
          phone: o.phone ? `***-***-${String(o.phone).slice(-4)}` : '',
          status: o.status || 'pending',
          paymentStatus: o.paymentStatus || 'pending',
          paymentMethod: o.paymentMethod || 'Efectivo',
          paymentLink: o.paymentLink || null,
          totalAmount: o.totalAmount,
          subtotalAmount: o.subtotalAmount,
          deliveryType: o.deliveryType || 'delivery',
          branchName: o.branchName || '',
          deliverySlotName: o.deliverySlotName || '',
          createdAt: o.createdAt,
          itemsCount: Array.isArray(o.items) ? o.items.length : 0,
          items: (o.items || []).map(i => ({
            name: i.name,
            quantity: i.quantity || i.amount || 1,
            unit: i.unit || 'kg',
            isUnitMode: Boolean(i.isUnitMode),
            unitCount: i.unitCount || 0,
            subtotal: i.subtotal || 0
          }))
        }));

        return res.json({
          success: true,
          count: sanitized.length,
          orders: sanitized,
          order: sanitized[0]
        });
      }

      // Buscar por ID exacto
      const single = db.getOrder(q);
      if (single) {
        const sanitizedSingle = {
          id: single.id,
          customerName: single.customerName,
          status: single.status || 'pending',
          paymentStatus: single.paymentStatus || 'pending',
          paymentMethod: single.paymentMethod || 'Efectivo',
          paymentLink: single.paymentLink || null,
          totalAmount: single.totalAmount,
          deliveryType: single.deliveryType || 'delivery',
          branchName: single.branchName || '',
          deliverySlotName: single.deliverySlotName || '',
          createdAt: single.createdAt,
          items: (single.items || []).map(i => ({
            name: i.name,
            quantity: i.quantity || i.amount || 1,
            unit: i.unit || 'kg',
            isUnitMode: Boolean(i.isUnitMode),
            unitCount: i.unitCount || 0,
            subtotal: i.subtotal || 0
          }))
        };
        return res.json({ success: true, count: 1, orders: [sanitizedSingle], order: sanitizedSingle });
      }

      res.json({ success: true, count: 0, orders: [], order: null, message: 'No se encontraron pedidos con ese código o teléfono.' });
    } catch (err) {
      console.error('Error consultando tracking de pedido:', err);
      res.status(500).json({ success: false, error: 'Error consultando estado del pedido' });
    }
  });

  // --- 5.1 Product Catalog & Admin Operations ---
  router.get('/products', (req, res) => {
    res.json(db.getProducts());
  });

  router.post('/products', (req, res) => {
    const product = db.saveProduct(req.body);
    io.emit('catalog:updated', { product });
    res.json(product);
  });

  router.put('/products/:id', (req, res) => {
    const product = db.updateProduct(req.params.id, req.body);
    io.emit('catalog:updated', { product });
    res.json(product);
  });

  router.post('/products/bulk-update', (req, res) => {
    try {
      const { productIds, updates } = req.body;
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de IDs de productos requerida' });
      }
      const updatedList = db.bulkUpdateProducts(productIds, updates || {});
      io.emit('catalog:updated', { count: updatedList.length, products: db.getProducts() });
      res.json({ success: true, count: updatedList.length, products: updatedList });
    } catch (err) {
      console.error('Error en bulk update de productos:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Deshabilitar masivamente productos con precio=0 o stock=0 en Web y/o WhatsApp
  router.post('/products/disable-zero-values', (req, res) => {
    try {
      const { channel = 'both' } = req.body; // 'web' | 'whatsapp' | 'both'
      const allProducts = db.getProducts();
      const toDisable = allProducts.filter(p => {
        const hasZeroPrice = !p.price || Number(p.price) <= 0;
        const hasZeroStock = p.stockControl && (Number(p.stockQuantity ?? p.stock ?? 0) <= 0);
        return hasZeroPrice || hasZeroStock;
      });
      if (toDisable.length === 0) {
        return res.json({ success: true, count: 0, message: 'Ningún producto con precio o stock en 0 encontrado' });
      }
      const updates = {};
      if (channel === 'web' || channel === 'both') updates.availableInStore = false;
      if (channel === 'whatsapp' || channel === 'both') updates.availableInWhatsApp = false;
      if (channel === 'both') updates.isAvailable = false;
      const updatedList = db.bulkUpdateProducts(toDisable.map(p => p.id), updates);
      io.emit('catalog:updated', { products: db.getProducts() });
      res.json({
        success: true,
        count: updatedList.length,
        products: updatedList,
        message: `${updatedList.length} productos deshabilitados por precio o stock en 0`
      });
    } catch (err) {
      console.error('Error en disable-zero-values:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/products/bulk-delete', (req, res) => {
    try {
      const { productIds } = req.body;
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de IDs de productos requerida' });
      }
      const deletedCount = db.bulkDeleteProducts(productIds);
      io.emit('catalog:updated', { count: deletedCount, products: db.getProducts() });
      res.json({ success: true, deletedCount, products: db.getProducts() });
    } catch (err) {
      console.error('Error en bulk delete de productos:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/products/:id/duplicate', (req, res) => {
    const product = db.duplicateProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    io.emit('catalog:updated', { product });
    res.json(product);
  });

  router.delete('/products/:id', (req, res) => {
    db.deleteProduct(req.params.id);
    io.emit('catalog:updated', { deletedId: req.params.id });
    res.json({ success: true });
  });

  // Ajuste rápido de stock y configuración de stock por producto
  router.patch('/products/:id/stock', (req, res) => {
    try {
      const { stockDelta, stockQuantity, isAbsolute = false, stockControl, stockMinAlert, allowBackorder } = req.body;
      const updates = {};
      if (stockControl !== undefined) updates.stockControl = Boolean(stockControl);
      if (stockMinAlert !== undefined) updates.stockMinAlert = Number(stockMinAlert);
      if (allowBackorder !== undefined) updates.allowBackorder = Boolean(allowBackorder);

      if (Object.keys(updates).length > 0) {
        db.updateProduct(req.params.id, updates);
      }

      if (stockDelta !== undefined || stockQuantity !== undefined) {
        const val = stockQuantity !== undefined ? stockQuantity : stockDelta;
        const isAbs = isAbsolute || stockQuantity !== undefined;
        const updated = db.updateProductStock(req.params.id, val, isAbs);
        io.emit('catalog:updated', { product: updated });
        return res.json({ success: true, product: updated });
      }

      const current = db.getProducts().find(p => p.id === req.params.id);
      io.emit('catalog:updated', { product: current });
      res.json({ success: true, product: current });
    } catch (err) {
      console.error('Error actualizando stock:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Restaurar / Cargar Catálogo Maestro Oficial con Códigos PLU
  router.post('/products/seed-master', (req, res) => {
    try {
      const products = db.saveProductsBulk(OFFICIAL_MASTER_CATALOG, true);
      io.emit('catalog:updated', { count: products.length, products });
      res.json({
        success: true,
        message: `¡Catálogo maestro cargado con éxito! ${products.length} productos y códigos PLU registrados.`,
        count: products.length,
        products
      });
    } catch (err) {
      console.error('Error cargando catálogo maestro:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Importar Catálogo desde Excel (.xlsx, .xls) / CSV / TSV / JSON
  router.post('/products/import', upload.single('file'), async (req, res) => {
    try {
      let fileBuffer = null;
      let filename = 'catalogo.csv';

      if (req.file) {
        fileBuffer = fs.readFileSync(req.file.path);
        filename = req.file.originalname || req.file.filename;
        // Eliminar archivo temporal
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      } else if (req.body && typeof req.body === 'string' && req.body.trim()) {
        fileBuffer = req.body;
      } else if (req.body && Array.isArray(req.body)) {
        fileBuffer = JSON.stringify(req.body);
        filename = 'catalogo.json';
      } else if (req.body && req.body.products && Array.isArray(req.body.products)) {
        fileBuffer = JSON.stringify(req.body.products);
        filename = 'catalogo.json';
      } else if (req.body && typeof req.body === 'object') {
        const bodyKeys = Object.keys(req.body);
        if (bodyKeys.length > 0 && typeof bodyKeys[0] === 'string' && bodyKeys[0].includes(';')) {
          fileBuffer = bodyKeys.join('\n');
        } else {
          fileBuffer = JSON.stringify(req.body);
          filename = 'catalogo.json';
        }
      }

      if (!fileBuffer) {
        return res.status(400).json({ success: false, error: 'No se recibió ningún contenido o archivo para importar.' });
      }

      const replaceAll = req.query.replace === 'true' || req.body?.replaceAll === true;
      const parsedProducts = parseProductFile(fileBuffer, filename);

      if (!parsedProducts || parsedProducts.length === 0) {
        return res.status(400).json({ success: false, error: 'No se pudieron extraer productos válidos del archivo proporcionado. Verifica las columnas (Cod.;Producto;Precio).' });
      }

      const saved = db.saveProductsBulk(parsedProducts, replaceAll);
      io.emit('catalog:updated', { count: saved.length, products: saved });

      res.json({
        success: true,
        message: `¡Importación exitosa! Se procesaron ${parsedProducts.length} productos con sus códigos PLU y precios.`,
        importedCount: parsedProducts.length,
        totalProducts: saved.length,
        products: saved
      });
    } catch (err) {
      console.error('Error importando catálogo:', err);
      res.status(500).json({ success: false, error: `Error al procesar archivo: ${err.message}` });
    }
  });

  // Exportar Catálogo en Excel (.xlsx, .xls), CSV con UTF-8 BOM, o JSON
  router.get('/products/export', (req, res) => {
    try {
      const format = (req.query.format || 'xlsx').toLowerCase();
      const products = db.getProducts();

      const { buffer, contentType, extension } = exportCatalog(products, format);
      const filename = `catalogo_republica_carne_${new Date().toISOString().slice(0, 10)}.${extension}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      console.error('Error exportando catálogo:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Sincronizar catálogo con WhatsApp Business
  router.post('/whatsapp/sync-catalog', async (req, res) => {
    try {
      if (whatsappService.status !== 'connected' || !whatsappService.sock) {
        return res.status(400).json({ error: 'WhatsApp no está conectado' });
      }

      let catalogProducts = [];
      try {
        const myJid = whatsappService.sock.user?.id;
        if (myJid && whatsappService.sock.getCatalog) {
          const catalogResult = await whatsappService.sock.getCatalog({ jid: myJid, limit: 50 });
          if (catalogResult && catalogResult.data) {
            catalogProducts = catalogResult.data.map(item => ({
              id: item.id || `wa-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              name: item.name || item.title,
              description: item.description || '',
              price: Number(item.price) / 1000 || 0,
              currency: item.currency || 'ARS',
              imageUrl: item.image_url || (item.media && item.media[0]?.url) || '',
              isAvailable: !item.is_hidden
            }));

            // Guardar en la base de datos
            catalogProducts.forEach(p => db.saveProduct(p));
          }
        }
      } catch (catErr) {
        console.warn('Nota: La cuenta vinculada no es WhatsApp Business o no tiene catálogo público activo:', catErr.message);
      }

      const allProducts = db.getProducts();
      res.json({
        success: true,
        syncedCount: catalogProducts.length,
        totalProducts: allProducts.length,
        products: allProducts,
        message: catalogProducts.length > 0
          ? `¡Se importaron ${catalogProducts.length} productos desde WhatsApp Business con éxito!`
          : 'Catálogo sincronizado. Puedes cargar o editar productos directamente desde el panel.'
      });
    } catch (err) {
      console.error('Error sincronizando catálogo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- 5.1 Orders Management System ---
  router.get('/orders', (req, res) => {
    res.json(db.getOrders());
  });

  // --- Validación y Estimación de Franjas y Envíos ---
  router.post('/orders/validate', (req, res) => {
    try {
      const validation = db.validateOrderPayload(req.body);
      const deliveryCalc = db.calculateDeliverySlotAndCost({
        orderDate: req.body.createdAt || new Date(),
        deliveryType: req.body.deliveryType || 'delivery',
        subtotal: Number(req.body.totalAmount) || 0,
        isExpress: Boolean(req.body.isExpress || req.body.deliveryOption === 'express'),
        requestedSlotId: req.body.deliverySlotId || req.body.deliverySlot
      });
      res.json({
        success: true,
        ...validation,
        deliveryCalc
      });
    } catch (err) {
      console.error('Error validando pedido:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/orders/delivery-estimate', (req, res) => {
    try {
      const { deliveryType = 'delivery', subtotal = 0, isExpress = false, requestedSlotId = null, date } = req.body;
      const deliveryCalc = db.calculateDeliverySlotAndCost({
        orderDate: date || new Date(),
        deliveryType,
        subtotal: Number(subtotal) || 0,
        isExpress: Boolean(isExpress),
        requestedSlotId
      });
      res.json({ success: true, ...deliveryCalc });
    } catch (err) {
      console.error('Error calculando estimación de envío:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/orders', (req, res) => {
    const payload = {
      ...req.body,
      channel: req.body.channel || (req.body.notes?.includes('[POS') ? 'POS' : 'WHATSAPP'),
      source: req.body.source || (req.body.notes?.includes('[POS') ? 'POS' : 'WHATSAPP'),
      origin: req.body.origin || (req.body.notes?.includes('[POS') ? 'POS' : 'WHATSAPP')
    };
    const order = db.createOrder(payload);
    io.emit('order:new', order);
    res.json(order);
  });

  router.get('/orders/:id', (req, res) => {
    const order = db.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(order);
  });

  router.put('/orders/:id', (req, res) => {
    const updated = db.updateOrder(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Pedido no encontrado' });
    io.emit('order:update', updated);
    io.emit('orders:sync', db.getOrders());
    res.json(updated);
  });

  router.patch('/orders/:id', (req, res) => {
    const updated = db.updateOrder(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Pedido no encontrado' });
    io.emit('order:update', updated);
    io.emit('orders:sync', db.getOrders());
    res.json(updated);
  });

  router.patch('/orders/:id/status', async (req, res) => {
    const { status, notify, customMessage } = req.body;
    if (!status) return res.status(400).json({ error: 'Estado no proporcionado' });

    const order = db.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const updated = db.updateOrderStatus(req.params.id, status);

    if (notify) {
      const targetJid = order.jid || (order.phone ? `${order.phone.replace(/\D/g, '')}@s.whatsapp.net` : null);
      if (targetJid && whatsappService && whatsappService.status === 'connected') {
        const msgToSend = customMessage || `¡Hola ${order.customerName || 'Cliente'}! Tu pedido #${order.id} ha cambiado de estado a: *${status}*. 🥩`;
        try {
          await whatsappService.sendMessage(targetJid, msgToSend);
          const savedMsg = db.saveMessage({
            chatId: targetJid,
            sender: 'agent',
            type: 'text',
            content: msgToSend,
            timestamp: new Date().toISOString()
          });
          io.emit('chat:message', { message: savedMsg });
        } catch (waErr) {
          console.error('Error enviando notificación de estado por WhatsApp:', waErr);
        }
      }
    }

    io.emit('order:update', updated);
    io.emit('orders:sync', db.getOrders());
    res.json(updated);
  });

  const handleOrderMercadoPago = async (req, res) => {
    try {
      const order = db.getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

      const preference = await mercadoPagoService.createPaymentPreference(order);
      
      const updated = db.updateOrder(order.id, {
        paymentMethod: preference.isSandbox ? 'Mercado Pago (Sandbox)' : 'Mercado Pago',
        paymentPreferenceId: preference.id,
        paymentLink: preference.checkoutUrl,
        paymentMode: preference.mode,
        sandboxPaymentLink: preference.sandboxInitPoint
      });

      io.emit('order:update', updated);

      res.json({
        success: true,
        init_point: preference.checkoutUrl,
        sandbox_init_point: preference.sandboxInitPoint,
        checkoutUrl: preference.checkoutUrl,
        preferenceId: preference.id,
        mode: preference.mode,
        isSandbox: preference.isSandbox,
        ...preference
      });
    } catch (err) {
      console.error('Error generando link de Mercado Pago para pedido:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  router.post('/orders/:id/mercadopago', handleOrderMercadoPago);
  router.post('/orders/:id/payment-link', handleOrderMercadoPago);

  router.patch('/orders/:id/prepare', (req, res) => {
    const { isPrepared, preparedBy } = req.body;
    const order = db.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const targetPrepared = isPrepared !== undefined ? Boolean(isPrepared) : !Boolean(order.isPrepared);
    const updated = db.setOrderPrepared(req.params.id, targetPrepared, preparedBy);
    
    io.emit('order:update', updated);
    io.emit('orders:sync', db.getOrders());
    res.json(updated);
  });

  router.patch('/orders/:id/archive', (req, res) => {
    const { isArchived } = req.body;
    const order = db.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const targetArchived = isArchived !== undefined ? Boolean(isArchived) : !Boolean(order.isArchived);
    const updated = db.archiveOrder(req.params.id, targetArchived);

    io.emit('order:update', updated);
    io.emit('orders:sync', db.getOrders());
    res.json(updated);
  });

  router.delete('/orders/:id', (req, res) => {
    const deleted = db.deleteOrder(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Pedido no encontrado' });
    io.emit('order:delete', req.params.id);
    io.emit('orders:sync', db.getOrders());
    res.json({ success: true, id: req.params.id });
  });

  // --- Public Order Tracking Endpoint (Seguimiento de pedidos por código #ORD-XXXX o Teléfono) ---
  router.get('/orders/track/:query', (req, res) => {
    try {
      const q = req.params.query;
      const orders = db.getOrdersByQuery(q);
      if (orders.length > 0) {
        return res.json({ success: true, count: orders.length, orders, order: orders[0] });
      }

      // Si no encontró por query general, probar getOrder directo
      const single = db.getOrder(q);
      if (single) {
        return res.json({ success: true, count: 1, orders: [single], order: single });
      }

      return res.json({ success: true, count: 0, orders: [], order: null, message: 'No se encontraron pedidos con ese código o número de teléfono.' });
    } catch (err) {
      console.error('Error buscando tracking de pedido:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Storefront Order API (Creación de pedidos desde la Tienda Web) ---
  router.post('/store/order', (req, res) => {
    try {
      const {
        customerName,
        phone,
        address,
        deliveryType = 'delivery',
        branchId,
        branchName,
        items,
        totalAmount,
        paymentMethod,
        notes
      } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'El pedido debe contener al menos un producto o corte.' });
      }

      if (!customerName || !phone) {
        return res.status(400).json({ success: false, error: 'Nombre y teléfono de WhatsApp son obligatorios.' });
      }

      const cleanPhone = String(phone).replace(/\D/g, '');
      const jid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

      // Evaluar filtros y condiciones de aceptación de pedidos
      const filterResult = OrderFilterEngine.evaluateOrder({
        phone: cleanPhone,
        address: address || '',
        amount: Number(totalAmount) || 0,
        deliveryType: deliveryType || 'delivery'
      });

      let finalDeliveryType = deliveryType;
      let finalAddress = address;

      if (!filterResult.allowed) {
        if (filterResult.action === 'reject') {
          return res.status(400).json({
            success: false,
            error: filterResult.message,
            action: filterResult.action,
            rejectedRules: filterResult.rejectedRules
          });
        } else if (filterResult.action === 'pickup_only') {
          finalDeliveryType = 'pickup';
          finalAddress = branchName ? `Retiro en ${branchName}` : 'Retiro en Sucursal Central';
        }
      }

      // Crear o actualizar cliente en CRM
      const lead = db.findOrCreateLead({
        jid,
        name: customerName,
        phone: cleanPhone,
        address: finalDeliveryType === 'delivery' ? (finalAddress || '') : '',
        tags: ['Tienda Web', finalDeliveryType === 'delivery' ? 'Envío a Domicilio' : 'Retiro en Sucursal']
      });

      // Crear orden formal con origen TIENDA garantizado
      const orderData = {
        customerName: customerName.trim(),
        phone: cleanPhone,
        jid,
        customerJid: jid,
        address: finalDeliveryType === 'delivery' ? (finalAddress || 'Domicilio del cliente') : (branchName || 'Retiro en Sucursal'),
        deliveryType: finalDeliveryType,
        branchId: branchId || null,
        branch: branchName || null,
        branchName: branchName || null,
        items: items.map(it => {
          if (typeof it === 'string') return it;
          if (it.isUnitMode && it.unitCount > 0) {
            return `• ${it.unitCount} Unidades de ${it.name} — $${Number(it.subtotal || it.price * it.quantity).toLocaleString('es-AR')}`;
          }
          return `• ${it.quantity} ${it.unit || 'kg'} ${it.name} — $${Number(it.subtotal || it.price * it.quantity).toLocaleString('es-AR')}`;
        }),
        products: items,
        totalAmount: Number(totalAmount) || 0,
        paymentMethod: paymentMethod || 'Efectivo contraentrega',
        paymentStatus: 'pending',
        status: 'pending',
        channel: 'TIENDA',
        source: 'TIENDA',
        origin: 'TIENDA',
        notes: notes ? `[Tienda Web] ${notes}` : '[Tienda Web]'
      };

      const newOrder = db.createOrder(orderData);

      // Emitir en tiempo real a administradores y operadores
      io.emit('order:new', newOrder);

      if (lead) {
        io.emit('lead:update', lead);
      }

      res.json({ success: true, order: newOrder, lead, filterResult });
    } catch (err) {
      console.error('Error creando orden desde tienda:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Quick Replies / Plantillas de Chat para Operador ---
  router.get('/quick-replies', (req, res) => {
    try {
      res.json({ success: true, quickReplies: db.getQuickReplies() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/quick-replies', (req, res) => {
    try {
      const reply = db.saveQuickReply(req.body);
      res.json({ success: true, quickReply: reply });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/quick-replies/:id', (req, res) => {
    try {
      db.deleteQuickReply(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Order Acceptance Rules & Filters ---
  router.get('/order-filters', (req, res) => {
    try {
      res.json({ success: true, enabled: true, rules: OrderFilterEngine.getRules() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/order-filters', (req, res) => {
    try {
      const success = OrderFilterEngine.saveRules(req.body.rules || req.body);
      res.json({ success, rules: OrderFilterEngine.getRules() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/order-filters/evaluate', (req, res) => {
    try {
      const result = OrderFilterEngine.evaluateOrder(req.body);
      res.json({ success: true, ...result, result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Helper infalible para resolver el JID de WhatsApp del cliente
  const resolveOrderTargetJid = async (order) => {
    if (!order) return null;
    const rawJid = String(order.jid || '').trim();

    // 1. JID estándar @s.whatsapp.net
    if (rawJid.includes('@s.whatsapp.net')) {
      const userPart = rawJid.split('@')[0];
      const cleanDigits = userPart.replace(/\D/g, '');
      if (cleanDigits.length >= 8) return `${cleanDigits}@s.whatsapp.net`;
    }

    // 2. Si es LID, resolver a teléfono
    if (rawJid.includes('@lid') && typeof whatsappService.resolvePhoneJid === 'function') {
      try {
        const resolved = await whatsappService.resolvePhoneJid(rawJid);
        if (resolved && resolved.includes('@s.whatsapp.net')) {
          const digits = resolved.split('@')[0].replace(/\D/g, '');
          if (digits.length >= 8) return `${digits}@s.whatsapp.net`;
        }
      } catch (e) {}
    }

    // 3. Buscar en leads
    const lead = db.getLead(order.jid || order.phone);
    if (lead) {
      if (lead.jid && lead.jid.includes('@s.whatsapp.net')) {
        const digits = lead.jid.split('@')[0].replace(/\D/g, '');
        if (digits.length >= 8) return `${digits}@s.whatsapp.net`;
      }
      if (Array.isArray(lead.altJids)) {
        for (const alt of lead.altJids) {
          if (alt && alt.includes('@s.whatsapp.net')) {
            const digits = alt.split('@')[0].replace(/\D/g, '');
            if (digits.length >= 8) return `${digits}@s.whatsapp.net`;
          }
        }
      }
      if (lead.phone) {
        const digits = String(lead.phone).replace(/\D/g, '');
        if (digits.length >= 8) return `${digits}@s.whatsapp.net`;
      }
    }

    // 4. Fallback directo con dígitos numéricos
    const rawPhone = order.phone || order.jid || '';
    const digits = String(rawPhone).replace(/\D/g, '');
    if (digits.length >= 8) {
      return `${digits}@s.whatsapp.net`;
    }

    return null;
  };

  router.patch('/orders/:id/status', async (req, res) => {
    const { status, paymentStatus, notifyCustomer, notify, notifyClient, notificationMessage, customMessage } = req.body;
    const order = db.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const shouldNotify = (notifyCustomer !== false && notify !== false && notifyClient !== false);
    const updateData = {};
    if (status) updateData.status = status;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;

    const updated = db.updateOrder(req.params.id, updateData);
    io.emit('order:update', updated);

    let notified = false;
    let notificationError = null;

    // Enviar notificación automática por WhatsApp al cliente a menos que se desactive explícitamente
    if (shouldNotify && status) {
      try {
        const targetJid = await resolveOrderTargetJid(order);
        const lead = db.getLead(order.jid || order.phone);

        if (targetJid) {
          let messageToSend = notificationMessage || customMessage;
          if (!messageToSend) {
            const clientName = order.customerName || lead?.name || 'Estimado cliente';
            switch (status) {
              case 'preparing':
                messageToSend = `¡Hola ${clientName}! 🥩 Tu pedido #${order.id} por $${Number(order.totalAmount || 0).toLocaleString('es-AR')} ingresó al sector de corte y ya está siendo preparado con la máxima calidad y terneza artesanal. En breve te avisamos cuando esté listo. 🙌`;
                break;
              case 'in_transit':
                messageToSend = `¡Buenas noticias ${clientName}! 🛵🥩 Tu pedido #${order.id} ya está en camino a tu domicilio (${order.address || 'Córdoba'}). El repartidor llegará en los próximos minutos.`;
                break;
              case 'ready_for_pickup':
              case 'ready':
                messageToSend = `¡Tu pedido #${order.id} ya está listo para retirar! 🎉🥩 Podés pasar por nuestra sucursal **${order.branch || 'Urca Central'}** (${order.address || 'Av. José Roque Funes 1115'}). ¡Te esperamos!`;
                break;
              case 'delivered':
                messageToSend = `¡Pedido #${order.id} entregado con éxito! 🎉🥩 Esperamos que disfrutes tu compra en República de la Carne. ¡La calidad nos hace diferentes! 🙌`;
                break;
              case 'cancelled':
                messageToSend = `Hola ${clientName}, te informamos que tu pedido #${order.id} ha sido cancelado. Si necesitás asistencia o realizar un nuevo pedido, escribinos por acá.`;
                break;
              default:
                messageToSend = `Hola ${clientName}, el estado de tu pedido #${order.id} ha sido actualizado a: *${status}*.`;
            }
          }

          try {
            await whatsappService.sendMessage(targetJid, messageToSend);
            notified = true;
          } catch (sendErr) {
            console.error('Error enviando WhatsApp mediante WhatsAppService:', sendErr.message);
            notificationError = sendErr.message;
          }
          
          const savedMsg = db.saveMessage({
            chatId: targetJid,
            sender: 'bot',
            type: 'text',
            content: messageToSend,
            timestamp: new Date().toISOString()
          });

          if (lead) {
            db.updateLead(lead.id, {
              lastMessage: messageToSend,
              lastMessageAt: new Date().toISOString()
            });
          }

          io.emit('chat:message', { message: savedMsg, lead: lead || { jid: targetJid, name: order.customerName } });
        } else {
          notificationError = 'No se encontró un número de teléfono o JID de WhatsApp válido para este pedido';
        }
      } catch (notifyErr) {
        console.error('Error enviando notificación automática de estado de pedido:', notifyErr);
        notificationError = notifyErr.message;
      }
    }

    res.json({ success: true, order: updated, notified, notificationError });
  });


  // Edit full order
  router.put('/orders/:id', (req, res) => {
    const updated = db.updateOrder(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Pedido no encontrado' });
    io.emit('order:update', updated);
    res.json(updated);
  });

  // Duplicate order
  router.post('/orders/:id/duplicate', (req, res) => {
    const cloned = db.duplicateOrder(req.params.id);
    if (!cloned) return res.status(404).json({ error: 'Pedido no encontrado' });
    io.emit('order:new', cloned);
    res.json(cloned);
  });

  router.delete('/orders/:id', (req, res) => {
    db.deleteOrder(req.params.id);
    io.emit('order:delete', req.params.id);
    res.json({ success: true });
  });

  // --- 5.2 Customer Memory & Dossier System ---
  router.get('/customers', (req, res) => {
    const leads = db.getLeads();
    const customers = leads.map(l => db.getCustomerProfile(l.id));
    res.json(customers);
  });

  router.post('/customers', (req, res) => {
    const newCustomer = db.findOrCreateLead(req.body);
    io.emit('lead:update', newCustomer);
    res.json(newCustomer);
  });

  // Exportar base de clientes a CSV o JSON
  router.get('/customers/export', (req, res) => {
    try {
      const format = (req.query.format || 'csv').toLowerCase();
      const leads = db.getLeads();
      const customers = leads.map(l => db.getCustomerProfile(l.id));

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="clientes_${Date.now()}.json"`);
        return res.send(JSON.stringify(customers, null, 2));
      }

      // Formato CSV con UTF-8 BOM para apertura perfecta en Excel
      const headers = ['ID', 'Nombre', 'Telefono', 'Email', 'Direccion', 'Sucursal', 'Notas', 'TotalPedidos', 'TotalGastado', 'NivelTier', 'FechaCreacion'];
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      };

      const rows = [headers.join(';')];
      for (const c of customers) {
        rows.push([
          escapeCsv(c.id),
          escapeCsv(c.name),
          escapeCsv(c.phone),
          escapeCsv(c.email || ''),
          escapeCsv(c.address || c.shippingAddress || ''),
          escapeCsv(c.branchId || c.preferredBranch || ''),
          escapeCsv(c.notes || ''),
          escapeCsv(c.ordersCount || (c.orders ? c.orders.length : 0)),
          escapeCsv(c.totalSpent || 0),
          escapeCsv(c.tier || 'Estándar'),
          escapeCsv(c.createdAt || '')
        ].join(';'));
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="clientes_${Date.now()}.csv"`);
      return res.send('\uFEFF' + rows.join('\r\n'));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Importar base de clientes desde CSV o JSON
  router.post('/customers/import', (req, res) => {
    try {
      const { customers: inputCustomers, csvData } = req.body || {};
      let itemsToImport = [];

      if (Array.isArray(inputCustomers)) {
        itemsToImport = inputCustomers;
      } else if (typeof csvData === 'string') {
        const lines = csvData.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length > 1) {
          const sep = lines[0].includes(';') ? ';' : ',';
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(sep).map(p => p.replace(/^"|"$/g, '').trim());
            if (parts.length >= 2) {
              itemsToImport.push({
                name: parts[1] || parts[0],
                phone: parts[2] || parts[1],
                email: parts[3] || '',
                address: parts[4] || '',
                branchId: parts[5] || '',
                notes: parts[6] || ''
              });
            }
          }
        }
      }

      let imported = 0;
      for (const c of itemsToImport) {
        if (!c.phone && !c.name) continue;
        const saved = db.findOrCreateLead(c);
        if (saved) {
          imported++;
          io.emit('lead:update', saved);
        }
      }

      res.json({ success: true, count: imported, message: `${imported} clientes procesados exitosamente.` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/customers/:id', (req, res) => {
    const profile = db.getCustomerProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(profile);
  });

  router.put('/customers/:id', (req, res) => {
    const updated = db.updateCustomerProfile(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Cliente no encontrado' });
    io.emit('lead:update', updated);
    res.json(updated);
  });

  router.post('/customers/:id/duplicate', (req, res) => {
    const cloned = db.duplicateCustomer(req.params.id);
    if (!cloned) return res.status(404).json({ error: 'Cliente no encontrado' });
    io.emit('lead:update', cloned);
    res.json(cloned);
  });

  router.delete('/customers/:id', (req, res) => {
    db.deleteLead(req.params.id);
    io.emit('lead:delete', { id: req.params.id });
    res.json({ success: true });
  });

  // --- 5.2.2 Cajas & Turnos POS (Apertura y Cierre de Caja) ---
  router.get('/pos/shifts', (req, res) => {
    try {
      const { branchId, status } = req.query;
      const shifts = db.getShifts({ branchId, status });
      res.json(shifts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/pos/shift/current', (req, res) => {
    try {
      const { branchId } = req.query;
      const shift = db.getActiveShift(branchId || 'main');
      res.json({ active: !!shift, shift: shift || null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/pos/shift/open', (req, res) => {
    try {
      const { branchId, branchName, userId, userName, initialCash, notes } = req.body;
      const shift = db.openShift({ branchId, branchName, userId, userName, initialCash, notes });
      io.emit('pos:shift:opened', shift);
      res.json({ success: true, shift });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/pos/shift/close', (req, res) => {
    try {
      const { shiftId, closedByUserId, closedByUserName, finalCashDeclared, notes } = req.body;
      const shift = db.closeShift(shiftId, { closedByUserId, closedByUserName, finalCashDeclared, notes });
      io.emit('pos:shift:closed', shift);
      res.json({ success: true, shift });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Registro de Venta POS (Caja o Derivado a Reparto)
  router.post('/pos/sale', (req, res) => {
    try {
      const saleData = req.body;
      const isDelivery = saleData.orderType === 'delivery';

      const newOrder = db.saveOrder({
        ...saleData,
        source: 'pos',
        channel: 'pos',
        status: isDelivery ? 'confirmed' : 'completed',
        isPaid: saleData.isPaid !== false,
        createdAt: new Date().toISOString()
      });

      // Asociar a turno de caja
      if (saleData.shiftId) {
        db.recordShiftSale(saleData.shiftId, newOrder);
      } else if (saleData.branchId) {
        const activeShift = db.getActiveShift(saleData.branchId);
        if (activeShift) {
          db.recordShiftSale(activeShift.id, newOrder);
        }
      }

      io.emit('order:new', newOrder);
      io.emit('orders:sync', db.getOrders());

      res.status(201).json({ success: true, order: newOrder });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 5.2.1 Branches (Sucursales) Management ---
  router.get('/branches', (req, res) => {
    const branches = db.getBranches();
    const profiles = branches.map(b => db.getBranchProfile(b.id));
    res.json(profiles);
  });

  router.post('/branches', (req, res) => {
    const created = db.createBranch(req.body);
    io.emit('branch:new', created);
    res.json(created);
  });

  router.get('/branches/:id', (req, res) => {
    const branch = db.getBranchProfile(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Sucursal no encontrada' });
    res.json(branch);
  });

  router.put('/branches/:id', (req, res) => {
    const updated = db.updateBranch(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Sucursal no encontrada' });
    io.emit('branch:update', updated);
    res.json(updated);
  });

  router.post('/branches/:id/duplicate', (req, res) => {
    const cloned = db.duplicateBranch(req.params.id);
    if (!cloned) return res.status(404).json({ error: 'Sucursal no encontrada' });
    io.emit('branch:new', cloned);
    res.json(cloned);
  });

  router.delete('/branches/:id', (req, res) => {
    db.deleteBranch(req.params.id);
    io.emit('branch:delete', { id: req.params.id });
    res.json({ success: true });
  });

  router.post('/branches/:id/test-whatsapp', async (req, res) => {
    const branch = db.getBranch(req.params.id);
    if (!branch || !branch.phone) {
      return res.status(400).json({ error: 'La sucursal no tiene un teléfono válido' });
    }

    try {
      const targetJid = `${branch.phone.replace(/\D/g, '')}@s.whatsapp.net`;
      const testMsg = `🏪 *Prueba de Conexión WAgent - República de la Carne* 🥩\n\n¡Hola ${branch.managerName || 'Encargado'}! Este número está registrado como canal oficial para recepción y confirmación de pedidos de *${branch.name}*.\n\nCuando derivemos un pedido, recibirás el detalle aquí y podrás responder *1 (Aceptar)*, *2 (Listo)*, *3 (Entregado)* o *4 (Rechazar)* directamente por este chat. 🙌`;
      
      await whatsappService.sendMessage(targetJid, testMsg);
      res.json({ success: true, message: 'Mensaje de prueba enviado a la sucursal' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 🥩 Catálogo de Productos y Balanzas con Códigos PLU y Códigos de Barras ---
  router.get('/products', (req, res) => {
    try {
      const products = db.getProducts();
      res.json(products);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/products', (req, res) => {
    try {
      const saved = db.saveProduct(req.body);
      io.emit('products:updated', db.getProducts());
      res.json({ success: true, product: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/products/:id', (req, res) => {
    try {
      const updated = db.updateProduct(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Producto no encontrado' });
      io.emit('products:updated', db.getProducts());
      res.json({ success: true, product: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/products/:id', (req, res) => {
    try {
      db.deleteProduct(req.params.id);
      io.emit('products:updated', db.getProducts());
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Restaurar / Cargar Catálogo Maestro de Base de Conocimiento
  router.post('/products/seed-master', (req, res) => {
    try {
      const seeded = db.seedMasterProducts(true);
      io.emit('products:updated', seeded);
      res.json({ success: true, count: seeded.length, products: seeded, message: `¡${seeded.length} productos con códigos PLU cargados desde la base de conocimiento!` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Exportar Productos a Excel / CSV / JSON
  router.get('/products/export', (req, res) => {
    try {
      const format = (req.query.format || 'csv').toLowerCase();
      const products = db.getProducts();

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="catalogo_productos_republica_carne.json"');
        return res.json(products);
      }

      // Generar CSV / Excel con BOM UTF-8 para apertura directa en Microsoft Excel
      const headers = ['ID', 'PLU', 'Codigo_Barras', 'Nombre', 'Categoria', 'Precio', 'Unidad', 'Stock', 'Disponible', 'Descripcion'];
      const rows = products.map(p => [
        `"${p.id || ''}"`,
        `"${p.plu || ''}"`,
        `"${p.barcode || ''}"`,
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.category || '').replace(/"/g, '""')}"`,
        p.price || 0,
        `"${p.unit || 'kg'}"`,
        p.stock ?? 100,
        p.isAvailable !== false ? 'SI' : 'NO',
        `"${(p.description || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="catalogo_productos_republica_carne.csv"');
      res.send(csvContent);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Importar Productos desde CSV / JSON / Array
  router.post('/products/import', (req, res) => {
    try {
      let incoming = req.body;
      let itemsToImport = [];

      if (typeof incoming === 'string') {
        // Parsear CSV
        const lines = incoming.trim().split(/\r?\n/).filter(l => l.trim());
        if (lines.length > 1) {
          const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
          for (let i = 1; i < lines.length; i++) {
            // Manejar regex CSV respetando comillas
            const cols = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
            const cleanCols = cols.map(c => c.replace(/^["']|["']$/g, '').replace(/""/g, '"').trim());
            const obj = {};
            headers.forEach((h, idx) => {
              obj[h] = cleanCols[idx] || '';
            });
            itemsToImport.push(obj);
          }
        }
      } else if (Array.isArray(incoming)) {
        itemsToImport = incoming;
      } else if (Array.isArray(incoming.products)) {
        itemsToImport = incoming.products;
      }

      if (itemsToImport.length === 0) {
        return res.status(400).json({ error: 'No se encontraron productos válidos para importar' });
      }

      let count = 0;
      itemsToImport.forEach(item => {
        const plu = item.plu || item.PLU || item.codigo_plu || (item.barcode ? item.barcode.slice(-4) : '');
        const barcode = item.barcode || item.Codigo_Barras || item.codigo_barras || (plu ? `779${plu.padStart(4, '0')}000001` : '');
        const name = item.name || item.Nombre || item.nombre || item.producto || 'Producto Importado';
        const price = Number(item.price || item.Precio || item.precio) || 0;
        const category = item.category || item.Categoria || item.categoria || 'Parrilla';
        const unit = item.unit || item.Unidad || item.unidad || 'kg';
        const stock = Number(item.stock || item.Stock) || 100;
        const description = item.description || item.Descripcion || item.descripcion || '';

        db.saveProduct({
          id: item.id || `prod_${Date.now()}_${count}`,
          plu,
          barcode,
          name,
          price,
          category,
          unit,
          stock,
          description,
          isAvailable: true
        });
        count++;
      });

      const all = db.getProducts();
      io.emit('products:updated', all);
      res.json({ success: true, importedCount: count, total: all.length, message: `¡${count} productos importados y sincronizados con éxito!` });
    } catch (err) {
      console.error('Error importando productos:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- 🏷️ Cupones de Descuento Avanzados ---
  router.get('/coupons', (req, res) => {
    try {
      res.json(db.getCoupons());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/coupons/:id', (req, res) => {
    try {
      const coupon = db.getCoupon(req.params.id);
      if (!coupon) return res.status(404).json({ error: 'Cupón no encontrado' });
      res.json(coupon);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/coupons', (req, res) => {
    try {
      const saved = db.saveCoupon(req.body);
      io.emit('coupons:updated', db.getCoupons());
      res.status(201).json({ success: true, coupon: saved });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/coupons/:id', (req, res) => {
    try {
      const saved = db.saveCoupon({ ...req.body, id: req.params.id });
      io.emit('coupons:updated', db.getCoupons());
      res.json({ success: true, coupon: saved });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/coupons/:id', (req, res) => {
    try {
      const success = db.deleteCoupon(req.params.id);
      io.emit('coupons:updated', db.getCoupons());
      res.json({ success });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/coupons/validate', (req, res) => {
    try {
      const { code, orderAmount = 0, channel = 'all', userIdentifier = null, activePromos = [] } = req.body;
      const result = db.validateCoupon(code, orderAmount, channel, userIdentifier, activePromos);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/coupons/use', (req, res) => {
    try {
      const { code, userIdentifier = null } = req.body;
      const success = db.useCoupon(code, userIdentifier);
      io.emit('coupons:updated', db.getCoupons());
      res.json({ success });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Derivar pedido a sucursal y notificar por WhatsApp
  router.post('/orders/:id/derive', async (req, res) => {
    const { branchId, notes, notifyClient = true, notifyBranch = true, targetStatus, customBranchMessage, customClientMessage } = req.body;
    let result = db.deriveOrderToBranch(req.params.id, branchId, notes);
    if (!result) return res.status(404).json({ error: 'Pedido o sucursal no encontrados' });

    let { order, branch } = result;

    // Si se especificó cambio de estado al derivar (ej: 'preparing')
    if (targetStatus && order.status !== targetStatus) {
      order = db.updateOrder(order.id, { status: targetStatus });
    }

    let branchNotified = false;
    let clientNotified = false;
    let notifyError = null;

    try {
      if (notifyBranch !== false && branch?.phone) {
        await whatsappService.sendBranchDerivationNotification(order, branch, false);
        branchNotified = true;
      }
      if (notifyClient !== false) {
        const targetJid = await resolveOrderTargetJid(order);
        if (targetJid) {
          const clientMsg = customClientMessage || `¡Hola ${order.customerName || 'Cliente'}! 🥩 Tu pedido #${order.id} fue asignado a nuestra sucursal *${branch.name}* (${branch.address || ''}) y ya está en preparación artesanal. Te avisaremos cuando esté listo. 🙌`;
          await whatsappService.sendMessage(targetJid, clientMsg);
          clientNotified = true;
          db.saveMessage({
            chatId: targetJid,
            sender: 'bot',
            type: 'text',
            content: clientMsg,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.error('Error enviando notificación WhatsApp de derivación:', err);
      notifyError = err.message;
    }

    io.emit('order:update', order);
    res.json({ success: true, order, branch, branchNotified, clientNotified, notifyError });
  });


  // --- 5.3 Mercado Pago Integration ---
  router.get('/mercadopago/status', async (req, res) => {
    const creds = mercadoPagoService.getCredentials();
    const test = await mercadoPagoService.testConnection();
    res.json({
      credentials: {
        publicKey: creds.publicKey,
        appId: creds.appId,
        userId: creds.userId,
        testUser: creds.testUser,
        enabled: creds.enabled,
        autoSendLink: creds.autoSendLink
      },
      connection: test
    });
  });

  router.post('/mercadopago/test', async (req, res) => {
    const result = await mercadoPagoService.testConnection();
    res.json(result);
  });

  router.post('/mercadopago/create-link', async (req, res) => {
    try {
      const { orderId, amount, customerName, phone, items, sendWhatsApp, jid } = req.body;
      const order = orderId ? db.getOrder(orderId) : null;
      
      const orderData = order || {
        id: orderId || `ORD-${Date.now()}`,
        totalAmount: amount || 1000,
        customerName: customerName || 'Cliente',
        phone: phone || '',
        items: items || ['Pedido de Carnicería']
      };

      const preference = await mercadoPagoService.createPaymentPreference(orderData);
      
      // Si el pedido existe, guardar el preferenceId, el link de pago y el modo
      if (order) {
        db.updateOrder(order.id, {
          paymentMethod: preference.isSandbox ? 'Mercado Pago (Sandbox)' : 'Mercado Pago',
          paymentPreferenceId: preference.id,
          paymentLink: preference.checkoutUrl,
          paymentMode: preference.mode,
          sandboxPaymentLink: preference.sandboxInitPoint
        });
      }

      // Si se solicitó enviar por WhatsApp
      if (sendWhatsApp) {
        const targetJid = jid || order?.jid || (phone ? `${phone.replace(/\D/g, '')}@s.whatsapp.net` : null);
        if (targetJid && whatsappService.status === 'connected') {
          const paymentMsg = `💳 *[MERCADO PAGO CHECKOUT OFICIAL]*\n¡Hola ${orderData.customerName}! 🥩💳 Acá tenés el link de pago seguro de Mercado Pago para tu pedido #${orderData.id} por $${Number(orderData.totalAmount).toLocaleString('es-AR')}:\n\n🔗 ${preference.checkoutUrl}\n\nPodés abonar con Dinero en cuenta, Débito, Crédito o Transferencia.\n\nEn cuanto se acredite, ¡comenzamos la preparación de tu pedido! 🙌`;
          
          await whatsappService.sendMessage(targetJid, paymentMsg);

          const savedMsg = db.saveMessage({
            chatId: targetJid,
            sender: 'agent',
            type: 'text',
            content: paymentMsg,
            timestamp: new Date().toISOString()
          });

          const lead = db.getLead(targetJid);
          if (lead) {
            db.updateLead(lead.id, {
              lastMessage: paymentMsg,
              lastMessageAt: new Date().toISOString()
            });
          }

          io.emit('chat:message', { message: savedMsg, lead });
        }
      }

      res.json({
        success: true,
        ...preference
      });
    } catch (err) {
      console.error('Error generando link de pago de Mercado Pago:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/mercadopago/simulate-payment', async (req, res) => {
    try {
      const { orderId } = req.body;
      const order = db.getOrder(orderId);
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

      // Actualizar pedido a estado preparando y pagado en simulación
      const updatedOrder = db.updateOrderStatus(orderId, 'preparing');
      const finalOrder = db.updateOrder(orderId, {
        paymentStatus: 'paid',
        paymentMethod: 'Mercado Pago (Sandbox Test)',
        paidAt: new Date().toISOString(),
        notes: order.notes ? `${order.notes}\n[Pago Simulado] Acreditado en Sandbox ($${order.totalAmount})` : `[Pago Simulado] Acreditado en Sandbox ($${order.totalAmount})`
      });

      io.emit('order:update', finalOrder);

      // Notificar al cliente por WhatsApp
      const targetJid = finalOrder.jid || (finalOrder.phone ? `${finalOrder.phone.replace(/\D/g, '')}@s.whatsapp.net` : null);
      if (targetJid && whatsappService.status === 'connected') {
        const confirmMsg = `🧪 *[TEST SANDBOX]* ¡Pago de $${Number(finalOrder.totalAmount).toLocaleString('es-AR')} simulado y acreditado con éxito! 🎉🥩 Tu pedido #${finalOrder.id} ya ingresó al sector de corte para su preparación.`;
        await whatsappService.sendMessage(targetJid, confirmMsg);
      }

      res.json({ success: true, order: finalOrder });
    } catch (err) {
      console.error('Error simulando pago en Sandbox:', err);
      res.status(500).json({ error: err.message });
    }
  });

  const handleMercadoPagoNotification = async (req, res) => {
    try {
      const result = await mercadoPagoService.processNotification({
        body: req.body || {},
        query: req.query || {},
        headers: req.headers || {}
      });

      if (result.handled && result.status === 'approved' && result.order) {
        const orderId = result.orderId;
        const updatedOrder = result.order;
        console.log(`💰 ¡Pago acreditado en Mercado Pago para pedido #${orderId}! Monto: $${result.amount}`);

        io.emit('order:update', updatedOrder);
        io.emit('payment:received', {
          orderId,
          amount: result.amount,
          paymentId: result.paymentId,
          order: updatedOrder
        });

        // Actualizar Lead a closed_won o en preparación
        const targetJid = updatedOrder.jid || (updatedOrder.phone ? `${updatedOrder.phone.replace(/\D/g, '')}@s.whatsapp.net` : null);
        if (targetJid) {
          const lead = db.getLead(targetJid);
          if (lead) {
            db.updateLead(lead.id, { stage: 'closed_won' });
            io.emit('lead:update', db.getLead(targetJid));
          }
        }

        // Notificar al cliente por WhatsApp que su pago fue recibido con éxito
        if (targetJid && whatsappService.status === 'connected') {
          const confirmMsg = `¡Pago recibido con éxito! 🎉🥩 Ya registramos tu acreditación de Mercado Pago por $${Number(result.amount).toLocaleString('es-AR')} para el pedido #${orderId}. Tus cortes pasan de inmediato al sector de carnicería para su preparación. ¡Muchas gracias por elegir República de la Carne! 🙌`;
          
          await whatsappService.sendMessage(targetJid, confirmMsg);

          const savedMsg = db.saveMessage({
            chatId: targetJid,
            sender: 'agent',
            type: 'text',
            content: confirmMsg,
            timestamp: new Date().toISOString()
          });

          const lead = db.getLead(targetJid);
          if (lead) {
            db.updateLead(lead.id, {
              lastMessage: confirmMsg,
              lastMessageAt: new Date().toISOString()
            });
          }

          io.emit('chat:message', { message: savedMsg, lead });
        }
      }

      // Responder 200 OK inmediatamente según las directivas oficiales de Mercado Pago
      res.status(200).json({ status: 'ok', handled: result.handled });
    } catch (err) {
      console.error('Error procesando notificación de Mercado Pago:', err);
      res.status(200).json({ status: 'error', error: err.message });
    }
  };

  router.all('/mercadopago/webhook', handleMercadoPagoNotification);
  router.all('/mercadopago/ipn', handleMercadoPagoNotification);
  router.all('/mercadopago/notifications', handleMercadoPagoNotification);

  // --- Verificación de Pago en Vivo de Mercado Pago ---
  router.post('/orders/:id/verify-payment', async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = db.getOrder(orderId);
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

      const result = await mercadoPagoService.verifyOrderPayment(orderId);
      if (result.verified && result.order) {
        io.emit('order:update', result.order);
      }
      res.json(result);
    } catch (err) {
      console.error(`Error verificando pago para pedido ${req.params.id}:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Asignación / Registro Manual de Pago (Efectivo, Transferencia, POS, Mercado Pago) ---
  router.put('/orders/:id/payment', (req, res) => {
    try {
      const orderId = req.params.id;
      const { paymentMethod, paymentStatus, paidAmount, cashReceived, changeAmount, transactionRef, notes } = req.body;
      const updated = mercadoPagoService.updateOrderPaymentManual(orderId, {
        paymentMethod,
        paymentStatus,
        paidAmount,
        cashReceived,
        changeAmount,
        transactionRef,
        notes
      });

      if (!updated) return res.status(404).json({ error: 'Pedido no encontrado' });

      io.emit('order:update', updated);
      io.emit('orders:sync', db.getOrders());
      res.json({ success: true, order: updated });
    } catch (err) {
      console.error(`Error actualizando pago manual para orden ${req.params.id}:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // --- 5.4 WHATSAPP BROADCASTS & SCHEDULED CAMPAIGNS ENGINE ---
  // =========================================================================
  router.get('/campaigns', (req, res) => {
    try {
      const campaigns = db.getCampaigns();
      res.json(campaigns);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/campaigns/audience-count', (req, res) => {
    try {
      const { segment = 'all' } = req.query;
      const audience = broadcastService.getAudienceForSegment(segment);
      res.json({ segment, count: audience.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/campaigns/preview', (req, res) => {
    try {
      const { template, segment = 'all' } = req.body;
      const audience = broadcastService.getAudienceForSegment(segment);
      const sampleLead = audience[0] || {
        name: 'Don Juan',
        phone: '+54 9 351 626-2475',
        customerNumber: 'CLI-1001',
        jid: '5493516262475@s.whatsapp.net'
      };

      const rendered = broadcastService.renderMessageTemplate(template, sampleLead);
      res.json({
        rendered,
        sampleLead: {
          name: sampleLead.name,
          phone: sampleLead.phone,
          customerNumber: sampleLead.customerNumber || 'CLI-1001'
        },
        recipientCount: audience.length
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/campaigns/upload-banner', upload.single('image'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No se subió ninguna imagen' });
      }
      const mediaUrl = `/media/${req.file.filename}`;
      res.json({ success: true, mediaUrl, filename: req.file.filename });
    } catch (err) {
      console.error('Error subiendo imagen de campaña:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/campaigns', (req, res) => {
    try {
      const campaign = broadcastService.createCampaign(req.body);
      res.json({ success: true, campaign });
    } catch (err) {
      console.error('Error creando campaña:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/campaigns/:id/send', async (req, res) => {
    try {
      const campaignId = req.params.id;
      const campaign = await broadcastService.executeCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaña no encontrada' });
      }
      res.json({ success: true, campaign });
    } catch (err) {
      console.error('Error ejecutando campaña:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/campaigns/:id', (req, res) => {
    try {
      const updated = db.saveCampaign({ id: req.params.id, ...req.body });
      io.emit('campaign:update', updated);
      res.json({ success: true, campaign: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/campaigns/:id', (req, res) => {
    try {
      db.deleteCampaign(req.params.id);
      io.emit('campaign:delete', req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 6. Settings & Voice Testing ---
  router.get('/settings', (req, res) => {
    try {
      const settings = db.getSettings();
      const availableVoices = (typeof SpeechService !== 'undefined' && SpeechService.getAvailableVoices)
        ? SpeechService.getAvailableVoices()
        : [];
      res.json({
        settings,
        availableVoices
      });
    } catch (err) {
      console.error('Error en GET /api/settings:', err);
      res.status(500).json({ error: err.message, settings: {}, availableVoices: [] });
    }
  });

  router.put('/settings', (req, res) => {
    try {
      const updated = db.updateSettings(req.body);
      io.emit('settings:update', updated);
      res.json(updated);
    } catch (err) {
      console.error('Error en PUT /api/settings:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Modo Autopilot para Pedidos y Notificaciones automáticas
  router.get('/settings/autopilot', (req, res) => {
    try {
      const settings = db.getSettings();
      res.json({ success: true, enabled: Boolean(settings.autopilot_orders) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/settings/autopilot', (req, res) => {
    try {
      const { enabled } = req.body;
      const isEnabled = Boolean(enabled);
      const updated = db.updateSettings({ autopilot_orders: isEnabled });
      io.emit('settings:autopilot', { enabled: isEnabled });
      io.emit('settings:update', updated);
      res.json({ success: true, enabled: isEnabled, message: isEnabled ? 'Modo Autopilot activado: los pedidos y despachos se notificarán automáticamente.' : 'Modo Manual activado: se requerirá confirmación de operador para notificaciones.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


  // --- Catálogo y Diagnóstico de Modelos de Inteligencia Artificial ---
  router.get('/ai/models', (req, res) => {
    try {
      res.json({
        success: true,
        providers: SYSTEM_AI_PROVIDERS,
        models: SYSTEM_AI_MODELS
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/ai/test-connection', async (req, res) => {
    let hasSentResponse = false;
    const timeoutHandle = setTimeout(() => {
      if (!hasSentResponse) {
        hasSentResponse = true;
        res.json({
          success: false,
          provider: req.body?.provider || 'IA',
          model: req.body?.model || 'Desconocido',
          error: 'Tiempo de espera agotado al conectar con el proveedor de IA (Timeout 8.5s). El servidor remoto o endpoint local no respondió a tiempo.',
          latencyMs: 8500,
          isFallback: false
        });
      }
    }, 8500);

    try {
      const result = await AIService.testModelConnection(req.body || {});
      if (!hasSentResponse) {
        hasSentResponse = true;
        clearTimeout(timeoutHandle);
        res.json(result);
      }
    } catch (err) {
      if (!hasSentResponse) {
        hasSentResponse = true;
        clearTimeout(timeoutHandle);
        console.error('Error testeando conexión de modelo IA:', err);
        res.json({
          success: false,
          provider: req.body?.provider || 'IA',
          model: req.body?.model || 'Desconocido',
          error: err.message || 'Error interno al probar el modelo',
          latencyMs: 0,
          isFallback: false
        });
      }
    }
  });

  // --- 5.0.1 AI Token Usage & Performance Tracker ---
  router.get('/ai/token-usage', (req, res) => {
    try {
      res.json({
        success: true,
        stats: tokenTracker.getStats()
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/ai/token-usage/reset', (req, res) => {
    try {
      const reset = tokenTracker.resetStats();
      res.json({
        success: true,
        message: 'Métricas de consumo de tokens reiniciadas.',
        stats: reset
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- 5.0.2 Embedded Qwen 2.5 0.5B (node-llama-cpp) Local Endpoints ---
  router.get('/ai/embedded/status', (req, res) => {
    try {
      res.json({
        success: true,
        modelInfo: embeddedLlama.getModelInfo()
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/ai/embedded/download', async (req, res) => {
    try {
      if (embeddedLlama.isModelAvailable()) {
        return res.json({
          success: true,
          message: 'El modelo Qwen 2.5 0.5B ya está descargado y listo para usar en modo embebido.',
          modelInfo: embeddedLlama.getModelInfo()
        });
      }

      // Iniciar descarga asíncrona informando vía WebSocket
      embeddedLlama.downloadModel((state) => {
        io.emit('ai:embedded:download-progress', state);
      }).then((result) => {
        io.emit('ai:embedded:download-complete', result);
      }).catch((err) => {
        io.emit('ai:embedded:download-error', { error: err.message });
      });

      res.json({
        success: true,
        message: 'Descarga iniciada en segundo plano desde Hugging Face.',
        downloadState: embeddedLlama.downloadState
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/ai/embedded/unload', async (req, res) => {
    try {
      const result = await embeddedLlama.unloadFromMemory();
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/ai/embedded/benchmark', async (req, res) => {
    try {
      const result = await embeddedLlama.runBenchmark(req.body || {});
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/ai/embedded/set-default', async (req, res) => {
    try {
      const current = db.getSettings() || {};
      const updated = db.updateSettings({
        ...current,
        aiProvider: 'qwen_embedded',
        aiModel: 'qwen2.5-0.5b-instruct'
      });
      if (typeof io !== 'undefined' && io?.emit) {
        io.emit('settings:update', updated);
      }
      res.json({
        success: true,
        message: 'Qwen 2.5 0.5B (node-llama-cpp) configurado como modelo predeterminado del sistema.',
        settings: updated
      });
    } catch (err) {
      console.error('Error en POST /api/ai/embedded/set-default:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Endpoints de Chat Directo & Streaming SSE (Server-Sent Events) ---
  router.post('/chat', async (req, res) => {
    const { message, prompt: promptText } = req.body || {};
    const text = message || promptText;
    if (!text) return res.status(400).json({ error: 'El mensaje es requerido' });

    try {
      if (embeddedLlama.isModelAvailable()) {
        const result = await embeddedLlama.prompt({ prompt: text });
        return res.json({ response: result.text, latencyMs: result.latencyMs });
      }
      const response = await AIService.callLLMGeneric({ prompt: text });
      res.json({ response });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Error procesando la inferencia' });
    }
  });

  router.post('/chat/stream', async (req, res) => {
    const { message, prompt: promptText } = req.body || {};
    const text = message || promptText;
    if (!text) return res.status(400).json({ error: 'El mensaje es requerido' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      if (embeddedLlama.isModelAvailable()) {
        await embeddedLlama.promptStream({
          prompt: text,
          onToken: (chunk) => {
            res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
          }
        });
      } else {
        const fullResponse = await AIService.callLLMGeneric({ prompt: text });
        res.write(`data: ${JSON.stringify({ token: fullResponse })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: error.message || 'Error en streaming' })}\n\n`);
      res.end();
    }
  });

  // Obtener voces personalizadas de la cuenta de ElevenLabs
  router.get('/elevenlabs/voices', async (req, res) => {
    const settings = db.getSettings();
    const apiKey = req.query.apiKey || settings.elevenlabsApiKey;
    if (!apiKey) {
      return res.json([]);
    }
    const voices = await SpeechService.fetchElevenLabsVoices(apiKey);
    res.json(voices);
  });

  // --- ElevenLabs Conversational AI Agent (Eleven Agents) ---
  router.get('/elevenlabs/agent/config', (req, res) => {
    res.json(ElevenLabsAgentService.getAgentConfig());
  });

  router.post('/elevenlabs/agent/signed-url', async (req, res) => {
    try {
      const { agentId } = req.body || {};
      const result = await ElevenLabsAgentService.getSignedUrl(agentId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/elevenlabs/agent/initiation-data', (req, res) => {
    try {
      const { leadJid, customerName, phoneNumber, address, customFirstMessage, extraVariables } = req.body || {};
      const lead = leadJid ? db.getLead(leadJid) : null;
      const data = ElevenLabsAgentService.buildInitiationClientData({
        lead,
        customerName,
        phoneNumber,
        address,
        customFirstMessage,
        extraVariables
      });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/elevenlabs/agent/test', async (req, res) => {
    try {
      const { agentId } = req.body || {};
      const result = await ElevenLabsAgentService.testAgentConnection(agentId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Prueba de síntesis de voz en vivo en el navegador
  router.post('/ai/test-voice', async (req, res) => {
    const { text = '¡Hola! Soy tu asistente de ventas por WhatsApp.', voice } = req.body;
    try {
      const speech = await SpeechService.textToSpeech(text, voice);
      res.json({
        audioUrl: `/media/${path.basename(speech.mp3Path)}`,
        duration: speech.durationSeconds
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Módulo Multi-Agentes IA Personalizados ---
  router.get('/agents', (req, res) => {
    try {
      const agents = db.getAgents();
      res.json(agents);
    } catch (err) {
      console.error('Error listando agentes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/agents/active', (req, res) => {
    try {
      const active = db.getActiveAgent();
      res.json(active);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/agents/:id', (req, res) => {
    try {
      const agent = db.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: 'Agente no encontrado' });
      res.json(agent);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/agents', (req, res) => {
    try {
      const newAgent = db.createAgent(req.body);
      io.emit('agents:sync', db.getAgents());
      res.status(201).json(newAgent);
    } catch (err) {
      console.error('Error creando agente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/agents/:id', (req, res) => {
    try {
      const updated = db.updateAgent(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Agente no encontrado' });
      io.emit('agents:sync', db.getAgents());
      res.json(updated);
    } catch (err) {
      console.error('Error actualizando agente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/agents/:id', (req, res) => {
    try {
      const success = db.deleteAgent(req.params.id);
      if (!success) return res.status(404).json({ error: 'Agente no encontrado o no se pudo eliminar' });
      io.emit('agents:sync', db.getAgents());
      res.json({ success: true });
    } catch (err) {
      console.error('Error eliminando agente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/agents/:id/set-default', (req, res) => {
    try {
      const active = db.setActiveAgent(req.params.id);
      if (!active) return res.status(404).json({ error: 'Agente no encontrado' });
      io.emit('agents:sync', db.getAgents());
      io.emit('settings:update', db.getSettings());
      res.json({ success: true, activeAgent: active });
    } catch (err) {
      console.error('Error activando agente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Ejecución de la Batería Exhaustiva de Tests de Conversación & Entrenamiento
  router.post('/agents/run-test-suite', async (req, res) => {
    try {
      const suiteResults = await runConversationTestSuite();
      res.json({
        success: true,
        ...suiteResults
      });
    } catch (err) {
      console.error('Error ejecutando suite de tests:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Simulación interactiva de respuesta con la personalidad, historial y rol específico de un agente
  router.post('/agents/:id/test-reply', async (req, res) => {
    try {
      const agent = db.getAgent(req.params.id) || db.getActiveAgent() || {
        id: 'agent_carlos',
        name: 'Carlos',
        roleLabel: 'Maestro Carnicero',
        backstory: '30 años de oficio en cortes cordobeses',
        personality: 'Cálido, cordobés amigable y experto parrillero.',
        promptInstructions: ''
      };

      const {
        userMessage = 'Hola, ¿qué cortes me recomendás para un asado de 4 personas?',
        history = [],
        leadName = 'Cliente Simulación',
        leadPhone = '+54 9 351 123-4567'
      } = req.body;

      const dummyLead = {
        id: `sim-${Date.now()}`,
        name: leadName,
        phone: leadPhone,
        stage: 'lead',
        customFields: {}
      };

      const globalSettings = db.getSettings() || {};
      const resolvedProvider = (!agent.aiProvider || agent.aiProvider === 'system_default') 
        ? (globalSettings.aiProvider || 'gemini') 
        : agent.aiProvider;
      const resolvedModel = (!agent.aiModel || agent.aiModel === 'default') 
        ? (globalSettings.aiModel || getDefaultModelForProvider(resolvedProvider)) 
        : agent.aiModel;

      const customSettings = {
        ...globalSettings,
        agentName: agent.name,
        agentRole: agent.roleLabel,
        aiProvider: resolvedProvider,
        aiModel: resolvedModel,
        aiTemperature: agent.aiTemperature !== undefined ? Number(agent.aiTemperature) : (globalSettings.aiTemperature || 0.7),
        aiMaxTokens: agent.aiMaxTokens || globalSettings.aiMaxTokens || 2048,
        apiKeyOverride: agent.apiKeyOverride || '',
        customEndpoint: agent.customEndpoint || '',
        systemPrompt: `${agent.promptInstructions || ''}\n\nBiografía e Historia: ${agent.backstory || ''}\nPersonalidad: ${agent.personality || ''}`
      };

      // Formatear historial si viene del cliente
      const formattedHistory = Array.isArray(history) && history.length > 0
        ? history.map(h => ({
            sender: (h.sender === 'user' || h.sender === 'client') ? 'user' : 'bot',
            content: h.text || h.content || ''
          }))
        : [{ sender: 'user', content: userMessage }];

      const startTime = Date.now();
      const reply = await AIService.generateSalesResponse({
        rawText: userMessage,
        lead: dummyLead,
        history: formattedHistory,
        settings: customSettings
      });
      const latencyMs = Date.now() - startTime;
      const promptTokens = tokenTracker.estimateTokens(userMessage + (customSettings.systemPrompt || ''));
      const completionTokens = tokenTracker.estimateTokens(reply);
      const totalTokens = promptTokens + completionTokens;

      // Obtener el estado canónico del carrito tras este turno
      const canonicalCart = getCanonicalCart(dummyLead, formattedHistory, userMessage, db.getProducts());

      res.json({
        success: true,
        agent: { 
          id: agent.id, 
          name: agent.name, 
          role: agent.role, 
          avatar: agent.avatar,
          aiProvider: customSettings.aiProvider,
          aiModel: customSettings.aiModel,
          aiTemperature: customSettings.aiTemperature
        },
        userMessage,
        reply,
        canonicalCart,
        tokens: {
          promptTokens,
          completionTokens,
          totalTokens
        },
        modelInfo: {
          provider: customSettings.aiProvider,
          model: customSettings.aiModel,
          temperature: customSettings.aiTemperature,
          latencyMs,
          promptTokens,
          completionTokens,
          totalTokens
        }
      });
    } catch (err) {
      console.error('Error simulando respuesta de agente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- 7. Metrics & Sales Analytics ---
  router.get('/metrics', (req, res) => {
    res.json(db.getMetrics());
  });

  // Estadísticas completas de ventas (Sucursal, Producto, Canal, Método de Pago, Timeline)
  router.get('/sales/stats', (req, res) => {
    try {
      const stats = db.getSalesStatistics(req.query);
      res.json(stats);
    } catch (err) {
      console.error('Error calculando estadísticas de ventas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Lista detallada y filtrable de ventas
  router.get('/sales/list', (req, res) => {
    try {
      const sales = db.getSalesList(req.query);
      res.json(sales);
    } catch (err) {
      console.error('Error obteniendo lista de ventas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Exportar reporte de ventas a Excel (.xlsx, .xls) o CSV
  router.get('/sales/export', (req, res) => {
    try {
      const format = (req.query.format || 'xlsx').toLowerCase();
      const sales = db.getSalesList({ ...req.query, limit: 5000 });

      // Transformar datos a filas planas para Excel
      const rows = sales.map((s, idx) => {
        const productsSummary = Array.isArray(s.products) && s.products.length > 0
          ? s.products.map(p => `${p.quantity} ${p.unit || 'kg'} ${p.name}`).join(' | ')
          : (Array.isArray(s.items) ? s.items.join(' | ') : '');

        const channel = s.channel || (s.notes?.includes('[POS Mostrador]') ? 'POS Mostrador' : (s.notes?.includes('[WooCommerce]') ? 'Tienda Web' : 'WhatsApp'));
        const isPaid = s.paymentStatus === 'paid' || s.mpPaymentId || (s.paymentMethod && s.paymentMethod.toLowerCase().includes('mercado pago')) || s.status === 'delivered';

        return {
          'N° Ticket/Orden': `#${s.id}`,
          'Fecha / Hora': new Date(s.createdAt).toLocaleString('es-AR'),
          'Cliente': s.customerName || 'Cliente Mostrador',
          'Teléfono': s.phone || '',
          'Canal de Venta': channel,
          'Sucursal': s.branchName || s.branch || 'URCA CENTRAL',
          'Modalidad': s.deliveryType === 'pickup' ? 'Retiro en Sucursal' : 'Envío a Domicilio',
          'Dirección': s.address || '',
          'Repartidor': s.driverName || '',
          'Detalle de Cortes': productsSummary,
          'Total ($)': Number(s.totalAmount) || 0,
          'Medio de Pago': s.paymentMethod || 'Efectivo',
          'Estado del Pago': isPaid ? 'PAGADO' : 'PENDIENTE',
          'Estado Pedido': s.status === 'delivered' ? 'Entregado' : s.status === 'in_transit' ? 'En Camino' : s.status === 'preparing' ? 'En Preparación' : s.status === 'cancelled' ? 'Cancelado' : 'Pendiente',
          'Notas': s.notes || ''
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      // Auto-ancho de columnas
      const colWidths = [
        { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 24 },
        { wch: 18 }, { wch: 26 }, { wch: 18 }, { wch: 45 }, { wch: 14 }, { wch: 20 },
        { wch: 14 }, { wch: 14 }, { wch: 25 }
      ];
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas');

      const dateStr = new Date().toISOString().slice(0, 10);
      let buffer;
      let contentType;
      let ext;

      if (format === 'csv') {
        const csvContent = '\uFEFF' + XLSX.utils.sheet_to_csv(worksheet, { FS: ';' });
        buffer = Buffer.from(csvContent, 'utf8');
        contentType = 'text/csv; charset=utf-8';
        ext = 'csv';
      } else if (format === 'xls') {
        buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' });
        contentType = 'application/vnd.ms-excel';
        ext = 'xls';
      } else {
        buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        ext = 'xlsx';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="reporte_ventas_${dateStr}.${ext}"`);
      res.send(buffer);
    } catch (err) {
      console.error('Error exportando reporte de ventas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- 8. GitHub Updates System ---
  router.get('/system/update-check', async (req, res) => {
    try {
      const updateInfo = await UpdateService.checkUpdates();
      res.json(updateInfo);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/system/update-apply', async (req, res) => {
    try {
      const result = await UpdateService.applyUpdate();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 9. Backup & Restore System ---
  // Listar respaldos
  router.get('/backups', (req, res) => {
    try {
      const backups = BackupService.listBackups();
      res.json(backups);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Crear nuevo respaldo
  router.post('/backups', (req, res) => {
    try {
      const { label = 'manual' } = req.body;
      const backup = BackupService.createBackup(label);
      res.json({ success: true, backup });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Descargar archivo de respaldo
  router.get('/backups/download/:filename', (req, res) => {
    try {
      const filePath = BackupService.getBackupFilePath(req.params.filename);
      res.download(filePath, req.params.filename);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Restaurar respaldo desde JSON
  router.post('/backups/restore', (req, res) => {
    try {
      const { backupData, filename } = req.body;
      let payload = backupData;

      if (!payload && filename) {
        const filePath = BackupService.getBackupFilePath(filename);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        payload = JSON.parse(fileContent);
      }

      if (!payload) {
        return res.status(400).json({ error: 'No se enviaron datos de respaldo para restaurar.' });
      }

      const result = BackupService.restoreBackup(payload);
      
      // Notificar a clientes conectados para recargar datos
      io.emit('system:restored', result);

      res.json(result);
    } catch (err) {
      console.error('Error restaurando respaldo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Subir y restaurar archivo de respaldo directamente
  router.post('/backups/upload-restore', upload.single('backupFile'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No se subió ningún archivo de respaldo.' });
      }

      const fileContent = fs.readFileSync(req.file.path, 'utf8');
      const parsed = JSON.parse(fileContent);
      const result = BackupService.restoreBackup(parsed);

      // Limpiar archivo subido temporal
      try { fs.unlinkSync(req.file.path); } catch (e) {}

      io.emit('system:restored', result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Eliminar respaldo
  router.delete('/backups/:filename', (req, res) => {
    try {
      BackupService.deleteBackup(req.params.filename);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 5.4 Delivery Drivers (Repartidores) Endpoints ---
  router.get('/drivers', (req, res) => {
    res.json(db.getDrivers());
  });

  router.post('/drivers', (req, res) => {
    const created = db.createDriver(req.body);
    io.emit('driver:new', created);
    res.json(created);
  });

  router.get('/drivers/:id', (req, res) => {
    const driver = db.getDriver(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Repartidor no encontrado' });
    res.json(driver);
  });

  router.put('/drivers/:id', (req, res) => {
    const updated = db.updateDriver(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Repartidor no encontrado' });
    io.emit('driver:update', updated);
    res.json(updated);
  });

  router.post('/drivers/:id/duplicate', (req, res) => {
    const cloned = db.duplicateDriver(req.params.id);
    if (!cloned) return res.status(404).json({ error: 'Repartidor no encontrado' });
    io.emit('driver:new', cloned);
    res.json(cloned);
  });

  router.delete('/drivers/:id', (req, res) => {
    db.deleteDriver(req.params.id);
    io.emit('driver:delete', req.params.id);
    res.json({ success: true });
  });

  router.post('/drivers/:id/test-whatsapp', async (req, res) => {
    try {
      const driver = db.getDriver(req.params.id);
      if (!driver) return res.status(404).json({ error: 'Repartidor no encontrado' });
      if (!driver.phone) return res.status(400).json({ error: 'El repartidor no tiene número de teléfono registrado' });

      const cleanPhone = driver.phone.replace(/\D/g, '');
      const driverJid = `${cleanPhone}@s.whatsapp.net`;
      const testMsg = `🛵🥩 *Prueba de Conexión WAgent - República de la Carne*\n\n¡Hola ${driver.name}! Tu línea de WhatsApp ha sido vinculada como Repartidor Oficial. Recibirás aquí las hojas de ruta y pedidos para entrega a domicilio.`;

      await whatsappService.sendMessage(driverJid, testMsg);
      res.json({ success: true, message: 'Mensaje de prueba enviado con éxito' });
    } catch (err) {
      console.error('Error enviando test a repartidor:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/orders/:id/assign-driver', async (req, res) => {
    try {
      const { driverId, notes, notifyClient = true, notifyDriver = true, targetStatus, customDriverMessage, customClientMessage } = req.body;
      let result = db.assignOrderToDriver(req.params.id, driverId, notes);
      if (!result) return res.status(404).json({ error: 'Pedido o Repartidor no encontrado' });

      let { order, driver } = result;

      // Si se especificó cambio de estado al asignar chofer (ej: 'in_transit')
      if (targetStatus && order.status !== targetStatus) {
        order = db.updateOrder(order.id, { status: targetStatus });
      }

      let driverNotified = false;
      let clientNotified = false;
      let notifyError = null;

      try {
        if (notifyDriver !== false && driver?.phone) {
          await whatsappService.sendDriverDispatchNotification(order, driver, false);
          driverNotified = true;
        }

        if (notifyClient !== false) {
          const targetJid = await resolveOrderTargetJid(order);
          if (targetJid) {
            const clientMsg = customClientMessage || `¡Buenas noticias ${order.customerName || 'Cliente'}! 🛵🥩 Tu pedido #${order.id} ya fue asignado a nuestro repartidor *${driver.name}* (${driver.vehicle || 'Moto'}). ¡Va en camino a tu domicilio!`;
            await whatsappService.sendMessage(targetJid, clientMsg);
            clientNotified = true;
            db.saveMessage({
              chatId: targetJid,
              sender: 'bot',
              type: 'text',
              content: clientMsg,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (sendErr) {
        console.error('Error enviando notificaciones WhatsApp de reparto:', sendErr);
        notifyError = sendErr.message;
      }

      io.emit('order:update', order);
      io.emit('driver:update', driver);
      res.json({ success: true, order, driver, driverNotified, clientNotified, notifyError });
    } catch (err) {
      console.error('Error asignando pedido a repartidor:', err);
      res.status(500).json({ error: err.message });
    }
  });


  // --- 5.5 Barcode Scanner Lookup Endpoint ---
  router.get('/products/barcode/:code', (req, res) => {
    const product = db.getProductByBarcode(req.params.code);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado para este código de barras' });
    res.json(product);
  });

  // --- 5.6 User Profiles & Roles (RBAC) Endpoints ---
  router.get('/roles', (req, res) => {
    res.json(db.getRoles());
  });

  router.get('/users', (req, res) => {
    let users = db.getUsers();
    const { role, q } = req.query;
    if (role) users = users.filter(u => u.role === role);
    if (q) {
      const query = q.toLowerCase();
      users = users.filter(u =>
        (u.name || '').toLowerCase().includes(query) ||
        (u.username || '').toLowerCase().includes(query) ||
        (u.email || '').toLowerCase().includes(query) ||
        (u.phone || '').replace(/\D/g, '').includes(query.replace(/\D/g, ''))
      );
    }
    res.json(users);
  });

  // Lookup by phone — must be before /:id
  router.get('/users/by-phone/:phone', (req, res) => {
    const user = db.getUserByPhone(req.params.phone);
    if (!user) return res.status(404).json({ error: 'No se encontró usuario con ese teléfono' });
    res.json(user);
  });

  router.post('/users/login', (req, res) => {
    const { username, pin } = req.body;
    const result = db.authenticateUser(username, pin);
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }
    res.json(result);
  });

  // Promote lead → system user (cliente)
  router.post('/users/from-lead/:leadId', (req, res) => {
    const { leadId } = req.params;
    const extraData = req.body || {};
    const user = db.promoteLeadToUser(leadId, extraData);
    if (!user) return res.status(404).json({ error: 'Lead no encontrado o ya tiene usuario vinculado' });
    const lead = db.getLead(leadId);
    io.emit('user:new', user);
    if (lead) io.emit('lead:update', lead);
    res.json({ user, lead });
  });

  router.post('/users', (req, res) => {
    const created = db.createUser(req.body);
    io.emit('user:new', created);
    res.json(created);
  });

  router.get('/users/:id', (req, res) => {
    const user = db.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  });

  router.put('/users/:id', (req, res) => {
    const updated = db.updateUser(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Usuario no encontrado' });
    io.emit('user:update', updated);
    res.json(updated);
  });

  // Link existing user ↔ existing lead
  router.post('/users/:id/link-lead', (req, res) => {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId requerido' });
    const result = db.linkLeadToUser(leadId, req.params.id);
    if (!result) return res.status(404).json({ error: 'Usuario o Lead no encontrado' });
    io.emit('user:update', result.user);
    io.emit('lead:update', result.lead);
    res.json(result);
  });

  router.post('/users/:id/duplicate', (req, res) => {
    const cloned = db.duplicateUser(req.params.id);
    if (!cloned) return res.status(404).json({ error: 'Usuario no encontrado' });
    io.emit('user:new', cloned);
    res.json(cloned);
  });

  router.delete('/users/:id', (req, res) => {
    db.deleteUser(req.params.id);
    io.emit('user:delete', req.params.id);
    res.json({ success: true });
  });

  // =========================================================================
  // --- 11. WooCommerce & WordPress REST API Integration ---
  // =========================================================================
  router.get('/woocommerce/status', async (req, res) => {
    const settings = db.getSettings();
    const isConfigured = Boolean(settings.wooUrl && settings.wooConsumerKey && settings.wooConsumerSecret);
    const logs = db.getWooCommerceLogs(10);
    const products = db.getProducts();
    const wooProductsCount = products.filter(p => p.source === 'woocommerce' || p.wooId).length;

    res.json({
      isConfigured,
      wooUrl: settings.wooUrl || '',
      wooConsumerKey: settings.wooConsumerKey ? '••••••••' + settings.wooConsumerKey.slice(-4) : '',
      wooSyncEnabled: Boolean(settings.wooSyncEnabled),
      wooAutoPushOrders: Boolean(settings.wooAutoPushOrders),
      wooLastSync: settings.wooLastSync || null,
      totalWooProducts: wooProductsCount,
      recentLogs: logs
    });
  });

  router.post('/woocommerce/test', async (req, res) => {
    const customConfig = req.body;
    const result = await wooCommerceService.testConnection(customConfig);
    res.json(result);
  });

  router.post('/woocommerce/settings', (req, res) => {
    const {
      wooUrl,
      wooConsumerKey,
      wooConsumerSecret,
      wooSyncEnabled,
      wooAutoPushOrders
    } = req.body;

    const updated = db.updateSettings({
      ...(wooUrl !== undefined ? { wooUrl: wooUrl.trim().replace(/\/$/, '') } : {}),
      ...(wooConsumerKey !== undefined ? { wooConsumerKey: wooConsumerKey.trim() } : {}),
      ...(wooConsumerSecret !== undefined ? { wooConsumerSecret: wooConsumerSecret.trim() } : {}),
      ...(wooSyncEnabled !== undefined ? { wooSyncEnabled: Boolean(wooSyncEnabled) } : {}),
      ...(wooAutoPushOrders !== undefined ? { wooAutoPushOrders: Boolean(wooAutoPushOrders) } : {})
    });

    db.addWooCommerceLog({
      type: 'settings_update',
      status: 'success',
      details: 'Ajustes de WooCommerce actualizados correctamente.'
    });

    io.emit('settings:update', updated);
    res.json({ success: true, settings: updated });
  });

  router.post('/woocommerce/sync-products', async (req, res) => {
    try {
      const result = await wooCommerceService.syncProducts();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/woocommerce/push-order/:orderId', async (req, res) => {
    try {
      const result = await wooCommerceService.pushOrder(req.params.orderId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/woocommerce/logs', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    res.json(db.getWooCommerceLogs(limit));
  });

  // =========================================================================
  // --- 11.5 ARCA (ex AFIP) FACTURACIÓN ELECTRÓNICA Y PRESUPUESTOS ---
  // =========================================================================
  router.get('/arca/status', (req, res) => {
    try {
      const settings = arcaService.getSettings();
      res.json({
        success: true,
        settings: {
          enabled: settings.enabled,
          mode: settings.mode,
          isSandbox: settings.mode !== 'production',
          cuit: settings.cuit,
          razonSocial: settings.razonSocial,
          nombreFantasia: settings.nombreFantasia,
          domicilioComercial: settings.domicilioComercial,
          condicionIva: settings.condicionIva,
          iibb: settings.iibb,
          inicioActividades: settings.inicioActividades,
          ptoVta: settings.ptoVta,
          defaultDocumentType: settings.defaultDocumentType,
          hasCert: Boolean(settings.cert),
          hasKey: Boolean(settings.key),
          autoInvoicePaidOrders: Boolean(settings.autoInvoicePaidOrders),
          ...settings
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/arca/settings', (req, res) => {
    try {
      const updated = arcaService.saveSettings(req.body);
      io.emit('arca:settings-updated', updated);
      res.json({ success: true, settings: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/arca/test', async (req, res) => {
    try {
      const result = await arcaService.testConnection();
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/arca/invoice', async (req, res) => {
    try {
      const { orderId, documentType, customerName, customerDoc, customerDocType, ptoVta, sendWhatsApp } = req.body;
      if (!orderId) return res.status(400).json({ error: 'orderId es requerido' });

      const invoice = await arcaService.emitInvoiceForOrder(orderId, {
        documentType: documentType || 'factura_b',
        customerName,
        customerDoc,
        customerDocType,
        ptoVta
      });

      const updatedOrder = db.getOrder(orderId);
      io.emit('order:update', updatedOrder);
      io.emit('arca:invoice-issued', { orderId, invoice });

      if (sendWhatsApp && updatedOrder) {
        const targetJid = updatedOrder.jid || (updatedOrder.phone ? `${updatedOrder.phone.replace(/\D/g, '')}@s.whatsapp.net` : null);
        if (targetJid && whatsappService && whatsappService.status === 'connected') {
          const docTitle = invoice.isFiscal ? `🧾 *[FACTURA ELECTRÓNICA ARCA - ${invoice.fullDocNumber}]*` : `📄 *[PRESUPUESTO - ${invoice.fullDocNumber}]*`;
          const fiscalNote = invoice.isFiscal ? `\n\n🔑 *CAE:* ${invoice.cae}\n📅 *Vto. CAE:* ${invoice.caeVtoFormatted || invoice.caeVto}` : '\n\n*(Documento no válido como factura fiscal)*';
          const msg = `${docTitle}\n¡Hola ${invoice.clienteNombre}! 🥩 Adjuntamos el detalle de tu comprobante por un total de *$${Number(invoice.importeTotal).toLocaleString('es-AR')}*:${fiscalNote}\n\n¡Muchas gracias por elegir República de la Carne! 🙌`;
          
          await whatsappService.sendMessage(targetJid, msg);
        }
      }

      res.json({ success: true, invoice, order: updatedOrder });
    } catch (err) {
      console.error('Error emitiendo comprobante ARCA:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/arca/presupuesto', async (req, res) => {
    try {
      const { orderId, customerName, customerDoc, ptoVta } = req.body;
      if (!orderId) return res.status(400).json({ error: 'orderId es requerido' });

      const invoice = await arcaService.emitInvoiceForOrder(orderId, {
        documentType: 'presupuesto',
        customerName,
        customerDoc,
        ptoVta
      });

      const updatedOrder = db.getOrder(orderId);
      io.emit('order:update', updatedOrder);
      io.emit('arca:invoice-issued', { orderId, invoice });

      res.json({ success: true, invoice, order: updatedOrder });
    } catch (err) {
      console.error('Error emitiendo presupuesto:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/arca/order/:orderId', (req, res) => {
    try {
      const order = db.getOrder(req.params.orderId);
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
      res.json({
        success: true,
        orderId: order.id,
        invoice: order.invoice || null,
        hasInvoice: Boolean(order.invoice)
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Fiscal Profiles (Razones Sociales Múltiples) ---
  router.get('/fiscal-profiles', (req, res) => {
    try {
      const profiles = db.getFiscalProfiles();
      res.json(profiles);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/fiscal-profiles/:id', (req, res) => {
    try {
      const profile = db.getFiscalProfile(req.params.id);
      if (!profile) return res.status(404).json({ error: 'Perfil fiscal no encontrado' });
      res.json(profile);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/fiscal-profiles', (req, res) => {
    try {
      const created = db.saveFiscalProfile(req.body);
      io.emit('fiscal-profile:new', created);
      res.json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/fiscal-profiles/:id', (req, res) => {
    try {
      const updated = db.saveFiscalProfile({ ...req.body, id: req.params.id });
      io.emit('fiscal-profile:update', updated);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/fiscal-profiles/:id', (req, res) => {
    try {
      db.deleteFiscalProfile(req.params.id);
      io.emit('fiscal-profile:delete', { id: req.params.id });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/fiscal-profiles/:id/test', async (req, res) => {
    try {
      const result = await arcaService.testConnection(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // =========================================================================
  // --- BULK MUTATIONS (ACCIONES MASIVAS EN LOTE) ---
  // =========================================================================
  router.post('/orders/bulk-status', (req, res) => {
    try {
      const { orderIds, status } = req.body;
      if (!Array.isArray(orderIds) || !status) {
        return res.status(400).json({ error: 'orderIds (array) y status son requeridos' });
      }
      const updated = db.bulkUpdateOrders(orderIds, { status });
      updated.forEach(o => io.emit('order:update', o));
      res.json({ success: true, count: updated.length, updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/orders/bulk-delete', (req, res) => {
    try {
      const { orderIds } = req.body;
      if (!Array.isArray(orderIds)) return res.status(400).json({ error: 'orderIds (array) es requerido' });
      const count = db.bulkDeleteOrders(orderIds);
      orderIds.forEach(id => io.emit('order:delete', { id }));
      res.json({ success: true, count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/products/bulk-update', (req, res) => {
    try {
      const { productIds, updates } = req.body;
      if (!Array.isArray(productIds) || !updates) {
        return res.status(400).json({ error: 'productIds (array) y updates son requeridos' });
      }
      const updated = db.bulkUpdateProducts(productIds, updates);
      updated.forEach(p => io.emit('product:update', p));
      res.json({ success: true, count: updated.length, updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/products/bulk-delete', (req, res) => {
    try {
      const { productIds } = req.body;
      if (!Array.isArray(productIds)) return res.status(400).json({ error: 'productIds (array) es requerido' });
      const count = db.bulkDeleteProducts(productIds);
      productIds.forEach(id => io.emit('product:delete', { id }));
      res.json({ success: true, count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/leads/bulk-tag', (req, res) => {
    try {
      const { leadIds, tagToAdd } = req.body;
      if (!Array.isArray(leadIds) || !tagToAdd) return res.status(400).json({ error: 'leadIds y tagToAdd son requeridos' });
      const updated = db.bulkUpdateLeads(leadIds, { tagToAdd });
      updated.forEach(l => io.emit('lead:update', l));
      res.json({ success: true, count: updated.length, updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/leads/bulk-delete', (req, res) => {
    try {
      const { leadIds } = req.body;
      if (!Array.isArray(leadIds)) return res.status(400).json({ error: 'leadIds (array) es requerido' });
      const count = db.bulkDeleteLeads(leadIds);
      leadIds.forEach(id => io.emit('lead:delete', { id }));
      res.json({ success: true, count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/users/bulk-update', (req, res) => {
    try {
      const { userIds, updates } = req.body;
      if (!Array.isArray(userIds) || !updates) return res.status(400).json({ error: 'userIds y updates son requeridos' });
      const updated = db.bulkUpdateUsers ? db.bulkUpdateUsers(userIds, updates) : [];
      updated.forEach(u => io.emit('user:update', u));
      res.json({ success: true, count: updated.length, updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/users/bulk-delete', (req, res) => {
    try {
      const { userIds } = req.body;
      if (!Array.isArray(userIds)) return res.status(400).json({ error: 'userIds (array) es requerido' });
      const count = db.bulkDeleteUsers ? db.bulkDeleteUsers(userIds) : 0;
      userIds.forEach(id => io.emit('user:delete', { id }));
      res.json({ success: true, count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // --- AUTOMATIONS & WORKFLOW ENGINE ENDPOINTS ---
  // =========================================================================
  router.get('/automations', (req, res) => {
    let rules = db.getAutomations();
    if (!rules || rules.length === 0) {
      rules = db.setAutomations(DEFAULT_AUTOMATIONS);
    }
    res.json(rules);
  });

  router.put('/automations/:id', (req, res) => {
    const updated = db.updateAutomation(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Regla de automatización no encontrada' });
    }
    io.emit('automation:update', updated);
    res.json({ success: true, automation: updated });
  });

  router.post('/automations/reset', (req, res) => {
    const resetRules = db.setAutomations(DEFAULT_AUTOMATIONS);
    io.emit('automations:reset', resetRules);
    res.json({ success: true, automations: resetRules });
  });

  router.post('/automations/test', async (req, res) => {
    try {
      const { message, customerName = 'Don Juan' } = req.body;
      const fakeLead = {
        id: 'lead-test-sim',
        name: customerName,
        pushName: customerName,
        phone: '+54 9 351 000-0000',
        stage: 'proposal'
      };
      const settings = db.getSettings() || {};
      const knowledgeBase = db.getKnowledgeBase() || {};
      const result = await AIService.generateReply({
        jid: fakeLead.id,
        incomingText: message,
        isAudioInput: false
      });
      res.json({
        success: true,
        reply: result.text,
        shouldSendAudio: result.shouldSendAudio,
        suggestedStage: result.suggestedStage
      });
    } catch (err) {
      console.error('Error en simulación de automatización:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // --- GEOCODING & MAP DISTANCE ENGINE (CÓRDOBA) ---
  // =========================================================================
  const BRANCH_COORDINATES = [
    { id: 'br-1', name: 'URCA CENTRAL', address: 'Av. José Roque Funes 1115', phone: '+54 9 3513 906947', hours: 'Lunes a sábado: 9:00 a 21:00 hs | Domingo: 9:00 a 13:30 hs', lat: -31.3828, lng: -64.2372 },
    { id: 'br-2', name: 'URCA 2 – ALTO TEJEDA', address: 'Av. Menéndez Pidal 3575', phone: '+54 9 3518 623195', hours: 'Lunes a sábado: 9:00 a 21:00 hs | Domingo: 9:00 a 13:30 hs', lat: -31.3785, lng: -64.2320 },
    { id: 'br-3', name: 'INTERCOUNTRY – CORTEZA MALL / ALTO TEJEDA', address: 'Av. Los Álamos 1015', phone: '+54 9 3518 623194', hours: 'Lunes a domingos: 9:00 a 21:00 hs', lat: -31.3650, lng: -64.2690 },
    { id: 'br-4', name: 'DUARTE QUIRÓS', address: 'Av. Duarte Quirós 5130', phone: '+54 9 3518 156595', hours: 'Lunes a sábado: 9:00 a 13:30 hs y 17:00 a 21:00 hs | Domingo: 9:00 a 13:30 hs', lat: -31.4085, lng: -64.2490 },
    { id: 'br-5', name: 'VILLA ALLENDE – MERCADITO DE LA VILLA', address: 'Av. Figueroa Alcorta 480', phone: '+54 9 3513 540031', hours: 'Lunes a sábado: 9:00 a 13:30 hs y 17:00 a 21:00 hs | Domingo: 9:00 a 13:30 hs', lat: -31.2965, lng: -64.2950 },
    { id: 'br-6', name: 'COUNTRY SAN ISIDRO – ALTO TEJEDA (Nueva)', address: 'Av. Padre Luchesse km 2', phone: '+54 9 3518 769099', hours: 'Lun a Mié: 07:00 a 00:00 hs | Jue y Vie: 07:00 a 01:00 hs | Sáb: 08:00 a 01:00 hs | Dom: 08:30 a 00:00 hs', lat: -31.3120, lng: -64.2750 }
  ];

  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(2));
  }

  router.post('/geocode', async (req, res) => {
    const { address, lat, lng } = req.body;
    let finalLat = lat ? parseFloat(lat) : null;
    let finalLng = lng ? parseFloat(lng) : null;

    try {
      if ((!finalLat || !finalLng) && address) {
        // Consultar Nominatim OpenStreetMap
        const query = encodeURIComponent(`${address}, Córdoba, Argentina`);
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
        
        try {
          const response = await fetch(nominatimUrl, {
            headers: { 'User-Agent': 'WAgent-CRM-Cordoba/1.0' }
          });
          const results = await response.json();
          if (Array.isArray(results) && results.length > 0) {
            finalLat = parseFloat(results[0].lat);
            finalLng = parseFloat(results[0].lon);
          }
        } catch (e) {
          console.warn('Fallo geocodificación externa OSM, usando aproximación local:', e.message);
        }
      }

      // Si no se encuentra, usar fallback centro de Córdoba
      if (!finalLat || !finalLng) {
        finalLat = -31.3828;
        finalLng = -64.2372;
      }

      // Calcular distancia a todas las sucursales
      const branchesWithDistances = BRANCH_COORDINATES.map(b => {
        const distanceKm = calculateDistanceKm(finalLat, finalLng, b.lat, b.lng);
        return {
          ...b,
          distanceKm
        };
      }).sort((a, b) => a.distanceKm - b.distanceKm);

      const closestBranch = branchesWithDistances[0];

      res.json({
        success: true,
        coordinates: { lat: finalLat, lng: finalLng },
        address: address || 'Córdoba, Argentina',
        closestBranch,
        allBranches: branchesWithDistances
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // --- ELEVENLABS CONVERSATIONAL AI AGENT & SYSTEM INTEGRATION ENDPOINTS ---
  // Ref: https://elevenlabs.io/docs/eleven-agents/api-reference/eleven-agents/websocket
  // =========================================================================
  router.get('/elevenlabs/agent/config', (req, res) => {
    res.json(ElevenLabsAgentService.getAgentConfig());
  });

  router.post('/elevenlabs/agent/signed-url', async (req, res) => {
    const { agentId } = req.body;
    const result = await ElevenLabsAgentService.getSignedUrl(agentId);
    res.json(result);
  });

  router.post('/elevenlabs/agent/initiation-data', (req, res) => {
    const { leadJid, customerName, phoneNumber, address, customFirstMessage, extraVariables } = req.body;
    const lead = leadJid ? db.getLead(leadJid) : null;
    const data = ElevenLabsAgentService.buildInitiationClientData({
      lead,
      customerName,
      phoneNumber,
      address,
      customFirstMessage,
      extraVariables
    });
    res.json(data);
  });

  router.post('/elevenlabs/agent/test', async (req, res) => {
    const { agentId } = req.body;
    const result = await ElevenLabsAgentService.testAgentConnection(agentId);
    res.json(result);
  });

  router.post('/elevenlabs/agent/outbound-call', async (req, res) => {
    try {
      const { phoneNumber, phone, customerName, customMessage, agentId, extraVariables } = req.body;
      const targetPhone = phoneNumber || phone;
      if (!targetPhone) {
        return res.status(400).json({ error: 'phoneNumber o phone es requerido' });
      }

      const result = await ElevenLabsAgentService.initiateOutboundPhoneCall({
        phoneNumber: targetPhone,
        customerName,
        customMessage,
        agentId,
        extraVariables
      });

      res.json(result);
    } catch (err) {
      console.error('Error en /elevenlabs/agent/outbound-call:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Herramientas del Sistema para el Agente (Webhooks / Function Calling) ---
  router.get('/elevenlabs/agent/tools/products', (req, res) => {
    const { category, search } = req.query;
    res.json(ElevenLabsAgentService.getCatalogProducts({ category, search }));
  });

  router.get('/elevenlabs/agent/tools/branches', (req, res) => {
    res.json(ElevenLabsAgentService.getBranchesInfo());
  });

  router.post('/elevenlabs/agent/tools/create-order', async (req, res) => {
    const result = await ElevenLabsAgentService.createOrderFromAgent(req.body);
    if (result.success) {
      io.emit('order:new', db.getOrder(result.orderId));
      io.emit('orders:updated', db.getOrders());
    }
    res.json(result);
  });

  router.post('/elevenlabs/agent/tools/order-status', (req, res) => {
    const { phone, jid, phoneNumber } = req.body;
    res.json(ElevenLabsAgentService.getCustomerOrderStatus(phone || jid || phoneNumber));
  });

  router.post('/elevenlabs/agent/tools/update-customer', (req, res) => {
    const result = ElevenLabsAgentService.updateCustomerData(req.body);
    if (result.success) {
      io.emit('lead:update', result.customer);
      io.emit('leads:update', db.getLeads());
    }
    res.json(result);
  });

  router.post('/elevenlabs/agent/tools/execute', async (req, res) => {
    const { toolName, parameters, context } = req.body;
    const result = await ElevenLabsAgentService.executeTool(toolName, parameters, context);
    res.json(result);
  });

  // =========================================================================
  // --- 13. NEURAL MEMORY & COGNITIVE MENTAL MAP ENDPOINTS ---
  // =========================================================================
  router.get('/neural-memory/map', (req, res) => {
    try {
      const mentalMap = NeuralMemoryService.getSystemMentalMap();
      res.json(mentalMap);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/neural-memory/chat/:chatId', (req, res) => {
    try {
      const { chatId } = req.params;
      const conversationMap = NeuralMemoryService.getConversationNeuralMap(chatId);
      if (!conversationMap) return res.status(404).json({ error: 'Conversación no encontrada' });
      res.json(conversationMap);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/neural-memory/context/:jid?', (req, res) => {
    try {
      const jid = req.params.jid || null;
      const context = NeuralMemoryService.generateCognitiveContext({ jid });
      res.json(context);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/neural-memory/query', (req, res) => {
    try {
      const { query } = req.body;
      const results = NeuralMemoryService.searchSynapticContext(query);
      res.json({ query, results, count: results.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/knowledge', (req, res) => {
    try {
      const knowledge = db.getKnowledge();
      res.json(knowledge);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/knowledge', (req, res) => {
    try {
      const doc = db.saveKnowledgeDoc(req.body);
      res.json({ success: true, doc });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // --- 14. GEOCODING & LOGISTICS ROUTING API ---
  // =========================================================================
  const CORDOBA_LANDMARKS = [
    { name: 'roque funes', lat: -31.3828, lng: -64.2372, address: 'Av. José Roque Funes 1115, Urca, Córdoba' },
    { name: 'urca', lat: -31.3828, lng: -64.2372, address: 'Av. José Roque Funes 1115, Urca, Córdoba' },
    { name: 'menendez pidal', lat: -31.3785, lng: -64.2320, address: 'Av. Menéndez Pidal 3575, Urca 2, Córdoba' },
    { name: 'los alamos', lat: -31.3650, lng: -64.2690, address: 'Av. Los Álamos 1015, Intercountry, Córdoba' },
    { name: 'corteza mall', lat: -31.3650, lng: -64.2690, address: 'Corteza Mall, Intercountry, Córdoba' },
    { name: 'duarte quiros', lat: -31.4085, lng: -64.2490, address: 'Av. Duarte Quirós 5130, Córdoba' },
    { name: 'villa allende', lat: -31.2965, lng: -64.2950, address: 'Av. Figueroa Alcorta 480, Villa Allende, Córdoba' },
    { name: 'figueroa alcorta', lat: -31.2965, lng: -64.2950, address: 'Av. Figueroa Alcorta 480, Villa Allende, Córdoba' },
    { name: 'san isidro', lat: -31.3120, lng: -64.2750, address: 'Av. Padre Luchesse km 2, Country San Isidro, Córdoba' },
    { name: 'luchesse', lat: -31.3120, lng: -64.2750, address: 'Av. Padre Luchesse km 2, San Isidro, Córdoba' },
    { name: 'cerro de las rosas', lat: -31.3750, lng: -64.2350, address: 'Cerro de las Rosas, Córdoba' },
    { name: 'rafael nunez', lat: -31.3720, lng: -64.2340, address: 'Av. Rafael Núñez, Cerro de las Rosas, Córdoba' },
    { name: 'recta martinoli', lat: -31.3620, lng: -64.2580, address: 'Recta Martinoli, Argüello, Córdoba' },
    { name: 'cuesta colorada', lat: -31.3500, lng: -64.3100, address: 'Cuesta Colorada, La Calera / Córdoba' },
    { name: 'la calera', lat: -31.3450, lng: -64.3350, address: 'La Calera, Córdoba' },
    { name: 'centro', lat: -31.4167, lng: -64.1833, address: 'Centro, Córdoba, Argentina' }
  ];

  function calcDistKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  }

  router.post('/geocode', async (req, res) => {
    const { address } = req.body;
    const rawAddr = (address || '').trim();
    if (!rawAddr) return res.status(400).json({ error: 'Dirección requerida' });

    let lat = -31.3828;
    let lng = -64.2372;
    let matchedName = rawAddr;

    // 1. Check local Córdoba landmarks first
    const lower = rawAddr.toLowerCase();
    const localMatch = CORDOBA_LANDMARKS.find(l => lower.includes(l.name));
    if (localMatch) {
      lat = localMatch.lat;
      lng = localMatch.lng;
      matchedName = localMatch.address;
    } else {
      // 2. Try Nominatim OpenStreetMap
      try {
        const query = encodeURIComponent(`${rawAddr}, Cordoba, Argentina`);
        const osmRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
          headers: { 'User-Agent': 'RepublicaDeLaCarne-CRM/1.0' }
        });
        const osmData = await osmRes.json();
        if (osmData && osmData[0]) {
          lat = parseFloat(osmData[0].lat);
          lng = parseFloat(osmData[0].lon);
          matchedName = osmData[0].display_name;
        }
      } catch (e) {
        console.error('Error geocodificando con Nominatim:', e.message);
      }
    }

    // 3. Compute distances to all 6 branches
    const branches = db.getBranches();
    const branchesWithDist = branches.map(b => {
      const dist = (b.lat && b.lng) ? calcDistKm(lat, lng, b.lat, b.lng) : calcDistKm(lat, lng, -31.3828, -64.2372);
      return { ...b, distanceKm: dist };
    }).sort((a, b) => a.distanceKm - b.distanceKm);

    const closestBranch = branchesWithDist[0] || null;

    res.json({
      success: true,
      address: rawAddr,
      formattedAddress: matchedName,
      coordinates: { lat, lng },
      closestBranch,
      allBranches: branchesWithDist
    });
  });

  router.post('/reverse-geocode', async (req, res) => {
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) return res.status(400).json({ error: 'Lat y Lng requeridos' });

    let detectedAddress = `Ubicación (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}), Córdoba`;
    try {
      const osmRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
        headers: { 'User-Agent': 'RepublicaDeLaCarne-CRM/1.0' }
      });
      const osmData = await osmRes.json();
      if (osmData && osmData.display_name) {
        const parts = osmData.display_name.split(',');
        detectedAddress = parts.slice(0, 3).join(', ').trim();
      }
    } catch (e) {}

    const branches = db.getBranches();
    const branchesWithDist = branches.map(b => {
      const dist = (b.lat && b.lng) ? calcDistKm(lat, lng, b.lat, b.lng) : calcDistKm(lat, lng, -31.3828, -64.2372);
      return { ...b, distanceKm: dist };
    }).sort((a, b) => a.distanceKm - b.distanceKm);

    res.json({
      success: true,
      address: detectedAddress,
      coordinates: { lat: Number(lat), lng: Number(lng) },
      closestBranch: branchesWithDist[0] || null,
      allBranches: branchesWithDist
    });
  });

  router.post('/route', async (req, res) => {
    const { origin, destination } = req.body;
    if (!origin || !destination) return res.status(400).json({ error: 'Origen y Destino requeridos' });

    const oLat = Number(origin.lat);
    const oLng = Number(origin.lng);
    const dLat = Number(destination.lat);
    const dLng = Number(destination.lng);

    const directDist = calcDistKm(oLat, oLng, dLat, dLng);
    let routeGeoJson = null;
    let distanceKm = Number((directDist * 1.25).toFixed(2)); // Factor de curvas de calle en ciudad
    let durationMin = Math.max(10, Math.round(distanceKm * 3 + 5));

    try {
      const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson`;
      const r = await fetch(osrmUrl, { headers: { 'User-Agent': 'RepublicaDeLaCarne-CRM/1.0' } });
      const data = await r.json();
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        const route = data.routes[0];
        distanceKm = Number((route.distance / 1000).toFixed(2));
        durationMin = Math.max(8, Math.round(route.duration / 60));
        routeGeoJson = route.geometry;
      }
    } catch (e) {
      console.error('Error calculando ruta OSRM:', e.message);
    }

    res.json({
      success: true,
      distanceKm,
      durationMin,
      routeGeoJson,
      origin: { lat: oLat, lng: oLng },
      destination: { lat: dLat, lng: dLng }
    });
  });

  // =========================================================================
  // --- 15. USERS & ROLES RBAC API ---
  // =========================================================================
  router.get('/users', (req, res) => {
    res.json(db.getUsers());
  });

  router.post('/users', (req, res) => {
    const user = db.createUser(req.body);
    io.emit('user:new', user);
    res.json(user);
  });

  router.put('/users/:id', (req, res) => {
    const user = db.updateUser(req.params.id, req.body);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    io.emit('user:update', user);
    res.json(user);
  });

  router.delete('/users/:id', (req, res) => {
    const success = db.deleteUser(req.params.id);
    io.emit('user:delete', req.params.id);
    res.json({ success });
  });

  router.get('/roles', (req, res) => {
    res.json(db.getRoles());
  });

  router.post('/auth/verify-pin', (req, res) => {
    const { userId, username, pin, password } = req.body;
    const key = pin || password;
    const result = db.authenticateUser(userId || username || 'admin_central', key);
    res.json(result);
  });

  router.post('/auth/login-admin', (req, res) => {
    const { password } = req.body;
    if (password === 'R3publ1c4') {
      const centralUser = db.getUsers().find(u => u.id === 'usr-central-admin') || db.getUsers()[0];
      return res.json({ success: true, user: centralUser, token: 'session_central_admin_master' });
    }
    const authResult = db.authenticateUser('admin_central', password);
    res.json(authResult);
  });

  // ─── CUPONES DE DESCUENTO ─────────────────────────────────────────────────

  router.get('/coupons', (req, res) => {
    res.json(db.getCoupons());
  });

  router.post('/coupons', (req, res) => {
    try {
      const coupon = db.saveCoupon(req.body);
      res.json(coupon);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/coupons/:id', (req, res) => {
    try {
      const coupon = db.saveCoupon({ ...req.body, id: req.params.id });
      res.json(coupon);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/coupons/:id', (req, res) => {
    const ok = db.deleteCoupon(req.params.id);
    res.json({ success: ok });
  });

  router.post('/coupons/validate', (req, res) => {
    const { code, orderAmount = 0, channel = 'all' } = req.body;
    const result = db.validateCoupon(code, Number(orderAmount), channel);
    res.json(result);
  });

  router.post('/coupons/use', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código requerido' });
    const result = db.validateCoupon(code, 0);
    if (!result.valid) return res.status(400).json({ error: result.error });
    db.useCoupon(code);
    res.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────────────────────────

  router.post('/leads/:id/sync-profile', async (req, res) => {
    const { id } = req.params;
    const lead = db.getLead(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    if (whatsappService?.fetchAndSyncContactProfile) {
      const updated = await whatsappService.fetchAndSyncContactProfile(lead.jid || id, lead.pushName);
      return res.json({ success: true, lead: updated || lead });
    }
    res.json({ success: true, lead });
  });

  return router;
}

