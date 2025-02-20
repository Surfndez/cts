export const description = `
render pass descriptor validation tests.

TODO: review for completeness
`;

import { makeTestGroup } from '../../../../common/framework/test_group.js';
import {
  kDepthStencilFormats,
  kQueryTypes,
  kRenderableColorTextureFormats,
  kTextureFormatInfo,
} from '../../../capability_info.js';
import { GPUConst } from '../../../constants.js';
import { ValidationTest } from '../validation_test.js';

class F extends ValidationTest {
  createTexture(
    options: {
      format?: GPUTextureFormat;
      width?: number;
      height?: number;
      arrayLayerCount?: number;
      mipLevelCount?: number;
      sampleCount?: number;
      usage?: GPUTextureUsageFlags;
    } = {}
  ): GPUTexture {
    const {
      format = 'rgba8unorm',
      width = 16,
      height = 16,
      arrayLayerCount = 1,
      mipLevelCount = 1,
      sampleCount = 1,
      usage = GPUTextureUsage.RENDER_ATTACHMENT,
    } = options;

    return this.device.createTexture({
      size: { width, height, depthOrArrayLayers: arrayLayerCount },
      format,
      mipLevelCount,
      sampleCount,
      usage,
    });
  }

  getColorAttachment(
    texture: GPUTexture,
    textureViewDescriptor?: GPUTextureViewDescriptor
  ): GPURenderPassColorAttachment {
    const view = texture.createView(textureViewDescriptor);

    return {
      view,
      clearValue: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'store',
    };
  }

  getDepthStencilAttachment(
    texture: GPUTexture,
    textureViewDescriptor?: GPUTextureViewDescriptor
  ): GPURenderPassDepthStencilAttachment {
    const view = texture.createView(textureViewDescriptor);

    return {
      view,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
      stencilClearValue: 0,
      stencilLoadOp: 'clear',
      stencilStoreOp: 'store',
    };
  }

  tryRenderPass(success: boolean, descriptor: GPURenderPassDescriptor): void {
    const commandEncoder = this.device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass(descriptor);
    renderPass.end();

    this.expectValidationError(() => {
      commandEncoder.finish();
    }, !success);
  }
}

export const g = makeTestGroup(F);

g.test('attachments,one_color_attachment')
  .desc(`Test that a render pass works with only one color attachment.`)
  .fn(t => {
    const colorTexture = t.createTexture({ format: 'rgba8unorm' });
    const descriptor = {
      colorAttachments: [t.getColorAttachment(colorTexture)],
    };

    t.tryRenderPass(true, descriptor);
  });

g.test('attachments,one_depth_stencil_attachment')
  .desc(`Test that a render pass works with only one depthStencil attachment.`)
  .fn(t => {
    const depthStencilTexture = t.createTexture({ format: 'depth24plus-stencil8' });
    const descriptor = {
      colorAttachments: [],
      depthStencilAttachment: t.getDepthStencilAttachment(depthStencilTexture),
    };

    t.tryRenderPass(true, descriptor);
  });

g.test('color_attachments,empty')
  .desc(
    `
  Test that when colorAttachments has all values be 'undefined' or the sequence is empty, the
  depthStencilAttachment must not be 'undefined'.
  `
  )
  .paramsSubcasesOnly(u =>
    u
      .combine('colorAttachments', [
        [],
        [undefined],
        [undefined, undefined],
        new Array(8).fill(undefined),
        [{ format: 'rgba8unorm' }],
      ])
      .combine('hasDepthStencilAttachment', [false, true])
  )
  .fn(async t => {
    const { colorAttachments, hasDepthStencilAttachment } = t.params;

    let isEmptyColorTargets = true;
    for (let i = 0; i < colorAttachments.length; i++) {
      if (colorAttachments[i] !== undefined) {
        isEmptyColorTargets = false;
        const colorTexture = t.createTexture();
        colorAttachments[i] = t.getColorAttachment(colorTexture);
      }
    }

    const _success = !isEmptyColorTargets || hasDepthStencilAttachment;
    t.tryRenderPass(_success, {
      colorAttachments,
      depthStencilAttachment: hasDepthStencilAttachment
        ? t.getDepthStencilAttachment(t.createTexture({ format: 'depth24plus-stencil8' }))
        : undefined,
    });
  });

