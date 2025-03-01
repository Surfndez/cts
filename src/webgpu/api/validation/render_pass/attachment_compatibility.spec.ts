export const description = `
Validation for attachment compatibility between render passes, bundles, and pipelines
`;

import { makeTestGroup } from '../../../../common/framework/test_group.js';
import { range } from '../../../../common/util/util.js';
import {
  kRegularTextureFormats,
  kSizedDepthStencilFormats,
  kUnsizedDepthStencilFormats,
  kTextureSampleCounts,
  kMaxColorAttachments,
  kTextureFormatInfo,
  getFeaturesForFormats,
  filterFormatsByFeature,
} from '../../../capability_info.js';
import { ValidationTest } from '../validation_test.js';

const kColorAttachmentCounts = range(kMaxColorAttachments, i => i + 1);
const kColorAttachments = kColorAttachmentCounts
  .map(count => {
    // generate cases with 0..1 null attachments at different location
    // e.g. count == 2
    // [
    //    [1, 1],
    //    [0, 1],
    //    [1, 0],
    // ]
    // 0 (false) means null attachment, 1 (true) means non-null attachment, at the slot

    // Special cases: we need at least a color attachment, when we don't have depth stencil attachment
    if (count === 1) {
      return [[1]];
    }
    if (count === 2) {
      return [
        [1, 1],
        [0, 1],
        [1, 0],
      ];
    }

    // [1, 1, ..., 1]: all color attachment are used
    let result = [new Array<boolean>(count).fill(true)];

    // [1, 0, 1, ..., 1]: generate cases with one null attachment at different locations
    result = result.concat(
      range(count, i => {
        const r = new Array<boolean>(count).fill(true);
        r[i] = false;
        return r;
      })
    );

    // [1, 0, 1, ..., 0, 1]: generate cases with two null attachments at different locations
    // To reduce test run time, limit the attachment count to <= 4
    if (count <= 4) {
      result = result.concat(
        range(count - 1, i => {
          const cases = [] as boolean[][];
          for (let j = i + 1; j < count; j++) {
            const r = new Array<boolean>(count).fill(true);
            r[i] = false;
            r[j] = false;
            cases.push(r);
          }
          return cases;
        }).flat()
      );
    }

    return result;
  })
  .flat() as boolean[][];

const kDepthStencilAttachmentFormats = [
  undefined,
  ...kSizedDepthStencilFormats,
  ...kUnsizedDepthStencilFormats,
] as const;

const kFeaturesForDepthStencilAttachmentFormats = getFeaturesForFormats([
  ...kSizedDepthStencilFormats,
  ...kUnsizedDepthStencilFormats,
]);

class F extends ValidationTest {
  createAttachmentTextureView(format: GPUTextureFormat, sampleCount?: number) {
    return this.device
      .createTexture({
        // Size matching the "arbitrary" size used by ValidationTest helpers.
        size: [16, 16, 1],
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        sampleCount,
      })
      .createView();
  }

  createColorAttachment(
    format: GPUTextureFormat | null,
    sampleCount?: number
  ): GPURenderPassColorAttachment | null {
    return format === null
      ? null
      : {
          view: this.createAttachmentTextureView(format, sampleCount),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        };
  }

  createDepthAttachment(
    format: GPUTextureFormat,
    sampleCount?: number
  ): GPURenderPassDepthStencilAttachment {
    const attachment: GPURenderPassDepthStencilAttachment = {
      view: this.createAttachmentTextureView(format, sampleCount),
    };
    if (kTextureFormatInfo[format].depth) {
      attachment.depthClearValue = 0;
      attachment.depthLoadOp = 'clear';
      attachment.depthStoreOp = 'discard';
    }
    if (kTextureFormatInfo[format].stencil) {
      attachment.stencilClearValue = 1;
      attachment.stencilLoadOp = 'clear';
      attachment.stencilStoreOp = 'discard';
    }
    return attachment;
  }

