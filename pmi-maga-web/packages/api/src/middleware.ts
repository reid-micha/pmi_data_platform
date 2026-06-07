export interface ApiRequestContext {
  url: string;
  init: RequestInit;
}

export type ApiRequestMiddleware = (
  context: ApiRequestContext
) => ApiRequestContext | Promise<ApiRequestContext>;

export type ApiResponseMiddleware = (
  response: Response,
  context: ApiRequestContext
) => Response | Promise<Response>;

export type ApiErrorMiddleware = (
  error: unknown,
  context: ApiRequestContext
) => unknown | Promise<unknown>;

// Middleware registries are kept in-memory and executed in registration order.
const requestMiddlewares = new Set<ApiRequestMiddleware>();
const responseMiddlewares = new Set<ApiResponseMiddleware>();
const errorMiddlewares = new Set<ApiErrorMiddleware>();

export function useApiRequestMiddleware(middleware: ApiRequestMiddleware): () => void {
  requestMiddlewares.add(middleware);
  // Return an unsubscribe function so callers can clean up on unmount.
  return () => {
    requestMiddlewares.delete(middleware);
  };
}

export function useApiResponseMiddleware(middleware: ApiResponseMiddleware): () => void {
  responseMiddlewares.add(middleware);
  return () => {
    responseMiddlewares.delete(middleware);
  };
}

export function useApiErrorMiddleware(middleware: ApiErrorMiddleware): () => void {
  errorMiddlewares.add(middleware);
  return () => {
    errorMiddlewares.delete(middleware);
  };
}

export async function runApiRequestMiddlewares(
  initialContext: ApiRequestContext
): Promise<ApiRequestContext> {
  let finalContext = initialContext;
  // Pipe the context through each request middleware sequentially.
  for (const middleware of requestMiddlewares) {
    finalContext = await middleware(finalContext);
  }
  return finalContext;
}

export async function runApiResponseMiddlewares(
  initialResponse: Response,
  context: ApiRequestContext
): Promise<Response> {
  let finalResponse = initialResponse;
  for (const middleware of responseMiddlewares) {
    finalResponse = await middleware(finalResponse, context);
  }
  return finalResponse;
}

export async function runApiErrorMiddlewares(error: unknown, context: ApiRequestContext): Promise<unknown> {
  let nextError: unknown = error;
  for (const middleware of errorMiddlewares) {
    nextError = await middleware(nextError, context);
  }
  return nextError;
}
