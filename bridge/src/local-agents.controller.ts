import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LocalAgentService, PromptTurnOptions } from './local-agent';
import { ExecutionMode, PromptAttachments } from './model-catalog';

interface CreateLocalAgentDto {
  prompt?: string;
  cwd?: string;
  model?: string;
  mode?: ExecutionMode;
  effort?: string;
  context?: string;
  fast?: boolean;
  thinking?: boolean;
  attachments?: PromptAttachments;
}

interface PromptLocalAgentDto {
  text?: string;
  mode?: ExecutionMode;
  model?: string;
  effort?: string;
  context?: string;
  fast?: boolean;
  thinking?: boolean;
  attachments?: PromptAttachments;
}

/** Phone-facing REST for agents running on THIS Mac via cursor-agent CLI. */
@Controller('api/local')
export class LocalAgentsController {
  constructor(@Inject(LocalAgentService) private readonly local: LocalAgentService) {}

  @Get('agents')
  list(@Query('sync') sync?: string) {
    const agents = sync === '1' ? this.local.syncIdeTranscripts(3) : this.local.list();
    return {
      agents,
      account: this.local.getAccountInfo(),
      cliLoggedInHint: 'run: cursor agent login (one time)',
    };
  }

  @Get('auth/status')
  async authStatus() {
    return await this.local.getAuthStatus();
  }

  @Post('auth/login')
  async authLogin(@Body() body?: { forceBrowser?: boolean }) {
    return await this.local.startMobileLogin(Boolean(body?.forceBrowser));
  }

  @Post('auth/logout')
  async authLogout() {
    return await this.local.logoutCursor();
  }

  @Post('sync-ide')
  syncIde() {
    const agents = this.local.syncIdeTranscripts(4);
    return { agents };
  }

  @Get('ide-state')
  ideState() {
    return this.local.getIdeState();
  }

  @Get('browse-dirs')
  browseDirs(@Query('path') dirPath?: string) {
    return this.local.browseDirs(dirPath?.trim() || undefined);
  }

  @Get('git-diff')
  async gitDiff(@Query('cwd') cwd?: string) {
    if (!cwd?.trim()) {
      return { branches: [], changedFiles: [], statSummary: '', diff: '' };
    }
    return await this.local.getGitDiff(cwd.trim());
  }

  @Post('git-action')
  async gitAction(
    @Body()
    body: {
      cwd?: string;
      type?: 'checkout' | 'create-branch' | 'commit' | 'push' | 'pull';
      branch?: string;
      message?: string;
    },
  ) {
    if (!body?.cwd?.trim() || !body?.type) {
      throw new HttpException({ code: 'validation_error', message: 'cwd and type are required' }, 400);
    }
    try {
      return await this.local.runGitAction(body.cwd.trim(), {
        type: body.type,
        branch: body.branch,
        message: body.message,
      });
    } catch (e: any) {
      throw new HttpException({ code: 'git_error', message: String(e?.message ?? e) }, 400);
    }
  }

  @Post('exec-shell')
  async execShell(@Body() body: { cwd?: string; command?: string }) {
    if (!body?.command?.trim()) {
      throw new HttpException({ code: 'validation_error', message: 'command is required' }, 400);
    }
    return await this.local.runShellCommand(body.cwd?.trim() ?? '', body.command.trim());
  }

  @Post('open-url')
  async openUrl(@Body() body: { url?: string }) {
    if (!body?.url?.trim()) {
      throw new HttpException({ code: 'validation_error', message: 'url is required' }, 400);
    }
    try {
      return await this.local.openUrlOnMac(body.url.trim());
    } catch (e: any) {
      throw new HttpException({ code: 'open_error', message: String(e?.message ?? e) }, 400);
    }
  }

  @Get('mac-screen')
  async macScreen() {
    return await this.local.captureMacScreen();
  }

  @Post('transcribe')
  async transcribe(@Body() body: { audioBase64?: string; ext?: string }) {
    if (!body?.audioBase64?.trim()) {
      throw new HttpException({ code: 'validation_error', message: 'audioBase64 is required' }, 400);
    }
    return await this.local.transcribeAudio(body.audioBase64, body.ext ?? 'm4a');
  }

