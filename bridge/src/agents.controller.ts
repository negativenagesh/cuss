import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Inject,
  Optional,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { CursorApi, CursorApiError, CreateAgentInput } from './cursor-api';
import { localAddresses } from './config';
import {
  getTunnelStatus,
  listCloudBackgroundComposersViaOAuth,
  readCursorOAuthCredentials,
} from './tunnel';

/** REST surface for the phone app (SPEC.md §4). All routes need the pairing token. */
@Controller('api')
export class AgentsController {
  constructor(
    @Inject(CursorApi) private readonly api: CursorApi | null,
    @Optional() @Inject('PAIRING_TOKEN') private readonly pairingToken?: string,
  ) {}

  private client(): CursorApi {
    if (!this.api) {
      throw new HttpException(
        { code: 'no_api_key', message: 'Set CURSOR_API_KEY on the bridge (cursor.com/dashboard/api)' },
        500,
      );
    }
    return this.api;
  }

  private translate(e: unknown): never {
    if (e instanceof CursorApiError) {
      throw new HttpException({ code: e.code, message: e.message }, e.status);
    }
    throw e;
  }

  @Get('health')
  health() {
    const tunnel = getTunnelStatus(4040, this.pairingToken ?? '');
    return {
      ok: true,
      service: 'cuss-bridge',
      version: '0.6.0',
      time: new Date().toISOString(),
      tunnelUrl: tunnel.tunnelUrl,
      lanUrl: tunnel.lanUrl,
      tailscaleUrl: tunnel.tailscaleUrl,
      beaconTopic: tunnel.beaconTopic,
      caffeinateActive: tunnel.caffeinateActive,
    };
  }

  @Get('auto-pair')
  autoPair(@Req() req?: any) {
    const addrs = localAddresses();
    const lanIp = addrs.find((a) => !a.startsWith('100.') && !a.startsWith('169.254.')) || addrs[0] || '127.0.0.1';
    const rawHost = String(req?.headers?.host ?? '').split(':')[0];
    const hostOnly =
      !rawHost || rawHost === '127.0.0.1' || rawHost === 'localhost'
        ? lanIp
        : rawHost;
    const isHttpsTunnel = rawHost.endsWith('.lhr.life') || rawHost.endsWith('.trycloudflare.com');
    const bridgeUrl = isHttpsTunnel ? `https://${rawHost}` : `http://${hostOnly}:4040`;
    const token = this.pairingToken ?? '';
    const tunnel = getTunnelStatus(4040, token);
    const cursorAuth = readCursorOAuthCredentials();
    return {
      ok: true,
      service: 'cuss-bridge',
      version: '0.6.0',
      url: bridgeUrl,
      lanUrl: tunnel.lanUrl,
      tunnelUrl: tunnel.tunnelUrl,
      tailscaleUrl: tunnel.tailscaleUrl,
      beaconTopic: tunnel.beaconTopic,
      token,
      addresses: addrs,
      cursorAuth,
      deepLink: `missioncontrol://pair?url=${encodeURIComponent(bridgeUrl)}&token=${token}`,
      expoLink: `exp://${lanIp}:8081/--/pair?url=${encodeURIComponent(bridgeUrl)}&token=${token}`,
    };
  }

