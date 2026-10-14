import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AgentsController } from './agents.controller';
import { PairingAuthGuard } from './auth.guard';
import { CursorApi } from './cursor-api';
import { LiveGateway } from './live.gateway';
import { LocalAgentService } from './local-agent';
import { LocalAgentsController } from './local-agents.controller';
import { loadConfig } from './config';

const config = loadConfig();

@Module({
  controllers: [AgentsController, LocalAgentsController],
  providers: [
    { provide: 'BRIDGE_CONFIG', useValue: config },
    { provide: CursorApi, useFactory: () => (config.apiKey ? new CursorApi(config.apiKey) : null) },
    { provide: LocalAgentService, useFactory: () => new LocalAgentService() },
    { provide: 'PAIRING_TOKEN', useValue: config.pairingToken },
    LiveGateway,
    {
      provide: APP_GUARD,
      useFactory: (token: string) => new PairingAuthGuard(token),
      inject: ['PAIRING_TOKEN'],
    },
  ],
})
export class AppModule {}
