export const description = `Tests writeTexture validation.`;

import { makeTestGroup } from '../../../../common/framework/test_group.js';
import { GPUConst } from '../../../constants.js';
import { kResourceStates } from '../../../gpu_test.js';
import { ValidationTest } from '../validation_test.js';

export const g = makeTestGroup(ValidationTest);

g.test('texture_state')
  .desc(
    `
  Test that the texture used for GPUQueue.writeTexture() must be valid. Tests calling writeTexture
  with {valid, invalid, destroyed} texture.
  `
  )
  .params(u => u.combine('textureState', kResourceStates))
  .fn(async t => {
    const { textureState } = t.params;
    const texture = t.createTextureWithState(textureState);
    const data = new Uint8Array(16);
    const size = [1, 1];

    const isValid = textureState === 'valid';

    t.expectValidationError(() => {
      t.device.queue.writeTexture({ texture }, data, {}, size);
    }, !isValid);
  });

g.test('usages')
  .desc(
    `
  Tests calling writeTexture with the texture missed COPY_DST usage.
    - texture {with, without} COPY DST usage
  `
  )
  .paramsSubcasesOnly([
    { usage: GPUConst.TextureUsage.COPY_DST }, // control case
    { usage: GPUConst.TextureUsage.STORAGE_BINDING },
    { usage: GPUConst.TextureUsage.STORAGE_BINDING | GPUConst.TextureUsage.COPY_SRC },
    { usage: GPUConst.TextureUsage.STORAGE_BINDING | GPUConst.TextureUsage.COPY_DST },
  ])
  .fn(async t => {
    const { usage } = t.params;
    const texture = t.device.createTexture({
      size: { width: 16, height: 16 },
      usage,
      format: 'rgba8unorm' as const,
    });
    const data = new Uint8Array(16);
    const size = [1, 1];

    const isValid = usage & GPUConst.TextureUsage.COPY_DST ? true : false;
    t.expectValidationError(() => {
      t.device.queue.writeTexture({ texture }, data, {}, size);
    }, !isValid);
  });

g.test('sample_count')
  .desc(
    `
  Test that the texture sample count. Check that a validation error is generated if sample count is
  not 1.
  `
  )
  .params(u => u.combine('sampleCount', [1, 4]))
  .fn(async t => {
    const { sampleCount } = t.params;
    const texture = t.device.createTexture({
      size: { width: 16, height: 16 },
      sampleCount,
      format: 'bgra8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const data = new Uint8Array(16);
    const size = [1, 1];

    const isValid = sampleCount === 1;

    t.expectValidationError(() => {
      t.device.queue.writeTexture({ texture }, data, {}, size);
    }, !isValid);
  });
