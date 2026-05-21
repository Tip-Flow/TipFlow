import * as Sentry from '@sentry/react-native';
import { supabase } from './supabase';

const RETRY_DELAY_MS = 2000;
const TIMEOUT_MS = 10_000;

type QueryResult<T> = { data: T | null; error: unknown };
type QueryFn<T> = () => Promise<QueryResult<T>>;

function isNetworkError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
  return (
    msg.includes('network') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('timeout') ||
    msg.includes('ECONNREFUSED')
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Supabase query timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function supabaseQuery<T>(
  queryFn: QueryFn<T>,
  context?: string,
): Promise<QueryResult<T>> {
  const run = () => withTimeout(queryFn(), TIMEOUT_MS);

  const result = await run();

  if (result.error && isNetworkError(result.error)) {
    await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    const retry = await run();
    if (retry.error) {
      Sentry.captureException(retry.error, {
        tags: { context: context ?? 'supabase_query', retry: 'true' },
      });
    }
    return retry;
  }

  if (result.error) {
    Sentry.captureException(result.error, {
      tags: { context: context ?? 'supabase_query' },
    });
  }

  return result;
}

export { supabase };