g.test('color_attachments,out_of_bounds')
  .desc(
    `
  Test that the out of bound of color attachment indexes are handled.
    - a validation error is generated when color attachments exceed the maximum limit(8).
  `
  )
  .paramsSimple([
    { colorAttachmentsCount: 8, _success: true }, // Control case
    { colorAttachmentsCount: 9, _success: false }, // Out of bounds
  ])
  .fn(async t => {
    const { colorAttachmentsCount, _success } = t.params;

    const colorAttachments = [];
    for (let i = 0; i < colorAttachmentsCount; i++) {
      const colorTexture = t.createTexture();
      colorAttachments.push(t.getColorAttachment(colorTexture));
    }

    t.tryRenderPass(_success, { colorAttachments });
  });

g.test('attachments,same_size')
  .desc(
    `
  Test that attachments have the same size. Otherwise, a validation error should be generated.
    - Succeed if all attachments have the same size.
    - Fail if one of the color attachments has a different size.
    - Fail if the depth stencil attachment has a different size.
  `
  )
  .fn(async t => {
    const colorTexture1x1A = t.createTexture({ width: 1, height: 1, format: 'rgba8unorm' });
    const colorTexture1x1B = t.createTexture({ width: 1, height: 1, format: 'rgba8unorm' });
    const colorTexture2x2 = t.createTexture({ width: 2, height: 2, format: 'rgba8unorm' });
    const depthStencilTexture1x1 = t.createTexture({
      width: 1,
      height: 1,
      format: 'depth24plus-stencil8',
    });
    const depthStencilTexture2x2 = t.createTexture({
      width: 2,
      height: 2,
      format: 'depth24plus-stencil8',
    });

    {
      // Control case: all the same size (1x1)
      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          t.getColorAttachment(colorTexture1x1A),
          t.getColorAttachment(colorTexture1x1B),
        ],
        depthStencilAttachment: t.getDepthStencilAttachment(depthStencilTexture1x1),
      };

      t.tryRenderPass(true, descriptor);
    }
    {
      // One of the color attachments has a different size
      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          t.getColorAttachment(colorTexture1x1A),
          t.getColorAttachment(colorTexture2x2),
        ],
      };

      t.tryRenderPass(false, descriptor);
    }
    {
      // The depth stencil attachment has a different size
      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          t.getColorAttachment(colorTexture1x1A),
          t.getColorAttachment(colorTexture1x1B),
        ],
        depthStencilAttachment: t.getDepthStencilAttachment(depthStencilTexture2x2),
      };

      t.tryRenderPass(false, descriptor);
    }
  });

g.test('attachments,color_depth_mismatch')
  .desc(`Test that attachments match whether they are used for color or depth stencil.`)
  .fn(async t => {
    const colorTexture = t.createTexture({ format: 'rgba8unorm' });
    const depthStencilTexture = t.createTexture({ format: 'depth24plus-stencil8' });

    {
      // Using depth-stencil for color
      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [t.getColorAttachment(depthStencilTexture)],
      };

      t.tryRenderPass(false, descriptor);
    }
    {
      // Using color for depth-stencil
      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [],
        depthStencilAttachment: t.getDepthStencilAttachment(colorTexture),
      };

      t.tryRenderPass(false, descriptor);
    }
  });

