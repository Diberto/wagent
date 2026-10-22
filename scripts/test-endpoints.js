import http from 'http';
import express from 'express';
import { createApiRouter } from '../server/routes/api.js';
import { analyticsRouter } from '../server/routes/analyticsRoutes.js';
import { createExternalApiRouter, setupMcpHttpEndpoints } from '../server/routes/externalApi.js';
import { db } from '../server/services/database.js';

const app = express();
app.use(express.json());

// Mock socket.io
const mockIo = {
  emit: () => {},
  on: () => {}
};
const mockWhatsapp = {
  getStatus: () => ({ status: 'connected' }),
  getAllSessionsStatus: () => []
};

app.use('/api', createApiRouter(mockWhatsapp, mockIo));
app.use('/api/analytics', analyticsRouter);
app.use('/api/v1/external', createExternalApiRouter());
setupMcpHttpEndpoints(app);

const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log(`🧪 Test server running on port ${port}`);

  async function check(url, options = {}) {
    const res = await fetch(`http://localhost:${port}${url}`, options);
    const contentType = res.headers.get('content-type') || '';
    let body;
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    return { status: res.status, ok: res.ok, body, contentType };
  }

  try {
    // 1. Health checks
    const h1 = await check('/api/v1/external/health');
    console.log('✓ /api/v1/external/health:', h1.status, h1.body.status);

    // 2. MCP info
    const mcp = await check('/mcp/info');
    console.log('✓ /mcp/info:', mcp.status, mcp.body.name);

    // 3. Analytics enhanced stats
    const stats = await check('/api/analytics/enhanced-stats');
    console.log('✓ /api/analytics/enhanced-stats:', stats.status, stats.body.success, 'Hourly sample:', stats.body.data?.hourlyDistribution?.[12]);

    // 4. Analytics custom report
    const report = await check('/api/analytics/custom-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportType: 'sales_by_cut' })
    });
    console.log('✓ /api/analytics/custom-report (sales_by_cut):', report.status, report.body.success, 'Title:', report.body.report?.title);

    // 5. Customer template Excel download
    const tpl = await check('/api/customers/template');
    console.log('✓ /api/customers/template:', tpl.status, tpl.contentType, 'Content-Length:', tpl.body.length);

    // 6. Customer import test
    const imp = await check('/api/customers/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customers: [
          {
            "Nombre Completo": "Test QA Automatizado",
            "Teléfono / WhatsApp": "+54 9 351 999-0011",
            "Email": "qa.test@republica.com",
            "Dirección": "Av. Colón 1000",
            "Sucursal": "Casa Central",
            "Puntos Iniciales": 120
          }
        ]
      })
    });
    console.log('✓ /api/customers/import:', imp.status, imp.body.success, imp.body.message);

    console.log('\n🎉 ALL FULLSTACK SYSTEM TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
