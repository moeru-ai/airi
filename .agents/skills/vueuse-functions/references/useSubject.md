---
category: '@RxJS'
---

# useSubject

Bind an RxJS [`Subject`](https://rxjs.dev/guide/subject) to a `ref` and propagate value changes both ways.

## Usage

<!-- TODO: import rxjs error if enable twoslash -->

```ts no-twoslash
import { useSubject } from '@vueuse/rxjs'
import { Subject } from 'rxjs'

const subject = new Subject()

// setup()
const subjectRef = useSubject(subject)

// Changes to subjectRef.value will be pushed to the subject
subjectRef.value = 'new value'

// Values emitted by the subject will update subjectRef
subject.next('from subject')
```

### With BehaviorSubject

When using a `BehaviorSubject`, the returned ref is initialized with the subject's current value and the type does not include `undefined`:

```ts no-twoslash
import { useSubject } from '@vueuse/rxjs'
import { BehaviorSubject } from 'rxjs'

const subject = new BehaviorSubject('initial')

// setup()
const subjectRef = useSubject(subject) // Ref<string>, not Ref<string | undefined>
console.log(subjectRef.value) // 'initial'
```

### Error Handling

If you want to add custom error handling to a Subject that might error, you can supply an optional `onError` configuration. Without this, RxJS will treat any error in the supplied observable as an "unhandled error" and it will be thrown in a new call stack and reported to `window.onerror` (or `process.on('error')` if you happen to be in node).

```ts no-twoslash
import { useSubject } from '@vueuse/rxjs'
import { Subject } from 'rxjs'

const subject = new Subject()

// setup()
const subjectRef = useSubject(subject, {
  onError: (err) => {
    console.log(err.message) // "oops"
  },
},)
```

## Type Declarations

```ts
export interface UseSubjectOptions<I = undefined> extends Omit<
  UseObservableOptions<I>,
  "initialValue"
> {}
export declare function useSubject<H>(
  subject: BehaviorSubject<H>,
  options?: UseSubjectOptions,
): Ref<H>
export declare function useSubject<H>(
  subject: Subject<H>,
  options?: UseSubjectOptions,
): Ref<H | undefined>
```
