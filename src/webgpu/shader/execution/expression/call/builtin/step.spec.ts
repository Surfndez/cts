export const description = `
Execution tests for the 'step' builtin function

S is AbstractFloat, f32, f16
T is S or vecN<S>
@const fn step(edge: T ,x: T ) -> T
Returns 1.0 if edge ≤ x, and 0.0 otherwise. Component-wise when T is a vector.
`;

import { makeTestGroup } from '../../../../../../common/framework/test_group.js';
import { GPUTest } from '../../../../../gpu_test.js';
import { anyOf } from '../../../../../util/compare.js';
import { f32, TypeF32 } from '../../../../../util/conversion.js';
import { F32Interval, stepInterval } from '../../../../../util/f32_interval.js';
import { fullF32Range, quantizeToF32 } from '../../../../../util/math.js';
import { allInputSources, Case, run } from '../../expression.js';

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
    const zeroInterval = new F32Interval(0, 0);
    const oneInterval = new F32Interval(1, 1);

    // stepInterval's return value isn't always interpreted as an acceptance
    // interval, so makeBinaryF32IntervalCase cannot be used here.
    // See the comment block on stepInterval for more details
    const makeCase = (edge: number, x: number): Case => {
      edge = quantizeToF32(edge);
      x = quantizeToF32(x);
      const expected = stepInterval(edge, x);

      // [0, 0], [1, 1], or [-∞, +∞] cases
      if (expected.isPoint() || !expected.isFinite()) {
        return { input: [f32(edge), f32(x)], expected };
      }

      // [0, 1] case
      return {
        input: [f32(edge), f32(x)],
        expected: anyOf(zeroInterval, oneInterval),
      };
    };

    const range = fullF32Range();
    const cases: Array<Case> = [];
    range.forEach(edge => {
      range.forEach(x => {
        cases.push(makeCase(edge, x));
      });
    });

    run(t, builtin('step'), [TypeF32, TypeF32], TypeF32, t.params, cases);
  });

g.test('f16')
  .specURL('https://www.w3.org/TR/WGSL/#float-builtin-functions')
  .desc(`f16 tests`)
  .params(u =>
    u.combine('inputSource', allInputSources).combine('vectorize', [undefined, 2, 3, 4] as const)
  )
  .unimplemented();
