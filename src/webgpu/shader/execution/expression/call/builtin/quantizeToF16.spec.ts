export const description = `
Execution tests for the 'quantizeToF16' builtin function

T is f32 or vecN<f32>
@const fn quantizeToF16(e: T ) -> T
Quantizes a 32-bit floating point value e as if e were converted to a IEEE 754
binary16 value, and then converted back to a IEEE 754 binary32 value.
Component-wise when T is a vector.
`;

import { makeTestGroup } from '../../../../../../common/framework/test_group.js';
import { GPUTest } from '../../../../../gpu_test.js';
import { allInputSources } from '../../expression.js';

export const g = makeTestGroup(GPUTest);

g.test('f32')
  .specURL('https://www.w3.org/TR/WGSL/#float-builtin-functions')
  .desc(`f32 tests`)
  .params(u =>
    u.combine('inputSource', allInputSources).combine('vectorize', [undefined, 2, 3, 4] as const)
  )
  .unimplemented();
