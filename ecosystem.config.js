module.exports = {
  apps: [
    {
      name: 'eixo-server',
      script: 'server/index.js',
      cwd: '/var/www/eixo',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/eixo-server-error.log',
      out_file: '/var/log/eixo-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