  @Get('pair')
  pairPage(
    @Req() req: any,
    @Res() res: any,
    @Query('format') format?: string,
    @Query('mode') mode?: string,
  ) {
    const addrs = localAddresses();
    const lanIp = addrs.find((a) => !a.startsWith('100.') && !a.startsWith('169.254.')) || addrs[0] || '127.0.0.1';
    const rawHost = String(req?.headers?.host ?? '').split(':')[0];
    const hostOnly =
      !rawHost || rawHost === '127.0.0.1' || rawHost === 'localhost'
        ? lanIp
        : rawHost;
    const isHttpsTunnel = rawHost.endsWith('.lhr.life') || rawHost.endsWith('.trycloudflare.com');
    const bridgeUrl = isHttpsTunnel ? `https://${rawHost}` : `http://${hostOnly}:4040`;
    const token = this.pairingToken ?? '';
    const tunnel = getTunnelStatus(4040, token);
    const cursorAuth = readCursorOAuthCredentials();
    const encUrl = encodeURIComponent(bridgeUrl);
    const deepLink = `missioncontrol://pair?url=${encUrl}&token=${token}`;
    const expoLink = `exp://${lanIp}:8081/--/pair?url=${encUrl}&token=${token}`;

    const accept = String(req?.headers?.accept ?? '');
    if (format === 'json' || (accept.includes('application/json') && !accept.includes('text/html'))) {
      return res.json({
        ok: true,
        service: 'cuss-bridge',
        version: '0.6.0',
        url: bridgeUrl,
        lanUrl: tunnel.lanUrl,
        tunnelUrl: tunnel.tunnelUrl,
        tailscaleUrl: tunnel.tailscaleUrl,
        beaconTopic: tunnel.beaconTopic,
        token,
        cursorAuth,
        deepLink,
        expoLink,
      });
    }

    const primaryTarget = mode === 'expo' ? expoLink : deepLink;
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
  <title>CUSS // Pair Phone</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #07070C;
      color: #F4F0EA;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', Menlo, monospace;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: #10111A;
      border: 1.5px solid #D4FF00;
      border-radius: 18px;
      padding: 22px;
      text-align: center;
    }
    .logo {
      font-size: 38px;
      font-weight: 900;
      color: #D4FF00;
      letter-spacing: 3px;
    }
    .sub {
      font-size: 11px;
      color: #00F0FF;
      letter-spacing: 1.4px;
      margin-top: 4px;
      margin-bottom: 18px;
    }
    .btn {
      display: block;
      width: 100%;
      text-decoration: none;
      font-weight: 800;
      font-size: 13px;
      letter-spacing: 1px;
      padding: 15px 16px;
      border-radius: 12px;
      margin-top: 10px;
    }
    .btn-lime {
      background: #D4FF00;
      color: #07070C;
    }
    .btn-cyan {
      background: #0B0C14;
      color: #00F0FF;
      border: 1.5px solid #00F0FF;
    }
    .meta {
      margin-top: 16px;
      background: #0B0C14;
      border: 1px solid #22263A;
      border-radius: 10px;
      padding: 12px;
      text-align: left;
      font-size: 11px;
      line-height: 1.6;
      color: #9BA3C2;
      word-break: break-all;
    }
    .meta strong { color: #D4FF00; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚡ CUSS</div>
    <div class="sub">MAC BRIDGE UMBILICAL READY</div>
    <a class="btn btn-lime" href="${expoLink}">OPEN &amp; PAIR IN EXPO GO</a>
    <a class="btn btn-cyan" href="${deepLink}">OPEN &amp; PAIR IN CUSS APP</a>
    <div class="meta">
      <div><strong>BRIDGE URL:</strong> ${bridgeUrl}</div>
      <div><strong>TOKEN:</strong> ${token}</div>
    </div>
  </div>
  <script>
    setTimeout(function () {
      window.location.href = ${JSON.stringify(primaryTarget)};
    }, 120);
  </script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }

  @Get('agents')
  async list() {
    if (!this.api) {
      const oauthAgents = await listCloudBackgroundComposersViaOAuth();
      return { agents: oauthAgents };
    }
    try {
      const page = await this.client().listAgents(100);
      return {
        agents: page.items.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          url: a.url,
          latestRunId: a.latestRunId,
          updatedAt: a.updatedAt,
        })),
      };
    } catch (e) {
      this.translate(e);
    }
  }

  @Get('agents/:id')
  async detail(@Param('id') id: string) {
    try {
      const agent = await this.client().getAgent(id);
      const latestRun = agent.latestRunId
        ? await this.client().getRun(id, agent.latestRunId).catch(() => null)
        : null;
      return { agent, latestRun };
    } catch (e) {
      this.translate(e);
    }
  }

  @Post('agents')
  async create(@Body() body: CreateAgentInput) {
    try {
      return await this.client().createAgent(body);
    } catch (e) {
      this.translate(e);
    }
  }

  @Post('agents/:id/prompt')
  async prompt(@Param('id') id: string, @Body() body: { text?: string }) {
    if (!body?.text?.trim()) {
      throw new HttpException({ code: 'validation_error', message: 'text is required' }, 400);
    }
    try {
      return await this.client().createRun(id, body.text);
    } catch (e) {
      this.translate(e);
    }
  }

  @Post('agents/:id/cancel')
  async cancel(@Param('id') id: string) {
    try {
      const runs = await this.client().listRuns(id, 1);
      const active = runs.items.find((r) => r.status === 'RUNNING' || r.status === 'CREATING');
      if (!active) {
        throw new HttpException({ code: 'run_not_cancellable', message: 'no active run' }, 409);
      }
      return await this.client().cancelRun(id, active.id);
    } catch (e) {
      this.translate(e);
    }
  }

  @Post('agents/:id/archive')
  async archive(@Param('id') id: string) {
    try {
      return await this.client().archiveAgent(id);
    } catch (e) {
      this.translate(e);
    }
  }

  @Delete('agents/:id')
  async remove(@Param('id') id: string) {
    try {
      return await this.client().deleteAgent(id);
    } catch (e) {
      this.translate(e);
    }
  }

  @Get('agents/:id/usage')
  async usage(@Param('id') id: string) {
    try {
      return await this.client().getUsage(id);
    } catch (e) {
      this.translate(e);
    }
  }
}