g.test('attachments,layer_count')
  .desc(
    `
  Test the layer counts for color or depth stencil.
    - Fail if using 2D array texture view with arrayLayerCount > 1.
    - Succeed if using 2D array texture view that covers the first layer of the texture.
    - Succeed if using 2D array texture view that covers the last layer for depth stencil.
  `
  )
  .paramsSimple([
    { arrayLayerCount: 5, baseArrayLayer: 0, _success: false },
    { arrayLayerCount: 1, baseArrayLayer: 0, _success: true },
    { arrayLayerCount: 1, baseArrayLayer: 9, _success: true },
  ])
  .fn(async t => {
    const { arrayLayerCount, baseArrayLayer, _success } = t.params;

    const ARRAY_LAYER_COUNT = 10;
    const MIP_LEVEL_COUNT = 1;
    const COLOR_FORMAT = 'rgba8unorm';
    const DEPTH_STENCIL_FORMAT = 'depth24plus-stencil8';

    const colorTexture = t.createTexture({
      format: COLOR_FORMAT,
      width: 32,
      height: 32,
      mipLevelCount: MIP_LEVEL_COUNT,
      arrayLayerCount: ARRAY_LAYER_COUNT,
    });
    const depthStencilTexture = t.createTexture({
      format: DEPTH_STENCIL_FORMAT,
      width: 32,
      height: 32,
      mipLevelCount: MIP_LEVEL_COUNT,
      arrayLayerCount: ARRAY_LAYER_COUNT,
    });

    const baseTextureViewDescriptor: GPUTextureViewDescriptor = {
      dimension: '2d-array',
      baseArrayLayer,
      arrayLayerCount,
      baseMipLevel: 0,
      mipLevelCount: MIP_LEVEL_COUNT,
    };

    {
      // Check 2D array texture view for color
      const textureViewDescriptor: GPUTextureViewDescriptor = {
        ...baseTextureViewDescriptor,
        format: COLOR_FORMAT,
      };

      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [t.getColorAttachment(colorTexture, textureViewDescriptor)],
      };

      t.tryRenderPass(_success, descriptor);
    }
    {
      // Check 2D array texture view for depth stencil
      const textureViewDescriptor: GPUTextureViewDescriptor = {
        ...baseTextureViewDescriptor,
        format: DEPTH_STENCIL_FORMAT,
      };

      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [],
        depthStencilAttachment: t.getDepthStencilAttachment(
          depthStencilTexture,
          textureViewDescriptor
        ),
      };

      t.tryRenderPass(_success, descriptor);
    }
  });

g.test('attachments,mip_level_count')
  .desc(
    `
  Test the mip level count for color or depth stencil.
    - Fail if using 2D texture view with mipLevelCount > 1.
    - Succeed if using 2D texture view that covers the first level of the texture.
    - Succeed if using 2D texture view that covers the last level of the texture.
  `
  )
  .paramsSimple([
    { mipLevelCount: 2, baseMipLevel: 0, _success: false },
    { mipLevelCount: 1, baseMipLevel: 0, _success: true },
    { mipLevelCount: 1, baseMipLevel: 3, _success: true },
  ])
  .fn(async t => {
    const { mipLevelCount, baseMipLevel, _success } = t.params;

    const ARRAY_LAYER_COUNT = 1;
    const MIP_LEVEL_COUNT = 4;
    const COLOR_FORMAT = 'rgba8unorm';
    const DEPTH_STENCIL_FORMAT = 'depth24plus-stencil8';

    const colorTexture = t.createTexture({
      format: COLOR_FORMAT,
      width: 32,
      height: 32,
      mipLevelCount: MIP_LEVEL_COUNT,
      arrayLayerCount: ARRAY_LAYER_COUNT,
    });
    const depthStencilTexture = t.createTexture({
      format: DEPTH_STENCIL_FORMAT,
      width: 32,
      height: 32,
      mipLevelCount: MIP_LEVEL_COUNT,
      arrayLayerCount: ARRAY_LAYER_COUNT,
    });

    const baseTextureViewDescriptor: GPUTextureViewDescriptor = {
      dimension: '2d',
      baseArrayLayer: 0,
      arrayLayerCount: ARRAY_LAYER_COUNT,
      baseMipLevel,
      mipLevelCount,
    };

    {
      // Check 2D texture view for color
      const textureViewDescriptor: GPUTextureViewDescriptor = {
        ...baseTextureViewDescriptor,
        format: COLOR_FORMAT,
      };

      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [t.getColorAttachment(colorTexture, textureViewDescriptor)],
      };

      t.tryRenderPass(_success, descriptor);
    }
    {
      // Check 2D texture view for depth stencil
      const textureViewDescriptor: GPUTextureViewDescriptor = {
        ...baseTextureViewDescriptor,
        format: DEPTH_STENCIL_FORMAT,
      };

      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [],
        depthStencilAttachment: t.getDepthStencilAttachment(
          depthStencilTexture,
          textureViewDescriptor
        ),
      };

      t.tryRenderPass(_success, descriptor);
    }
  });

