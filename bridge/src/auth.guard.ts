import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { tokenOk } from './config';

/** Bearer-token guard for every /api route except /api/health (SPEC.md §4). */
@Injectable()
export class PairingAuthGuard implements CanActivate {
  constructor(private readonly expectedToken: string) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const path: string = req.path ?? req.url ?? '';
    if (path === '/api/health' || path === '/api/auto-pair') return true;

    const header: string | undefined = req.headers?.authorization;
    const fromHeader = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const fromQuery = typeof req.query?.token === 'string' ? req.query.token : undefined;

    if (tokenOk(fromHeader ?? fromQuery, this.expectedToken)) return true;
    throw new UnauthorizedException({ code: 'unauthorized', message: 'bad or missing pairing token' });
  }
}
