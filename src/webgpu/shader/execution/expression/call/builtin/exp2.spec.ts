export const description = `
Execution tests for the 'exp2' builtin function

S is AbstractFloat, f32, f16
T is S or vecN<S>
@const fn exp2(e: T ) -> T
Returns 2 raised to the power e (e.g. 2^e). Component-wise when T is a vector.
`;

import { makeTestGroup } from '../../../../../../common/framework/test_group.js';
import { GPUTest } from '../../../../../gpu_test.js';
import { kValue } from '../../../../../util/constants.js';
import { TypeF32 } from '../../../../../util/conversion.js';
import { exp2Interval } from '../../../../../util/f32_interval.js';
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
      return makeUnaryF32IntervalCase(x, exp2Interval);
    };

    // floor(log2(max f32 value)) = 127, so exp2(127) will be within range of a f32, but exp2(128) will not
    // floor(ln(max f64 value)) = 1023, so exp2(1023) can be handled by the testing framework, but exp2(1024) will misbehave
    const cases: Array<Case> = [
      0, // Returns 1 by definition
      -128, // Returns subnormal value
      kValue.f32.negative.min, // Closest to returning 0 as possible
      ...biasedRange(kValue.f32.negative.max, -127, 100),
      ...biasedRange(kValue.f32.positive.min, 127, 100),
      ...linearRange(128, 1023, 10), // Overflows f32, but not f64
    ].map(x => makeCase(x));

    run(t, builtin('exp2'), [TypeF32], TypeF32, t.params, cases);
  });

g.test('f16')
  .specURL('https://www.w3.org/TR/WGSL/#float-builtin-functions')
  .desc(`f16 tests`)
  .params(u =>
    u.combine('inputSource', allInputSources).combine('vectorize', [undefined, 2, 3, 4] as const)
  )
  .unimplemented();