g.test('color_attachments,non_multisampled')
  .desc(
    `
  Test that setting a resolve target is invalid if the color attachments is non multisampled.
  `
  )
  .fn(async t => {
    const colorTexture = t.createTexture({ sampleCount: 1 });
    const resolveTargetTexture = t.createTexture({ sampleCount: 1 });

    const descriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: colorTexture.createView(),
          resolveTarget: resolveTargetTexture.createView(),
          clearValue: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };

    t.tryRenderPass(false, descriptor);
  });

g.test('color_attachments,sample_count')
  .desc(
    `
  Test the usages of multisampled textures for color attachments.
    - Succeed if using a multisampled color attachment without setting a resolve target.
    - Fail if using multiple color attachments with different sample counts.
  `
  )
  .fn(async t => {
    const colorTexture = t.createTexture({ sampleCount: 1 });
    const multisampledColorTexture = t.createTexture({ sampleCount: 4 });

    {
      // It is allowed to use a multisampled color attachment without setting resolve target
      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [t.getColorAttachment(multisampledColorTexture)],
      };
      t.tryRenderPass(true, descriptor);
    }
    {
      // It is not allowed to use multiple color attachments with different sample counts
      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          t.getColorAttachment(colorTexture),
          t.getColorAttachment(multisampledColorTexture),
        ],
      };

      t.tryRenderPass(false, descriptor);
    }
  });

g.test('resolveTarget,sample_count')
  .desc(
    `
  Test that using multisampled resolve target is invalid for color attachments.
  `
  )
  .fn(async t => {
    const multisampledColorTexture = t.createTexture({ sampleCount: 4 });
    const multisampledResolveTargetTexture = t.createTexture({ sampleCount: 4 });

    const colorAttachment = t.getColorAttachment(multisampledColorTexture);
    colorAttachment.resolveTarget = multisampledResolveTargetTexture.createView();

    const descriptor: GPURenderPassDescriptor = {
      colorAttachments: [colorAttachment],
    };

    t.tryRenderPass(false, descriptor);
  });

g.test('resolveTarget,array_layer_count')
  .desc(
    `
  Test that using a resolve target with array layer count is greater than 1 is invalid for color
  attachments.
  `
  )
  .fn(async t => {
    const multisampledColorTexture = t.createTexture({ sampleCount: 4 });
    const resolveTargetTexture = t.createTexture({ arrayLayerCount: 2 });

    const colorAttachment = t.getColorAttachment(multisampledColorTexture);
    colorAttachment.resolveTarget = resolveTargetTexture.createView({ dimension: '2d-array' });

    const descriptor: GPURenderPassDescriptor = {
      colorAttachments: [colorAttachment],
    };

    t.tryRenderPass(false, descriptor);
  });

g.test('resolveTarget,mipmap_level_count')
  .desc(
    `
  Test that using a resolve target with that mipmap level count is greater than 1 is invalid for
  color attachments.
  `
  )
  .fn(async t => {
    const multisampledColorTexture = t.createTexture({ sampleCount: 4 });
    const resolveTargetTexture = t.createTexture({ mipLevelCount: 2 });

    const colorAttachment = t.getColorAttachment(multisampledColorTexture);
    colorAttachment.resolveTarget = resolveTargetTexture.createView();

    const descriptor: GPURenderPassDescriptor = {
      colorAttachments: [colorAttachment],
    };

    t.tryRenderPass(false, descriptor);
  });

