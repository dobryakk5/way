import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  acceptChoiceEvent,
  acceptMotiveResolution,
  completeCharacterDay,
  createCharacter,
  getCharacterResume,
  getDevelopmentHistory,
  getDevelopmentState,
  persistenceBusinessCode,
  pool,
  registerSceneInstance
} from './db.js';
import {
  choiceMadeEventSchema,
  completeDaySchema,
  createCharacterSchema,
  motiveResolutionSchema,
  rawEventBatchSchema,
  rawMotiveBatchSchema,
  rawSceneBatchSchema,
  sceneInstanceSchema,
  type ChoiceMadeEventInput,
  type MotiveResolutionInput
} from './schemas.js';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY_BYTES = 256 * 1024;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const uuidSchema = z.string().uuid();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && (process.env.GAME_DEV_USER_ID || process.env.GAME_ALLOW_USER_HEADER === 'true')) {
  throw new Error('Development authentication flags are forbidden in production');
}

function setCors(req: IncomingMessage, res: ServerResponse): void {
  const allowed = process.env.GAME_CORS_ORIGIN;
  if (allowed && req.headers.origin === allowed) {
    res.setHeader('access-control-allow-origin', allowed);
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('vary', 'origin');
  }
  res.setHeader(
    'access-control-allow-headers',
    IS_PRODUCTION ? 'content-type' : 'content-type,x-user-id'
  );
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
}

