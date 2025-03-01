export const description = `
Execution tests for the 'ldexp' builtin function

S is AbstractFloat, f32, f16
T is S or vecN<S>

K is AbstractInt, i32
I is K or vecN<K>, where
  I is a scalar if T is a scalar, or a vector when T is a vector

@const fn ldexp(e1: T ,e2: I ) -> T
Returns e1 * 2^e2. Component-wise when T is a vector.
`;

import { makeTestGroup } from '../../../../../../common/framework/test_group.js';
import { GPUTest } from '../../../../../gpu_test.js';
import { f32, i32, TypeF32, TypeI32 } from '../../../../../util/conversion.js';
import { ldexpInterval } from '../../../../../util/f32_interval.js';
import {
  fullF32Range,
  fullI32Range,
  quantizeToF32,
  quantizeToI32,
} from '../../../../../util/math.js';
import { allInputSources, Case, run } from '../../expression.js';

import { builtin } from './builtin.js';

export const g = makeTestGroup(GPUTest);

g.test('abstract_float')
  .specURL('https://www.w3.org/TR/WGSL/#float-builtin-functions')
  .desc(
    `
`
  )
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
    const makeCase = (e1: number, e2: number): Case => {
      // Due to the heterogeneous types of the params to ldexp (f32 & i32),
      // makeBinaryF32IntervalCase cannot be used here.
      e1 = quantizeToF32(e1);
      e2 = quantizeToI32(e2);
      const expected = ldexpInterval(e1, e2);
      return { input: [f32(e1), i32(e2)], expected };
    };

    const cases: Array<Case> = [];
    fullF32Range().forEach(e1 => {
      fullI32Range().forEach(e2 => {
        cases.push(makeCase(e1, e2));
      });
    });
    run(t, builtin('ldexp'), [TypeF32, TypeI32], TypeF32, t.params, cases);
  });

g.test('f16')
  .specURL('https://www.w3.org/TR/WGSL/#float-builtin-functions')
  .desc(`f16 tests`)
  .params(u =>
    u.combine('inputSource', allInputSources).combine('vectorize', [undefined, 2, 3, 4] as const)
  )
  .unimplemented();