g.test('resolveTarget,usage')
  .desc(
    `
  Test that using a resolve target whose usage is not RENDER_ATTACHMENT is invalid for color
  attachments.
  `
  )
  .paramsSimple([
    { usage: GPUConst.TextureUsage.COPY_SRC | GPUConst.TextureUsage.COPY_DST },
    { usage: GPUConst.TextureUsage.STORAGE_BINDING | GPUConst.TextureUsage.TEXTURE_BINDING },
    { usage: GPUConst.TextureUsage.STORAGE_BINDING | GPUConst.TextureUsage.STORAGE },
    { usage: GPUConst.TextureUsage.RENDER_ATTACHMENT | GPUConst.TextureUsage.TEXTURE_BINDING },
  ])
  .fn(async t => {
    const { usage } = t.params;

    const multisampledColorTexture = t.createTexture({ sampleCount: 4 });
    const resolveTargetTexture = t.createTexture({ usage });

    const colorAttachment = t.getColorAttachment(multisampledColorTexture);
    colorAttachment.resolveTarget = resolveTargetTexture.createView();

    const descriptor: GPURenderPassDescriptor = {
      colorAttachments: [colorAttachment],
    };

    const isValid = usage & GPUConst.TextureUsage.RENDER_ATTACHMENT ? true : false;
    t.tryRenderPass(isValid, descriptor);
  });

g.test('resolveTarget,error_state')
  .desc(`Test that a resolve target that has a error is invalid for color attachments.`)
  .fn(async t => {
    const ARRAY_LAYER_COUNT = 1;

    const multisampledColorTexture = t.createTexture({ sampleCount: 4 });
    const resolveTargetTexture = t.createTexture({ arrayLayerCount: ARRAY_LAYER_COUNT });

    const colorAttachment = t.getColorAttachment(multisampledColorTexture);
    t.expectValidationError(() => {
      colorAttachment.resolveTarget = resolveTargetTexture.createView({
        dimension: '2d',
        format: 'rgba8unorm',
        baseArrayLayer: ARRAY_LAYER_COUNT + 1,
      });
    });

    const descriptor: GPURenderPassDescriptor = {
      colorAttachments: [colorAttachment],
    };

    t.tryRenderPass(false, descriptor);
  });

g.test('resolveTarget,single_sample_count')
  .desc(
    `
  Test that a resolve target that has multi sample color attachment and a single resolve target is
  valid.
  `
  )
  .fn(async t => {
    const multisampledColorTexture = t.createTexture({ sampleCount: 4 });
    const resolveTargetTexture = t.createTexture({ sampleCount: 1 });

    const colorAttachment = t.getColorAttachment(multisampledColorTexture);
    colorAttachment.resolveTarget = resolveTargetTexture.createView();

    const descriptor: GPURenderPassDescriptor = {
      colorAttachments: [colorAttachment],
    };

    t.tryRenderPass(true, descriptor);
  });

g.test('resolveTarget,different_format')
  .desc(`Test that a resolve target that has a different format is invalid.`)
  .fn(async t => {
    const multisampledColorTexture = t.createTexture({ sampleCount: 4 });
    const resolveTargetTexture = t.createTexture({ format: 'bgra8unorm' });

    const colorAttachment = t.getColorAttachment(multisampledColorTexture);
    colorAttachment.resolveTarget = resolveTargetTexture.createView();

    const descriptor: GPURenderPassDescriptor = {
      colorAttachments: [colorAttachment],
    };

    t.tryRenderPass(false, descriptor);
  });

g.test('resolveTarget,different_size')
  .desc(
    `
  Test that a resolve target that has a different size with the color attachment is invalid.
  `
  )
  .fn(async t => {
    const size = 16;
    const multisampledColorTexture = t.createTexture({ width: size, height: size, sampleCount: 4 });
    const resolveTargetTexture = t.createTexture({
      width: size * 2,
      height: size * 2,
      mipLevelCount: 2,
    });

    {
      const resolveTargetTextureView = resolveTargetTexture.createView({
        baseMipLevel: 0,
        mipLevelCount: 1,
      });

      const colorAttachment = t.getColorAttachment(multisampledColorTexture);
      colorAttachment.resolveTarget = resolveTargetTextureView;

      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [colorAttachment],
      };

      t.tryRenderPass(false, descriptor);
    }
    {
      const resolveTargetTextureView = resolveTargetTexture.createView({ baseMipLevel: 1 });

      const colorAttachment = t.getColorAttachment(multisampledColorTexture);
      colorAttachment.resolveTarget = resolveTargetTextureView;

      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [colorAttachment],
      };

      t.tryRenderPass(true, descriptor);
    }
  });