function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown): void {
  setCors(req, res);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function singleHeader(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

function trustedProxyUserId(req: IncomingMessage): string | undefined {
  const secret = process.env.GAME_TRUSTED_USER_HEADER_SECRET;
  if (!secret) return undefined;
  const value = singleHeader(req, 'x-user-id');
  const signature = singleHeader(req, 'x-user-signature');
  if (!value || !signature || !uuidSchema.safeParse(value).success || !/^[0-9a-f]{64}$/i.test(signature)) {
    return undefined;
  }
  const expected = createHmac('sha256', secret).update(value).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? value : undefined;
}

function userId(req: IncomingMessage): string | undefined {
  if (IS_PRODUCTION) return trustedProxyUserId(req);

  const fixed = process.env.GAME_DEV_USER_ID;
  if (fixed && uuidSchema.safeParse(fixed).success) return fixed;
  if (process.env.GAME_ALLOW_USER_HEADER !== 'true') return trustedProxyUserId(req);
  const value = singleHeader(req, 'x-user-id');
  return value && uuidSchema.safeParse(value).success ? value : undefined;
}

function eventHash(event: ChoiceMadeEventInput): string {
  const canonical = JSON.stringify({
    eventId: event.eventId,
    characterId: event.characterId,
    gameSessionId: event.gameSessionId,
    seq: event.seq,
    gameDay: event.gameDay,
    eventType: event.eventType,
    sceneInstanceId: event.sceneInstanceId,
    choiceId: event.choiceId,
    occurredAt: event.occurredAt
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function motiveHash(event: MotiveResolutionInput): string {
  const canonical = JSON.stringify({
    eventId: event.eventId,
    characterId: event.characterId,
    gameSessionId: event.gameSessionId,
    gameDay: event.gameDay,
    sceneInstanceId: event.sceneInstanceId,
    choiceId: event.choiceId,
    promptId: event.promptId,
    resolutionType: event.resolutionType,
    ...(event.resolutionType === 'answered' ? { motiveOptionId: event.motiveOptionId } : {}),
    occurredAt: event.occurredAt
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function rawUuid(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === 'string' && uuidSchema.safeParse(candidate).success ? candidate : undefined;
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    setCors(req, res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    await pool.query('SELECT 1');
    send(req, res, 200, { ok: true });
    return;
  }

  const uid = userId(req);
  if (!uid) {
    send(req, res, 401, { code: 'UNAUTHENTICATED' });
    return;
  }

  if (req.method === 'GET' && req.url) {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const developmentMatch = parsedUrl.pathname.match(/^\/api\/v1\/characters\/([0-9a-fA-F-]{36})\/development$/);
    if (developmentMatch) {
      const characterId = developmentMatch[1]!;
      if (!uuidSchema.safeParse(characterId).success) {
        send(req, res, 422, { code: 'VALIDATION_ERROR' });
        return;
      }
      const state = await getDevelopmentState(uid, characterId);
      if (!state) {
        send(req, res, 404, { code: 'CHARACTER_NOT_FOUND' });
        return;
      }
      send(req, res, 200, state);
      return;
    }

    const historyMatch = parsedUrl.pathname.match(/^\/api\/v1\/characters\/([0-9a-fA-F-]{36})\/development\/history$/);
    if (historyMatch) {
      const characterId = historyMatch[1]!;
      if (!uuidSchema.safeParse(characterId).success) {
        send(req, res, 422, { code: 'VALIDATION_ERROR' });
        return;
      }
      const owner = await getDevelopmentState(uid, characterId);
      if (!owner) {
        send(req, res, 404, { code: 'CHARACTER_NOT_FOUND' });
        return;
      }
      const history = await getDevelopmentHistory(uid, characterId, {
        ...(parsedUrl.searchParams.get('taxonomyVersion') ? { taxonomyVersion: parsedUrl.searchParams.get('taxonomyVersion')! } : {}),
        ...(parsedUrl.searchParams.get('evidenceModelVersion') ? { evidenceModelVersion: parsedUrl.searchParams.get('evidenceModelVersion')! } : {}),
        ...(parsedUrl.searchParams.get('calculationVersion') ? { calculationVersion: parsedUrl.searchParams.get('calculationVersion')! } : {})
      });
      send(req, res, 200, { history });
      return;
    }

    const stateMatch = parsedUrl.pathname.match(/^\/api\/v1\/characters\/([0-9a-fA-F-]{36})\/state$/);
    if (stateMatch) {
      const characterId = stateMatch[1]!;
      if (!uuidSchema.safeParse(characterId).success) {
        send(req, res, 422, { code: 'VALIDATION_ERROR' });
        return;
      }
      const state = await getCharacterResume(uid, characterId);
      if (!state) {
        send(req, res, 404, { code: 'CHARACTER_NOT_FOUND' });
        return;
      }
      send(req, res, 200, state);
      return;
    }
  }

  if (req.method === 'POST' && req.url === '/api/v1/characters') {
    const parsed = createCharacterSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      send(req, res, 422, { code: 'VALIDATION_ERROR' });
      return;
    }
    try {
      const status = await createCharacter(uid, parsed.data);
      send(req, res, 200, { characterId: parsed.data.characterId, status });
    } catch (error) {
      const code = persistenceBusinessCode(error);
      if (code) send(req, res, code === 'CHARACTER_NOT_FOUND' ? 404 : 409, { code });
      else throw error;
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/v1/game/scene-instances/batch') {
    const outer = rawSceneBatchSchema.safeParse(await readJson(req));
    if (!outer.success) {
      send(req, res, 422, { code: 'VALIDATION_ERROR' });
      return;
    }
    const results: { sceneInstanceId: string; status: 'accepted' | 'alreadyAccepted' | 'rejected'; code?: string }[] = [];
    for (const raw of outer.data.sceneInstances) {
      const id = rawUuid(raw, 'sceneInstanceId');
      if (!id) {
        send(req, res, 422, { code: 'VALIDATION_ERROR' });
        return;
      }
      const parsed = sceneInstanceSchema.safeParse(raw);
      if (!parsed.success) {
        results.push({ sceneInstanceId: id, status: 'rejected', code: 'VALIDATION_ERROR' });
        continue;
      }
      try {
        const status = await registerSceneInstance(uid, parsed.data);
        results.push({ sceneInstanceId: id, status });
      } catch (error) {
        const code = persistenceBusinessCode(error);
        if (!code) throw error;
        results.push({ sceneInstanceId: id, status: 'rejected', code });
      }
    }
    send(req, res, 200, { results });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/v1/game/motives/batch') {
    const outer = rawMotiveBatchSchema.safeParse(await readJson(req));
    if (!outer.success) {
      send(req, res, 422, { code: 'VALIDATION_ERROR' });
      return;
    }
    const results: { eventId: string; status: 'accepted' | 'alreadyAccepted' | 'rejected'; code?: string }[] = [];
    for (const raw of outer.data.resolutions) {
      const id = rawUuid(raw, 'eventId');
      if (!id) {
        send(req, res, 422, { code: 'VALIDATION_ERROR' });
        return;
      }
      const parsed = motiveResolutionSchema.safeParse(raw);
      if (!parsed.success) {
        results.push({ eventId: id, status: 'rejected', code: 'VALIDATION_ERROR' });
        continue;
      }
      if (Date.parse(parsed.data.occurredAt) > Date.now() + FUTURE_SKEW_MS) {
        results.push({ eventId: id, status: 'rejected', code: 'OCCURRED_AT_IN_FUTURE' });
        continue;
      }
      try {
        const status = await acceptMotiveResolution(uid, parsed.data, motiveHash(parsed.data));
        results.push({ eventId: id, status });
      } catch (error) {
        const code = persistenceBusinessCode(error);
        if (!code) throw error;
        results.push({ eventId: id, status: 'rejected', code });
      }
    }
    send(req, res, 200, { results });
    return;
  }

  const completeMatch = req.method === 'POST'
    ? req.url?.match(/^\/api\/v1\/characters\/([0-9a-fA-F-]{36})\/days\/(\d+)\/complete$/)
    : undefined;
  if (completeMatch) {
    const characterId = completeMatch[1]!;
    const gameDay = Number(completeMatch[2]);
    if (!uuidSchema.safeParse(characterId).success || !Number.isSafeInteger(gameDay) || gameDay < 1) {
      send(req, res, 422, { code: 'VALIDATION_ERROR' });
      return;
    }
    const parsed = completeDaySchema.safeParse(await readJson(req));
    if (!parsed.success) {
      send(req, res, 422, { code: 'VALIDATION_ERROR' });
      return;
    }
    try {
      const result = await completeCharacterDay(uid, characterId, gameDay, parsed.data);
      send(req, res, 200, result);
    } catch (error) {
      const code = persistenceBusinessCode(error);
      if (!code) throw error;
      if (code.startsWith('DAY_EVENTS_INCOMPLETE:')) {
        const missingSeq = code.slice('DAY_EVENTS_INCOMPLETE:'.length)
          .split(',')
          .filter(Boolean)
          .map(Number);
        send(req, res, 409, { code: 'DAY_EVENTS_INCOMPLETE', missingSeq });
        return;
      }
      if (code.startsWith('DAY_SLOTS_INCOMPLETE:')) {
        const missingSlots = code.slice('DAY_SLOTS_INCOMPLETE:'.length)
          .split(',')
          .filter(Boolean)
          .map(Number);
        send(req, res, 409, { code: 'DAY_SLOTS_INCOMPLETE', missingSlots });
        return;
      }
      send(req, res, code === 'CHARACTER_NOT_FOUND' ? 404 : 409, { code });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/v1/game/events/batch') {
    const outer = rawEventBatchSchema.safeParse(await readJson(req));
    if (!outer.success) {
      send(req, res, 422, { code: 'VALIDATION_ERROR' });
      return;
    }
    const results: { eventId: string; status: 'accepted' | 'alreadyAccepted' | 'rejected'; code?: string }[] = [];
    for (const raw of outer.data.events) {
      const id = rawUuid(raw, 'eventId');
      if (!id) {
        send(req, res, 422, { code: 'VALIDATION_ERROR' });
        return;
      }
      const parsed = choiceMadeEventSchema.safeParse(raw);
      if (!parsed.success) {
        results.push({ eventId: id, status: 'rejected', code: 'VALIDATION_ERROR' });
        continue;
      }
      if (Date.parse(parsed.data.occurredAt) > Date.now() + FUTURE_SKEW_MS) {
        results.push({ eventId: id, status: 'rejected', code: 'OCCURRED_AT_IN_FUTURE' });
        continue;
      }
      try {
        const status = await acceptChoiceEvent(uid, parsed.data, eventHash(parsed.data));
        results.push({ eventId: id, status });
      } catch (error) {
        const code = persistenceBusinessCode(error);
        if (!code) throw error;
        results.push({ eventId: id, status: 'rejected', code });
      }
    }
    send(req, res, 200, { results });
    return;
  }

  send(req, res, 404, { code: 'NOT_FOUND' });
}

const server = createServer((req, res) => {
  void route(req, res).catch(error => {
    console.error(error);
    if (!res.headersSent) send(req, res, 500, { code: 'INTERNAL_ERROR' });
    else res.end();
  });
});

server.listen(PORT, () => {
  console.log(`Persistence API listening on :${PORT}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
