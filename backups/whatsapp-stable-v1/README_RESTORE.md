# Respaldo Inmutable del Sistema Estable de Conexión de WhatsApp (`v1 - commit b0e0a73`)

Fecha de respaldo: `2026-10-30`
Commit base verificado en producción: `b0e0a73` (`waStatus=connected`, `0` desconexiones `440`, +9h continuas en Hostinger CloudLinux / LiteSpeed `lsnode`).

## Archivos incluidos en este respaldo
- `whatsapp.js` -> Copia exacta de `server/services/whatsapp.js` (Baileys Multi-Sesión, Lease Atómico *Leader-Follower*, `makeCacheableSignalKeyStore`, `sentProtoCache`, Outbox persistente en disco, Watchdog no intrusivo, recuperación de ráfagas offline y deduplicación `emitStatus`).
- `metaWhatsApp.js` -> Copia exacta de `server/services/metaWhatsApp.js` (Conector oficial Meta Cloud API).
- `server.index.js` -> Copia exacta de `server/index.js` (`cleanupCompetingInstances`, guardia `EADDRINUSE`, rescate cross-build y configuración Socket.IO `['polling', 'websocket']`).
- `config.index.js` -> Copia exacta de `server/config/index.js` (Bóveda persistente `~/.wagent_data_<dominio>` en Hostinger).
- `testWhatsappResilience.js` -> Suite automatizada de 6 pruebas de resiliencia (`node server/scripts/testWhatsappResilience.js`).

## Restauración rápida en caso de emergencia futura
Desde la raíz del proyecto:
```powershell
Copy-Item backups/whatsapp-stable-v1/whatsapp.js server/services/whatsapp.js -Force
Copy-Item backups/whatsapp-stable-v1/metaWhatsApp.js server/services/metaWhatsApp.js -Force
node server/scripts/testWhatsappResilience.js
```