g.test('depth_stencil_attachment,sample_counts_mismatch')
  .desc(
    `
  Test that the depth stencil attachment that has different number of samples with the color
  attachment is invalid.
  `
  )
  .fn(async t => {
    const multisampledDepthStencilTexture = t.createTexture({
      sampleCount: 4,
      format: 'depth24plus-stencil8',
    });

    {
      // It is not allowed to use a depth stencil attachment whose sample count is different from
      // the one of the color attachment.
      const depthStencilTexture = t.createTexture({
        sampleCount: 1,
        format: 'depth24plus-stencil8',
      });
      const multisampledColorTexture = t.createTexture({ sampleCount: 4 });
      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [t.getColorAttachment(multisampledColorTexture)],
        depthStencilAttachment: t.getDepthStencilAttachment(depthStencilTexture),
      };

      t.tryRenderPass(false, descriptor);
    }
    {
      const colorTexture = t.createTexture({ sampleCount: 1 });
      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [t.getColorAttachment(colorTexture)],
        depthStencilAttachment: t.getDepthStencilAttachment(multisampledDepthStencilTexture),
      };

      t.tryRenderPass(false, descriptor);
    }
    {
      // It is allowed to use a multisampled depth stencil attachment whose sample count is equal to
      // the one of the color attachment.
      const multisampledColorTexture = t.createTexture({ sampleCount: 4 });
      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [t.getColorAttachment(multisampledColorTexture)],
        depthStencilAttachment: t.getDepthStencilAttachment(multisampledDepthStencilTexture),
      };

      t.tryRenderPass(true, descriptor);
    }
    {
      // It is allowed to use a multisampled depth stencil attachment with no color attachment.
      const descriptor: GPURenderPassDescriptor = {
        colorAttachments: [],
        depthStencilAttachment: t.getDepthStencilAttachment(multisampledDepthStencilTexture),
      };

      t.tryRenderPass(true, descriptor);
    }
  });

g.test('depth_stencil_attachment')
  .desc(
    `
  Test GPURenderPassDepthStencilAttachment Usage:
    - depthReadOnly and stencilReadOnly must match if the format is a combined depth-stencil format.
    - depthLoadOp and depthStoreOp must be provided iff the format has a depth aspect and
      depthReadOnly is not true.
    - stencilLoadOp and stencilStoreOp must be provided iff the format has a stencil aspect and
      stencilReadOnly is not true.
  `
  )
  .params(u =>
    u //
      .combine('format', kDepthStencilFormats)
      .beginSubcases()
      .combine('depthReadOnly', [false, true])
      .combine('stencilReadOnly', [false, true])
      .combine('setDepthLoadStoreOp', [false, true])
      .combine('setStencilLoadStoreOp', [false, true])
  )
  .beforeAllSubcases(t => {
    t.selectDeviceForTextureFormatOrSkipTestCase(t.params.format);
  })
  .fn(async t => {
    const {
      format,
      depthReadOnly,
      stencilReadOnly,
      setDepthLoadStoreOp,
      setStencilLoadStoreOp,
    } = t.params;

    let isValid = true;
    const info = kTextureFormatInfo[format];
    if (info.depth && info.stencil) {
      isValid &&= depthReadOnly === stencilReadOnly;
    }

    if (info.depth && !depthReadOnly) {
      isValid &&= setDepthLoadStoreOp;
    } else {
      isValid &&= !setDepthLoadStoreOp;
    }

    if (info.stencil && !stencilReadOnly) {
      isValid &&= setStencilLoadStoreOp;
    } else {
      isValid &&= !setStencilLoadStoreOp;
    }

    const depthStencilAttachment: GPURenderPassDepthStencilAttachment = {
      view: t.createTexture({ format }).createView(),
      depthReadOnly,
      stencilReadOnly,
    };

    if (setDepthLoadStoreOp) {
      depthStencilAttachment.depthLoadOp = 'clear';
      depthStencilAttachment.depthStoreOp = 'store';
    }
    if (setStencilLoadStoreOp) {
      depthStencilAttachment.stencilLoadOp = 'clear';
      depthStencilAttachment.stencilStoreOp = 'store';
    }

    const descriptor = {
      colorAttachments: [t.getColorAttachment(t.createTexture())],
      depthStencilAttachment,
    };

    t.tryRenderPass(isValid, descriptor);
  });

