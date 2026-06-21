module.exports = {
  apps: [
    {
      name: "krishna-brain",
      script: "./node_modules/.bin/tsx",
      args: "apps/brain/src/index.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