  createRenderPipeline(
    targets: Iterable<GPUColorTargetState | null>,
    depthStencil?: GPUDepthStencilState,
    sampleCount?: number,
    cullMode?: GPUCullMode
  ) {
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({
          code: `
            @vertex fn main() -> @builtin(position) vec4<f32> {
              return vec4<f32>(0.0, 0.0, 0.0, 0.0);
            }`,
        }),
        entryPoint: 'main',
      },
      fragment: {
        module: this.device.createShaderModule({
          code: '@fragment fn main() {}',
        }),
        entryPoint: 'main',
        targets,
      },
      primitive: { topology: 'triangle-list', cullMode },
      depthStencil,
      multisample: { count: sampleCount },
    });
  }
}

export const g = makeTestGroup(F);

const kColorAttachmentFormats = kRegularTextureFormats.filter(format => {
  const info = kTextureFormatInfo[format];
  return info.color && info.renderable;
});

g.test('render_pass_and_bundle,color_format')
  .desc('Test that color attachment formats in render passes and bundles must match.')
  .paramsSubcasesOnly(u =>
    u //
      .combine('passFormat', kColorAttachmentFormats)
      .combine('bundleFormat', kColorAttachmentFormats)
  )
  .fn(t => {
    const { passFormat, bundleFormat } = t.params;
    const bundleEncoder = t.device.createRenderBundleEncoder({
      colorFormats: [bundleFormat],
    });
    const bundle = bundleEncoder.finish();

    const { encoder, validateFinishAndSubmit } = t.createEncoder('non-pass');
    const pass = encoder.beginRenderPass({
      colorAttachments: [t.createColorAttachment(passFormat)],
    });
    pass.executeBundles([bundle]);
    pass.end();
    validateFinishAndSubmit(passFormat === bundleFormat, true);
  });

g.test('render_pass_and_bundle,color_count')
  .desc(
    `
  Test that the number of color attachments in render passes and bundles must match.
  `
  )
  .paramsSubcasesOnly(u =>
    u //
      .combine('passCount', kColorAttachmentCounts)
      .combine('bundleCount', kColorAttachmentCounts)
  )
  .fn(t => {
    const { passCount, bundleCount } = t.params;
    const bundleEncoder = t.device.createRenderBundleEncoder({
      colorFormats: range(bundleCount, () => 'rgba8unorm'),
    });
    const bundle = bundleEncoder.finish();

    const { encoder, validateFinishAndSubmit } = t.createEncoder('non-pass');
    const pass = encoder.beginRenderPass({
      colorAttachments: range(passCount, () => t.createColorAttachment('rgba8unorm')),
    });
    pass.executeBundles([bundle]);
    pass.end();
    validateFinishAndSubmit(passCount === bundleCount, true);
  });

g.test('render_pass_and_bundle,color_sparse')
  .desc(
    `
  Test that each of color attachments in render passes and bundles must match.
  `
  )
  .params(u =>
    u //
      // introduce attachmentCount to make it easier to split the test
      .combine('attachmentCount', kColorAttachmentCounts)
      .beginSubcases()
      .combine('passAttachments', kColorAttachments)
      .combine('bundleAttachments', kColorAttachments)
      .filter(
        p =>
          p.attachmentCount === p.passAttachments.length &&
          p.attachmentCount === p.bundleAttachments.length
      )
  )
  .fn(t => {
    const { passAttachments, bundleAttachments } = t.params;
    const colorFormats = bundleAttachments.map(i => (i ? 'rgba8unorm' : null));
    const bundleEncoder = t.device.createRenderBundleEncoder({
      colorFormats,
    });
    const bundle = bundleEncoder.finish();

    const { encoder, validateFinishAndSubmit } = t.createEncoder('non-pass');
    const colorAttachments = passAttachments.map(i =>
      t.createColorAttachment(i ? 'rgba8unorm' : null)
    );
    const pass = encoder.beginRenderPass({
      colorAttachments,
    });
    pass.executeBundles([bundle]);
    pass.end();
    validateFinishAndSubmit(
      passAttachments.every((v, i) => v === bundleAttachments[i]),
      true
    );
  });