  @Get('models')
  async models(@Query('refresh') refresh?: string) {
    return await this.local.listModels(refresh === '1' || refresh === 'true');
  }

  @Get('projects')
  projects() {
    return { projects: this.local.listProjects() };
  }

  @Get('files')
  files(@Query('cwd') cwd?: string, @Query('q') q?: string) {
    if (!cwd?.trim()) {
      return { files: [] };
    }
    return { files: this.local.listFiles(cwd.trim(), q ?? '', 60) };
  }

  @Get('file-content')
  fileContent(@Query('cwd') cwd?: string, @Query('path') filePath?: string) {
    if (!filePath?.trim()) {
      throw new HttpException({ code: 'validation_error', message: 'path is required' }, 400);
    }
    return this.local.readFileContent(cwd?.trim() || undefined, filePath.trim());
  }

  @Post('agents')
  async create(@Body() body: CreateLocalAgentDto) {
    if (!body?.prompt?.trim() || !body?.cwd?.trim()) {
      throw new HttpException({ code: 'validation_error', message: 'prompt and cwd are required' }, 400);
    }
    const turnOpts: PromptTurnOptions = {
      mode: body.mode,
      model: body.model,
      effort: body.effort,
      context: body.context,
      fast: body.fast,
      thinking: body.thinking,
      attachments: body.attachments,
    };
    try {
      const agent = await this.local.createChat(body.cwd.trim(), body.prompt.trim(), turnOpts);
      this.local.prompt(agent.id, body.prompt.trim(), turnOpts);
      return { agent };
    } catch (e: any) {
      throw new HttpException(
        { code: e?.code ?? 'cli_error', message: String(e?.message ?? e) },
        e?.code === 'not_found' ? 404 : 500,
      );
    }
  }

  @Post('agents/:id/prompt')
  prompt(@Param('id') id: string, @Body() body: PromptLocalAgentDto) {
    if (!body?.text?.trim()) {
      throw new HttpException({ code: 'validation_error', message: 'text is required' }, 400);
    }
    try {
      return this.local.prompt(id, body.text.trim(), {
        mode: body.mode,
        model: body.model,
        effort: body.effort,
        context: body.context,
        fast: body.fast,
        thinking: body.thinking,
        attachments: body.attachments,
      });
    } catch (e: any) {
      throw new HttpException({ code: e?.code ?? 'cli_error', message: String(e?.message ?? e) }, 404);
    }
  }

  @Post('agents/:id/stop')
  stop(@Param('id') id: string) {
    return { stopped: this.local.stop(id) };
  }

  /** Open a Terminal window on the Mac showing this agent's session live. */
  @Post('agents/:id/show')
  async show(@Param('id') id: string) {
    try {
      await this.local.showOnMac(id);
      return { shown: true };
    } catch (e: any) {
      throw new HttpException(
        { code: e?.code ?? 'show_failed', message: String(e?.message ?? e) },
        e?.code === 'not_found' ? 404 : 500,
      );
    }
  }

  @Get('agents/:id')
  detail(@Param('id') id: string) {
    const agent = this.local.get(id);
    if (!agent) throw new HttpException({ code: 'not_found', message: 'unknown agent' }, 404);
    return { agent, events: this.local.getRecentEvents(id) };
  }

  @Patch('agents/:id')
  rename(@Param('id') id: string, @Body() body: { name?: string }) {
    if (!body?.name?.trim()) {
      throw new HttpException({ code: 'validation_error', message: 'name is required' }, 400);
    }
    try {
      const agent = this.local.renameChat(id, body.name);
      return { agent };
    } catch (e: any) {
      throw new HttpException(
        { code: e?.code ?? 'rename_failed', message: String(e?.message ?? e) },
        e?.code === 'not_found' ? 404 : 400,
      );
    }
  }

  @Delete('agents/:id')
  remove(@Param('id') id: string) {
    return this.local.deleteChat(id);
  }
}
