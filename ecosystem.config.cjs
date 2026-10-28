module.exports = {
  apps: [
    {
      name: 'wagent-crm',
      script: 'server/index.js',
      instances: 1, // Instancia individual estándar obligatoria para Baileys y WebSockets
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        MONGODB_URI: 'mongodb://dmovil_db_user:quQ7BwGCjqhnflro@ac-vkpxxx5-shard-00-00.qndfojh.mongodb.net:27017,ac-vkpxxx5-shard-00-01.qndfojh.mongodb.net:27017,ac-vkpxxx5-shard-00-02.qndfojh.mongodb.net:27017/cluster0?ssl=true&replicaSet=atlas-cwmn3y-shard-0&authSource=admin&compressors=zlib',
        MONGODB_DB_NAME: 'cluster0'
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
