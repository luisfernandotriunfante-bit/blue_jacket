export interface ParserRejection {
  source: string;
  code: string;
  message: string;
  action: string;
  detectedAt: string;
}

const STORAGE_KEY = 'blue-jacket-parser-rejections-v1';

function readStored(): ParserRejection[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as ParserRejection[];
    return Array.isArray(parsed) ? parsed.filter(item => item && item.source && item.code && item.message && item.action) : [];
  } catch {
    return [];
  }
}

function writeStored(items: ParserRejection[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export class ParserContractError extends Error {
  readonly source: string;
  readonly code: string;
  readonly action: string;

  constructor(source: string, code: string, message: string, action: string) {
    super(`${source}: ${message} Ação necessária: ${action}`);
    this.name = 'ParserContractError';
    this.source = source;
    this.code = code;
    this.action = action;
  }
}

export function listParserRejections(): ParserRejection[] {
  return readStored().sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

export function clearParserRejection(source: string) {
  const next = readStored().filter(item => item.source !== source);
  writeStored(next);
}

export function rejectParserContract(source: string, code: string, message: string, action: string): never {
  const rejection: ParserRejection = {
    source,
    code,
    message,
    action,
    detectedAt: new Date().toISOString(),
  };
  const previous = readStored().filter(item => item.source !== source);
  writeStored([rejection, ...previous]);
  throw new ParserContractError(source, code, message, action);
}
