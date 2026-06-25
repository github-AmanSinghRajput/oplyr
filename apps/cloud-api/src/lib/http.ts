import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from './errors.js';

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function requireTrimmedString(value: unknown, fieldName: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  throw new AppError(400, `${fieldName} is required.`, 'INVALID_INPUT');
}

export function optionalTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function optionalPositiveInteger(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'Expected a positive integer.', 'INVALID_INPUT');
  }

  return parsed;
}

export function optionalDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new AppError(400, `${fieldName} must be an ISO date string.`, 'INVALID_INPUT');
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, `${fieldName} must be an ISO date string.`, 'INVALID_INPUT');
  }

  return parsed;
}
