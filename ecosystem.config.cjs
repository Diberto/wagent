module.exports = {
  apps: [
    {
      name: 'wagent-crm',
      script: 'server/index.js',
      instances: 1, // Instancia individual estándar
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'wagent-cluster',
      script: 'server/cluster.js',
      instances: 1, // El cluster controller gestiona internamente los N workers paralelos multi-núcleo
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        CLUSTER_WORKERS: 4
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        CLUSTER_WORKERS: 4
      },
      error_file: 'logs/pm2-cluster-error.log',
      out_file: 'logs/pm2-cluster-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