g.test('render_pass_and_bundle,depth_format')
  .desc('Test that the depth attachment format in render passes and bundles must match.')
  .params(u =>
    u //
      .combine('passFeature', kFeaturesForDepthStencilAttachmentFormats)
      .combine('bundleFeature', kFeaturesForDepthStencilAttachmentFormats)
      .beginSubcases()
      .expand('passFormat', ({ passFeature }) =>
        filterFormatsByFeature(passFeature, kDepthStencilAttachmentFormats)
      )
      .expand('bundleFormat', ({ bundleFeature }) =>
        filterFormatsByFeature(bundleFeature, kDepthStencilAttachmentFormats)
      )
  )
  .beforeAllSubcases(t => {
    const { passFeature, bundleFeature } = t.params;
    t.selectDeviceOrSkipTestCase([passFeature, bundleFeature]);
  })
  .fn(async t => {
    const { passFormat, bundleFormat } = t.params;

    const bundleEncoder = t.device.createRenderBundleEncoder({
      colorFormats: ['rgba8unorm'],
      depthStencilFormat: bundleFormat,
    });
    const bundle = bundleEncoder.finish();

    const { encoder, validateFinishAndSubmit } = t.createEncoder('non-pass');
    const pass = encoder.beginRenderPass({
      colorAttachments: [t.createColorAttachment('rgba8unorm')],
      depthStencilAttachment:
        passFormat !== undefined ? t.createDepthAttachment(passFormat) : undefined,
    });
    pass.executeBundles([bundle]);
    pass.end();
    validateFinishAndSubmit(passFormat === bundleFormat, true);
  });

g.test('render_pass_and_bundle,sample_count')
  .desc('Test that the sample count in render passes and bundles must match.')
  .paramsSubcasesOnly(u =>
    u //
      .combine('renderSampleCount', kTextureSampleCounts)
      .combine('bundleSampleCount', kTextureSampleCounts)
  )
  .fn(t => {
    const { renderSampleCount, bundleSampleCount } = t.params;
    const bundleEncoder = t.device.createRenderBundleEncoder({
      colorFormats: ['rgba8unorm'],
      sampleCount: bundleSampleCount,
    });
    const bundle = bundleEncoder.finish();
    const { encoder, validateFinishAndSubmit } = t.createEncoder('non-pass');
    const pass = encoder.beginRenderPass({
      colorAttachments: [t.createColorAttachment('rgba8unorm', renderSampleCount)],
    });
    pass.executeBundles([bundle]);
    pass.end();
    validateFinishAndSubmit(renderSampleCount === bundleSampleCount, true);
  });

g.test('render_pass_or_bundle_and_pipeline,color_format')
  .desc(
    `
Test that color attachment formats in render passes or bundles match the pipeline color format.
`
  )
  .params(u =>
    u
      .combine('encoderType', ['render pass', 'render bundle'] as const)
      .beginSubcases()
      .combine('encoderFormat', kColorAttachmentFormats)
      .combine('pipelineFormat', kColorAttachmentFormats)
  )
  .fn(t => {
    const { encoderType, encoderFormat, pipelineFormat } = t.params;
    const pipeline = t.createRenderPipeline([{ format: pipelineFormat, writeMask: 0 }]);

    const { encoder, validateFinishAndSubmit } = t.createEncoder(encoderType, {
      attachmentInfo: { colorFormats: [encoderFormat] },
    });
    encoder.setPipeline(pipeline);
    validateFinishAndSubmit(encoderFormat === pipelineFormat, true);
  });

g.test('render_pass_or_bundle_and_pipeline,color_count')
  .desc(
    `
Test that the number of color attachments in render passes or bundles match the pipeline color
count.
`
  )
  .params(u =>
    u
      .combine('encoderType', ['render pass', 'render bundle'] as const)
      .beginSubcases()
      .combine('encoderCount', kColorAttachmentCounts)
      .combine('pipelineCount', kColorAttachmentCounts)
  )
  .fn(t => {
    const { encoderType, encoderCount, pipelineCount } = t.params;
    const pipeline = t.createRenderPipeline(
      range(pipelineCount, () => ({ format: 'rgba8unorm', writeMask: 0 }))
    );

    const { encoder, validateFinishAndSubmit } = t.createEncoder(encoderType, {
      attachmentInfo: { colorFormats: range(encoderCount, () => 'rgba8unorm') },
    });
    encoder.setPipeline(pipeline);
    validateFinishAndSubmit(encoderCount === pipelineCount, true);
  });

