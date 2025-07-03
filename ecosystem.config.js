module.exports = {
  apps: [{
    name: 'bidscents',
    script: './dist/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    // Load environment variables from .env file
    node_args: '-r dotenv/config',
    instances: 1,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};