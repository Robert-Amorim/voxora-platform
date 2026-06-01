module.exports = {
  apps: [{
    name: 'voxora-platform',
    cwd: '/srv/apps/voxora-platform',
    script: 'dist/server.js',       // ajuste conforme seu entrypoint
    exec_mode: 'fork',
    instances: 1,
    env: { NODE_ENV: 'production', PORT: 3001 },
    out_file: '/var/log/apps/voxora-platform/out.log',
    error_file: '/var/log/apps/voxora-platform/err.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '512M',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 5000,
    watch: false,
    node_args: ['--max-old-space-size=400'],
  }],
};