g.test('render_pass_or_bundle_and_pipeline,color_sparse')
  .desc(
    `
Test that each of color attachments in render passes or bundles match that of the pipeline.
`
  )
  .params(u =>
    u
      .combine('encoderType', ['render pass', 'render bundle'] as const)
      // introduce attachmentCount to make it easier to split the test
      .combine('attachmentCount', kColorAttachmentCounts)
      .beginSubcases()
      .combine('encoderAttachments', kColorAttachments)
      .combine('pipelineAttachments', kColorAttachments)
      .filter(
        p =>
          p.attachmentCount === p.encoderAttachments.length &&
          p.attachmentCount === p.pipelineAttachments.length
      )
  )
  .fn(t => {
    const { encoderType, encoderAttachments, pipelineAttachments } = t.params;

    const colorTargets = pipelineAttachments.map(i =>
      i ? ({ format: 'rgba8unorm', writeMask: 0 } as GPUColorTargetState) : null
    );
    const pipeline = t.createRenderPipeline(colorTargets);

    const colorFormats = encoderAttachments.map(i => (i ? 'rgba8unorm' : null));
    const { encoder, validateFinishAndSubmit } = t.createEncoder(encoderType, {
      attachmentInfo: { colorFormats },
    });
    encoder.setPipeline(pipeline);
    validateFinishAndSubmit(
      encoderAttachments.every((v, i) => v === pipelineAttachments[i]),
      true
    );
  });

g.test('render_pass_or_bundle_and_pipeline,depth_format')
  .desc(
    `
Test that the depth attachment format in render passes or bundles match the pipeline depth format.
`
  )
  .params(u =>
    u
      .combine('encoderType', ['render pass', 'render bundle'] as const)
      .combine('encoderFormatFeature', kFeaturesForDepthStencilAttachmentFormats)
      .combine('pipelineFormatFeature', kFeaturesForDepthStencilAttachmentFormats)
      .beginSubcases()
      .expand('encoderFormat', ({ encoderFormatFeature }) =>
        filterFormatsByFeature(encoderFormatFeature, kDepthStencilAttachmentFormats)
      )
      .expand('pipelineFormat', ({ pipelineFormatFeature }) =>
        filterFormatsByFeature(pipelineFormatFeature, kDepthStencilAttachmentFormats)
      )
  )
  .beforeAllSubcases(t => {
    const { encoderFormatFeature, pipelineFormatFeature } = t.params;
    t.selectDeviceOrSkipTestCase([encoderFormatFeature, pipelineFormatFeature]);
  })
  .fn(async t => {
    const { encoderType, encoderFormat, pipelineFormat } = t.params;

    const pipeline = t.createRenderPipeline(
      [{ format: 'rgba8unorm', writeMask: 0 }],
      pipelineFormat !== undefined ? { format: pipelineFormat } : undefined
    );

    const { encoder, validateFinishAndSubmit } = t.createEncoder(encoderType, {
      attachmentInfo: { colorFormats: ['rgba8unorm'], depthStencilFormat: encoderFormat },
    });
    encoder.setPipeline(pipeline);
    validateFinishAndSubmit(encoderFormat === pipelineFormat, true);
  });

