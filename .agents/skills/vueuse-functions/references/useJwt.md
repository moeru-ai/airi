---
category: '@Integrations'
---

# useJwt

Wrapper for [`jwt-decode`](https://github.com/auth0/jwt-decode).

## Install

```bash
npm install jwt-decode@^4
```

## Usage

```ts
import { useJwt } from '@vueuse/integrations/useJwt'
import { defineComponent } from 'vue'

const encodedJwt = ref('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyfQ.L8i6g3PfcHlioHCCPURC9pmXT7gdJpx3kOoyAfNUwCc')
const { header, payload } = useJwt(encodedJwt)
```

## Type Declarations

```ts
export interface UseJwtOptions<Fallback> {
  /**
   * Value returned when encounter error on decoding
   *
   * @default null
   */
  fallbackValue?: Fallback
  /**
   * Error callback for decoding
   */
  onError?: (error: unknown) => void
}
export interface UseJwtReturn<Payload, Header, Fallback> {
  header: ComputedRef<Header | Fallback>
  payload: ComputedRef<Payload | Fallback>
}
/**
 * Reactive decoded jwt token.
 *
 * @see https://vueuse.org/useJwt
 */
export declare function useJwt<
  Payload extends object = JwtPayload,
  Header extends object = JwtHeader,
  Fallback = null,
>(
  encodedJwt: MaybeRefOrGetter<string>,
  options?: UseJwtOptions<Fallback>,
): UseJwtReturn<Payload, Header, Fallback>
```
