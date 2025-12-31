import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'
import { Effect } from 'effect'

describe('example', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })

  it.effect('works with Effect', () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed(42)
      expect(result).toBe(42)
    })
  )
})
