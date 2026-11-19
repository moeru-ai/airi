# `@proj-airi/http-error-shared`

The HTTP error model that the resource API and the auth service share.

## Use it for

- `ApiError` and its factory functions, for each error that a route, middleware, or service returns to a client.
- `createErrorHandler`, as the Hono `onError` handler of a service.

## Do not use it for

- Success responses. A route returns its resource directly.
- Provider-specific error bodies that a gateway route forwards.
- Importing `server/apps/api` or `server/apps/auth`.

## Error response

Each error response has this JSON body and the HTTP status of the error.

```json
{ "error": "BAD_REQUEST", "message": "Invalid auth event", "details": {} }
```

`details` is optional. Throw an `ApiError`. Do not write this body in a route or middleware.
