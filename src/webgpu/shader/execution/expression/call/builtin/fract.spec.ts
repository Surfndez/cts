export const description = `
Execution tests for the 'fract' builtin function

S is AbstractFloat, f32, f16
T is S or vecN<S>
@const fn fract(e: T ) -> T
Returns the fractional part of e, computed as e - floor(e).
Component-wise when T is a vector.
`;

import { makeTestGroup } from '../../../../../../common/framework/test_group.js';
import { GPUTest } from '../../../../../gpu_test.js';
import { TypeF32 } from '../../../../../util/conversion.js';
import { fractInterval } from '../../../../../util/f32_interval.js';
import { fullF32Range } from '../../../../../util/math.js';
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
      return makeUnaryF32IntervalCase(x, fractInterval);
    };

    const cases: Array<Case> = [
      0.5, // 0.5 -> 0.5
      0.9, // ~0.9 -> ~0.9
      1, // 1 -> 0
      2, // 2 -> 0
      1.11, // ~1.11 -> ~0.11
      10.0001, // ~10.0001 -> ~0.0001
      -0.1, // ~-0.1 -> ~0.9
      -0.5, // -0.5 -> 0.5
      -0.9, // ~-0.9 -> ~0.1
      -1, // -1 -> 0
      -2, // -2 -> 0
      -1.11, // ~-1.11 -> ~0.89
      -10.0001, // -10.0001 -> ~0.9999
      ...fullF32Range(),
    ].map(makeCase);

    // prettier-ignore
    run(t, builtin('fract'), [TypeF32], TypeF32, t.params, cases);
  });

g.test('f16')
  .specURL('https://www.w3.org/TR/WGSL/#float-builtin-functions')
  .desc(`f16 tests`)
  .params(u =>
    u.combine('inputSource', allInputSources).combine('vectorize', [undefined, 2, 3, 4] as const)
  )
  .unimplemented();
