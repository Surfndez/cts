export const description = `
Execution tests for the 'inverseSqrt' builtin function

S is AbstractFloat, f32, f16
T is S or vecN<S>
@const fn inverseSqrt(e: T ) -> T
Returns the reciprocal of sqrt(e). Component-wise when T is a vector.
`;

import { makeTestGroup } from '../../../../../../common/framework/test_group.js';
import { GPUTest } from '../../../../../gpu_test.js';
import { kValue } from '../../../../../util/constants.js';
import { TypeF32 } from '../../../../../util/conversion.js';
import { inverseSqrtInterval } from '../../../../../util/f32_interval.js';
import { biasedRange, linearRange } from '../../../../../util/math.js';
import { allInputSources, Case, makeUnaryF32IntervalCase, run } from '../../expression.js';

import { builtin } from './builtin.js';

export const g = makeTestGroup(GPUTest);

g.test('abstract_float')
  .specURL('https://www.w3.org/TR/WGSL/#float-builtin-functions')
  .desc(`abstract float tests`)
  .params(u =>
    u.combine('inputSource', allInputSources).combine('vectorize', [undefined, 2, 3, 4] as const)
  )
  .unimplemented();

g.test('f32')
  .specURL('https://www.w3.org/TR/WGSL/#float-builtin-functions')
  .desc(`f32 tests`)
  .params(u =>
    u.combine('inputSource', allInputSources).combine('vectorize', [undefined, 2, 3, 4] as const)
  )
  .fn(async t => {
    const makeCase = (x: number): Case => {
      return makeUnaryF32IntervalCase(x, inverseSqrtInterval);
    };

    const cases: Array<Case> = [
      // 0 < x <= 1 linearly spread
      ...linearRange(kValue.f32.positive.min, 1, 100),
      // 1 <= x < 2^32, biased towards 1
      ...biasedRange(1, 2 ** 32, 1000),
    ].map(x => makeCase(x));

    run(t, builtin('inverseSqrt'), [TypeF32], TypeF32, t.params, cases);
  });

g.test('f16')
  .specURL('https://www.w3.org/TR/WGSL/#float-builtin-functions')
  .desc(`f16 tests`)
  .params(u =>
    u.combine('inputSource', allInputSources).combine('vectorize', [undefined, 2, 3, 4] as const)
  )
  .unimplemented();
