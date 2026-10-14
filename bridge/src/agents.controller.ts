import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { CursorApi, CursorApiError, CreateAgentInput } from './cursor-api';

/** REST surface for the phone app (SPEC.md §4). All routes need the pairing token. */
@Controller('api')
export class AgentsController {
  constructor(@Inject(CursorApi) private readonly api: CursorApi | null) {}

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
    return { ok: true, service: 'cuss-bridge', version: '0.4.0', time: new Date().toISOString() };
  }

  @Get('agents')
  async list() {
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
