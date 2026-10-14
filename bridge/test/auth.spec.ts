import { describe, expect, it } from 'vitest';
import { PairingAuthGuard } from '../src/auth.guard';
import { tokenOk, pairingUrl } from '../src/config';

function ctx(req: any) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

describe('PairingAuthGuard (SPEC.md §4 auth)', () => {
  const guard = new PairingAuthGuard('secret-token');

  it('allows /api/health without a token', () => {
    expect(guard.canActivate(ctx({ path: '/api/health' }))).toBe(true);
  });

  it('accepts a Bearer header token', () => {
    expect(
      guard.canActivate(ctx({ path: '/api/agents', headers: { authorization: 'Bearer secret-token' }, query: {} })),
    ).toBe(true);
  });

  it('accepts a ?token= query token', () => {
    expect(guard.canActivate(ctx({ path: '/api/agents', headers: {}, query: { token: 'secret-token' } }))).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(() =>
      guard.canActivate(ctx({ path: '/api/agents', headers: { authorization: 'Bearer nope' }, query: {} })),
    ).toThrowError(/pairing token/);
  });

  it('rejects a missing token', () => {
    expect(() => guard.canActivate(ctx({ path: '/api/agents', headers: {}, query: {} }))).toThrow();
  });
});

describe('tokenOk', () => {
  it('is constant-time comparable and exact', () => {
    expect(tokenOk('abc', 'abc')).toBe(true);
    expect(tokenOk('abc', 'abd')).toBe(false);
    expect(tokenOk(undefined, 'abc')).toBe(false);
    expect(tokenOk('', 'abc')).toBe(false);
  });
});

describe('pairingUrl', () => {
  it('builds the missioncontrol:// deep link the app scans', () => {
    expect(pairingUrl('100.1.2.3', 4040, 'tok')).toBe(
      'missioncontrol://pair?url=http%3A%2F%2F100.1.2.3%3A4040&token=tok',
    );
  });
});
