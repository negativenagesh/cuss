import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { loadConfig, localAddresses, pairingUrl } from './config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const qrcode = require('qrcode-terminal');

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.useWebSocketAdapter(new WsAdapter(app));
  // Disable Express ETag caching so mobile clients never receive empty 304 Not Modified responses.
  try {
    const expressInstance = app.getHttpAdapter().getInstance();
    expressInstance.set('etag', false);
    // Allow up to 15 MB JSON payloads for base64 voice recordings
    const express = require('express');
    app.use(express.json({ limit: '15mb' }));
  } catch {
    /* ignore if adapter differs */
  }
  // Request log: see exactly what the phone sends and how fast we answer.
  app.use((req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const t0 = Date.now();
    console.log(`--> ${req.method} ${req.url} from ${req.socket?.remoteAddress}`);
    res.on('finish', () => console.log(`<-- ${req.method} ${req.url} ${res.statusCode} in ${Date.now() - t0}ms`));
    next();
  });
  app.enableShutdownHooks();
  try {
    await app.listen(config.port, '0.0.0.0');
  } catch (e: any) {
    if (e?.code === 'EADDRINUSE') {
      console.error(`\nPort ${config.port} is already in use — a bridge is already running.`);
      console.error('Use that one (check: curl http://localhost:4040/api/health),');
      console.error('or stop it first: pkill -f "tsx src/main.ts"\n');
      process.exit(1);
    }
    throw e;
  }

  console.log(`\nMission Control bridge listening on port ${config.port}`);
  if (!config.apiKey) {
    console.log('WARNING: CURSOR_API_KEY is not set — API routes will return 500 no_api_key.');
    console.log('Create a key at https://cursor.com/dashboard/api and restart with CURSOR_API_KEY=...');
  }
  const addrs = localAddresses();
  for (const host of addrs.length ? addrs : ['127.0.0.1']) {
    console.log(`\nPair via ${host.startsWith('100.') ? 'Tailscale' : 'LAN'}: http://${host}:${config.port}`);
    qrcode.generate(pairingUrl(host, config.port, config.pairingToken), { small: true });
  }
  console.log('\nScan a QR with the app, or enter URL + token manually from the pairing screen.');
}

void bootstrap();