g.test('depth_stencil_attachment,depth_clear_value')
  .desc(
    `
  Test that depthClearValue is invalid if the value is out of the range(0.0 and 1.0) only when
  depthLoadOp is 'clear'.
  `
  )
  .params(u =>
    u
      .combine('depthLoadOp', ['load', 'clear', undefined] as const)
      .combineWithParams([
        { depthClearValue: -1.0 },
        { depthClearValue: 0.0 },
        { depthClearValue: 0.5 },
        { depthClearValue: 1.0 },
        { depthClearValue: 1.5 },
      ])
  )
  .fn(t => {
    const { depthLoadOp, depthClearValue } = t.params;

    const depthStencilTexture = t.createTexture({
      format: depthLoadOp === undefined ? 'stencil8' : 'depth24plus-stencil8',
    });
    const depthStencilAttachment = t.getDepthStencilAttachment(depthStencilTexture);
    depthStencilAttachment.depthClearValue = depthClearValue;
    depthStencilAttachment.depthLoadOp = depthLoadOp;
    if (depthLoadOp === undefined) {
      depthStencilAttachment.depthStoreOp = undefined;
    }

    const descriptor = {
      colorAttachments: [t.getColorAttachment(t.createTexture())],
      depthStencilAttachment,
    };

    const isValid = !(depthLoadOp === 'clear' && (depthClearValue < 0.0 || depthClearValue > 1.0));

    t.tryRenderPass(isValid, descriptor);
  });

g.test('resolveTarget,format_supports_resolve')
  .desc(
    `
  For all formats that support 'multisample', test that they can be used as a resolveTarget
  if and only if they support 'resolve'.
  `
  )
  .params(u =>
    u
      .combine('format', kRenderableColorTextureFormats)
      .filter(t => kTextureFormatInfo[t.format].multisample)
  )
  .fn(async t => {
    const { format } = t.params;
    const multisampledColorTexture = t.createTexture({ format, sampleCount: 4 });
    const resolveTarget = t.createTexture({ format });

    const colorAttachment = t.getColorAttachment(multisampledColorTexture);
    colorAttachment.resolveTarget = resolveTarget.createView();

    t.tryRenderPass(kTextureFormatInfo[format].resolve, {
      colorAttachments: [colorAttachment],
    });
  });

g.test('timestampWrites,query_set_type')
  .desc(
    `
  Test that all entries of the timestampWrites must have type 'timestamp'. If all query types are
  not 'timestamp', a validation error should be generated.
  `
  )
  .params(u =>
    u //
      .combine('queryTypeA', kQueryTypes)
      .combine('queryTypeB', kQueryTypes)
  )
  .beforeAllSubcases(t => {
    t.selectDeviceOrSkipTestCase(['timestamp-query']);
  })
  .fn(async t => {
    const { queryTypeA, queryTypeB } = t.params;

    const timestampWriteA = {
      querySet: t.device.createQuerySet({ type: queryTypeA, count: 1 }),
      queryIndex: 0,
      location: 'beginning' as const,
    };

    const timestampWriteB = {
      querySet: t.device.createQuerySet({ type: queryTypeB, count: 1 }),
      queryIndex: 0,
      location: 'end' as const,
    };

    const isValid = queryTypeA === 'timestamp' && queryTypeB === 'timestamp';

    const colorTexture = t.createTexture();
    const descriptor = {
      colorAttachments: [t.getColorAttachment(colorTexture)],
      timestampWrites: [timestampWriteA, timestampWriteB],
    };

    t.tryRenderPass(isValid, descriptor);
  });