const kStencilFaceStates = [
  { failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
  { failOp: 'zero', depthFailOp: 'zero', passOp: 'zero' },
] as GPUStencilFaceState[];

g.test('render_pass_or_bundle_and_pipeline,depth_stencil_read_only_write_state')
  .desc(
    `
Test that the depth stencil read only state in render passes or bundles is compatible with the depth stencil write state of the pipeline.
`
  )
  .params(u =>
    u
      .combine('encoderType', ['render pass', 'render bundle'] as const)
      .combine('format', kDepthStencilAttachmentFormats)
      .beginSubcases()
      // pass/bundle state
      .combine('depthReadOnly', [false, true])
      .combine('stencilReadOnly', [false, true])
      .combine('stencilFront', kStencilFaceStates)
      .combine('stencilBack', kStencilFaceStates)
      // pipeline state
      .combine('depthWriteEnabled', [false, true])
      .combine('stencilWriteMask', [0, 0xffffffff])
      .combine('cullMode', ['none', 'front', 'back'] as const)
      .filter(p => {
        if (p.format) {
          const depthStencilInfo = kTextureFormatInfo[p.format];
          // For combined depth/stencil formats the depth and stencil read only state must match
          // in order to create a valid render bundle or render pass.
          if (depthStencilInfo.depth && depthStencilInfo.stencil) {
            if (p.depthReadOnly !== p.stencilReadOnly) {
              return false;
            }
          }
          // If the format has no depth aspect, the depthReadOnly, depthWriteEnabled of the pipeline must not be true
          // in order to create a valid render pipeline.
          if (!depthStencilInfo.depth && p.depthWriteEnabled) {
            return false;
          }
          // If the format has no stencil aspect, the stencil state operation must be 'keep'
          // in order to create a valid render pipeline.
          if (
            !depthStencilInfo.stencil &&
            (p.stencilFront.failOp !== 'keep' || p.stencilBack.failOp !== 'keep')
          ) {
            return false;
          }
        }
        // No depthStencil attachment
        return true;
      })
  )
  .beforeAllSubcases(t => {
    t.selectDeviceForTextureFormatOrSkipTestCase(t.params.format);
  })
  .fn(async t => {
    const {
      encoderType,
      format,
      depthReadOnly,
      stencilReadOnly,
      depthWriteEnabled,
      stencilWriteMask,
      cullMode,
      stencilFront,
      stencilBack,
    } = t.params;

    const pipeline = t.createRenderPipeline(
      [{ format: 'rgba8unorm', writeMask: 0 }],
      format === undefined
        ? undefined
        : {
            format,
            depthWriteEnabled,
            stencilWriteMask,
            stencilFront,
            stencilBack,
          },
      1,
      cullMode
    );

    const { encoder, validateFinishAndSubmit } = t.createEncoder(encoderType, {
      attachmentInfo: {
        colorFormats: ['rgba8unorm'],
        depthStencilFormat: format,
        depthReadOnly,
        stencilReadOnly,
      },
    });
    encoder.setPipeline(pipeline);

    let writesDepth = false;
    let writesStencil = false;
    if (format) {
      writesDepth = depthWriteEnabled;
      if (stencilWriteMask !== 0) {
        if (
          cullMode !== 'front' &&
          (stencilFront.passOp !== 'keep' ||
            stencilFront.depthFailOp !== 'keep' ||
            stencilFront.failOp !== 'keep')
        ) {
          writesStencil = true;
        }
        if (
          cullMode !== 'back' &&
          (stencilBack.passOp !== 'keep' ||
            stencilBack.depthFailOp !== 'keep' ||
            stencilBack.failOp !== 'keep')
        ) {
          writesStencil = true;
        }
      }
    }

    let isValid = true;
    if (writesDepth) {
      isValid &&= !depthReadOnly;
    }
    if (writesStencil) {
      isValid &&= !stencilReadOnly;
    }

    validateFinishAndSubmit(isValid, true);
  });

g.test('render_pass_or_bundle_and_pipeline,sample_count')
  .desc(
    `
Test that the sample count in render passes or bundles match the pipeline sample count for both color texture and depthstencil texture.
`
  )
  .params(u =>
    u
      .combine('encoderType', ['render pass', 'render bundle'] as const)
      .combine('attachmentType', ['color', 'depthstencil'] as const)
      .beginSubcases()
      .combine('encoderSampleCount', kTextureSampleCounts)
      .combine('pipelineSampleCount', kTextureSampleCounts)
  )
  .fn(t => {
    const { encoderType, attachmentType, encoderSampleCount, pipelineSampleCount } = t.params;

    const colorFormats = attachmentType === 'color' ? ['rgba8unorm' as const] : [];
    const depthStencilFormat =
      attachmentType === 'depthstencil' ? ('depth24plus-stencil8' as const) : undefined;

    const pipeline = t.createRenderPipeline(
      colorFormats.map(format => ({ format, writeMask: 0 })),
      depthStencilFormat ? { format: depthStencilFormat } : undefined,
      pipelineSampleCount
    );

    const { encoder, validateFinishAndSubmit } = t.createEncoder(encoderType, {
      attachmentInfo: { colorFormats, depthStencilFormat, sampleCount: encoderSampleCount },
    });
    encoder.setPipeline(pipeline);
    validateFinishAndSubmit(encoderSampleCount === pipelineSampleCount, true);
  });
