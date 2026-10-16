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
import { readCursorOAuthCredentials } from './tunnel';

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
    const agents = sync === '1' ? this.local.syncIdeTranscripts(50) : this.local.list();
    return {
      agents,
      account: this.local.getAccountInfo(),
      cliLoggedInHint: 'run: cursor agent login (one time)',
    };
  }

  @Get('auth/status')
  async authStatus() {
    const st = await this.local.getAuthStatus();
    const creds = readCursorOAuthCredentials();
    return {
      ...st,
      email: st.email || creds.email,
      loggedIn: st.loggedIn || Boolean(creds.accessToken),
      cursorAuth: creds.accessToken
        ? {
            accessToken: creds.accessToken,
            refreshToken: creds.refreshToken,
            email: st.email || creds.email,
          }
        : undefined,
    };
  }

  @Post('auth/login')
  async authLogin(@Body() body?: { forceBrowser?: boolean }) {
    return await this.local.startMobileLogin(Boolean(body?.forceBrowser));
  }

  @Post('auth/complete')
  async authComplete(@Body() body: { accessToken?: string; refreshToken?: string; email?: string }) {
    if (!body?.accessToken?.trim()) {
      throw new HttpException({ code: 'validation_error', message: 'accessToken is required' }, 400);
    }
    return await this.local.completeMobileLogin({
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      email: body.email,
    });
  }

  @Post('auth/logout')
  async authLogout() {
    return await this.local.logoutCursor();
  }

  @Post('sync-ide')
  syncIde(
    @Body()
    body?: {
      deviceAgents?: any[];
      deviceTranscripts?: Record<string, any[]>;
      fileEdits?: { cwd?: string; path: string; content: string }[];
    },
  ) {
    if (body?.deviceAgents || body?.deviceTranscripts || body?.fileEdits) {
      this.local.syncFromDevice(
        body.deviceAgents ?? [],
        body.deviceTranscripts,
        body.fileEdits,
      );
    }
    const agents = this.local.syncIdeTranscripts(60);
    return { agents };
  }

  @Post('sync-device')
  syncDevice(
    @Body()
    body?: {
      agents?: any[];
      transcripts?: Record<string, any[]>;
      fileEdits?: { cwd?: string; path: string; content: string }[];
    },
  ) {
    return this.local.syncFromDevice(body?.agents ?? [], body?.transcripts, body?.fileEdits);
  }

  @Get('workspace-snapshot')
  workspaceSnapshot(@Query('cwd') cwd?: string) {
    return this.local.getWorkspaceSnapshot(cwd?.trim() || undefined);
  }

  @Get('ide-state')
  ideState() {
    return this.local.getIdeState();
  }

  @Get('browse-dirs')
  browseDirs(@Query('path') dirPath?: string) {
    return this.local.browseDirs(dirPath?.trim() || undefined);
  }

  @Get('settings')
  async getSettings() {
    return await this.local.getCursorSettingsAndUsage();
  }

  @Post('settings')
  updateSettings(
    @Body()
    body: {
      cliConfig?: Record<string, any>;
      desktopSettings?: Record<string, any>;
    },
  ) {
    return this.local.updateCursorSettings(body ?? {});
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
  async macScreen(@Query('agentId') agentId?: string) {
    return await this.local.captureMacScreen(agentId?.trim() || undefined);
  }

  @Post('mac-action')
  async macAction(
    @Body()
    body: {
      type?:
        | 'focus-app'
        | 'send-key'
        | 'click'
        | 'doubleclick'
        | 'rightclick'
        | 'move'
        | 'scroll'
        | 'type-text'
        | 'backspace'
        | 'move-rel'
        | 'mouse-down'
        | 'mouse-up'
        | 'click-here'
        | 'rightclick-here'
        | 'paste-text'
        | 'clipboard-set';
      target?: string;
      x?: number;
      y?: number;
      deltaY?: number;
      deltaX?: number;
      text?: string;
      count?: number;
    },
  ) {
    if (!body?.type) {
      throw new HttpException({ code: 'validation_error', message: 'type is required' }, 400);
    }
    return await this.local.performMacAction(body as any);
  }

  /** Accessibility snapshot of the focused Mac field (role/value/secure/multiline) for focused-field echo. */
  @Get('mac-focus')
  async macFocus() {
    return await this.local.getMacFocus();
  }

  /** Read the Mac clipboard (pbpaste) so the phone can pull text copied on the Mac. */
  @Get('mac-clipboard')
  async macClipboard() {
    return await this.local.getMacClipboard();
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
    let agent = this.local.get(id);
    const events = this.local.getRecentEvents(id);
    if (!agent && events.length === 0) {
      throw new HttpException({ code: 'not_found', message: 'unknown agent' }, 404);
    }
    if (!agent) {
      this.local.syncIdeTranscripts(80);
      agent = this.local.get(id) ?? {
        id,
        name: id,
        cwd: '',
        mode: 'agent',
        createdAt: new Date().toISOString(),
        lastStatus: 'done',
        lastActivityAt: new Date().toISOString(),
      };
    }
    return { agent, events };
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
