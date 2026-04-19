import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { initSessionStore } from './services/sessionStore.js';

initSessionStore();

const app = createApp();

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'ShelfSense backend listening');
});