g.test('timestamp_writes_location')
  .desc('Test that entries in timestampWrites do not have the same location.')
  .params(u =>
    u //
      .combine('locationA', ['beginning', 'end'] as const)
      .combine('locationB', ['beginning', 'end'] as const)
  )
  .beforeAllSubcases(t => {
    t.selectDeviceOrSkipTestCase(['timestamp-query']);
  })
  .fn(async t => {
    const { locationA, locationB } = t.params;

    const querySet = t.device.createQuerySet({
      type: 'timestamp',
      count: 1,
    });

    const timestampWriteA = {
      querySet,
      queryIndex: 0,
      location: locationA,
    };

    const timestampWriteB = {
      querySet,
      queryIndex: 1,
      location: locationB,
    };

    const isValid = locationA !== locationB;

    const colorTexture = t.createTexture({ format: 'rgba8unorm' });
    const descriptor = {
      colorAttachments: [t.getColorAttachment(colorTexture)],
      timestampWrites: [timestampWriteA, timestampWriteB],
    };

    t.tryRenderPass(isValid, descriptor);
  });

g.test('timestampWrite,query_index')
  .desc(`Test that querySet.count should be greater than timestampWrite.queryIndex.`)
  .params(u => u.combine('queryIndex', [0, 1, 2, 3]))
  .beforeAllSubcases(t => {
    t.selectDeviceOrSkipTestCase(['timestamp-query']);
  })
  .fn(async t => {
    const { queryIndex } = t.params;

    const querySetCount = 2;

    const timestampWrite = {
      querySet: t.device.createQuerySet({ type: 'timestamp', count: querySetCount }),
      queryIndex,
      location: 'beginning' as const,
    };

    const isValid = queryIndex < querySetCount;

    const colorTexture = t.createTexture();
    const descriptor = {
      colorAttachments: [t.getColorAttachment(colorTexture)],
      timestampWrites: [timestampWrite],
    };

    t.tryRenderPass(isValid, descriptor);
  });

g.test('timestampWrite,same_query_index')
  .desc(
    `
  Test that timestampWrites is invalid if each entry has the same queryIndex in the same querySet.
  `
  )
  .params(u =>
    u //
      .combine('queryIndexA', [0, 1])
      .combine('queryIndexB', [0, 1])
  )
  .beforeAllSubcases(t => {
    t.selectDeviceOrSkipTestCase(['timestamp-query']);
  })
  .fn(async t => {
    const { queryIndexA, queryIndexB } = t.params;

    const querySet = t.device.createQuerySet({
      type: 'timestamp',
      count: 2,
    });

    const timestampWriteA = {
      querySet,
      queryIndex: queryIndexA,
      location: 'beginning' as const,
    };

    const timestampWriteB = {
      querySet,
      queryIndex: queryIndexB,
      location: 'end' as const,
    };

    const isValid = queryIndexA !== queryIndexB;

    const colorTexture = t.createTexture();
    const descriptor = {
      colorAttachments: [t.getColorAttachment(colorTexture)],
      timestampWrites: [timestampWriteA, timestampWriteB],
    };

    t.tryRenderPass(isValid, descriptor);
  });

g.test('occlusionQuerySet,query_set_type')
  .desc(`Test that occlusionQuerySet must have type 'occlusion'.`)
  .params(u => u.combine('queryType', kQueryTypes))
  .beforeAllSubcases(t => {
    if (t.params.queryType === 'timestamp') {
      t.selectDeviceOrSkipTestCase(['timestamp-query']);
    }
  })
  .fn(async t => {
    const { queryType } = t.params;

    const querySet = t.device.createQuerySet({
      type: queryType,
      count: 1,
    });

    const colorTexture = t.createTexture();
    const descriptor = {
      colorAttachments: [t.getColorAttachment(colorTexture)],
      occlusionQuerySet: querySet,
    };

    const isValid = queryType === 'occlusion';
    t.tryRenderPass(isValid, descriptor);
  });
