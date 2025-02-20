export const description = `
Tests for external textures from HTMLVideoElement (and other video-type sources?).

- videos with various encodings/formats (webm vp8, webm vp9, ogg theora, mp4), color spaces
  (bt.601, bt.709, bt.2020)
- TODO: enhance with more cases with crop, rotation, etc.

TODO: consider whether external_texture and copyToTexture video tests should be in the same file
`;

import { getResourcePath } from '../../../common/framework/resources.js';
import { makeTestGroup } from '../../../common/framework/test_group.js';
import { GPUTest } from '../../gpu_test.js';
import {
  startPlayingAndWaitForVideo,
  getVideoFrameFromVideoElement,
  waitForNextFrame,
} from '../../web_platform/util.js';

const kHeight = 16;
const kWidth = 16;
const kFormat = 'rgba8unorm';

const kVideoExpectations = [
  {
    videoSource: 'red-green.webmvp8.webm',
    _redExpectation: new Uint8Array([0xd9, 0x00, 0x00, 0xff]),
    _greenExpectation: new Uint8Array([0x01, 0xef, 0x00, 0xff]),
  },
  {
    videoSource: 'red-green.theora.ogv',
    _redExpectation: new Uint8Array([0xd9, 0x00, 0x00, 0xff]),
    _greenExpectation: new Uint8Array([0x01, 0xef, 0x00, 0xff]),
  },
  {
    videoSource: 'red-green.mp4',
    _redExpectation: new Uint8Array([0xd9, 0x00, 0x00, 0xff]),
    _greenExpectation: new Uint8Array([0x01, 0xef, 0x00, 0xff]),
  },
  {
    videoSource: 'red-green.bt601.vp9.webm',
    _redExpectation: new Uint8Array([0xd9, 0x00, 0x00, 0xff]),
    _greenExpectation: new Uint8Array([0x01, 0xef, 0x00, 0xff]),
  },
  {
    videoSource: 'red-green.bt709.vp9.webm',
    _redExpectation: new Uint8Array([0xff, 0x00, 0x00, 0xff]),
    _greenExpectation: new Uint8Array([0x00, 0xff, 0x00, 0xff]),
  },
  {
    videoSource: 'red-green.bt2020.vp9.webm',
    _redExpectation: new Uint8Array([0xff, 0x00, 0x00, 0xff]),
    _greenExpectation: new Uint8Array([0x00, 0xff, 0x00, 0xff]),
  },
] as const;

export const g = makeTestGroup(GPUTest);

function createExternalTextureSamplingTestPipeline(t: GPUTest): GPURenderPipeline {
  const pipeline = t.device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: t.device.createShaderModule({
        code: `
        @vertex fn main(@builtin(vertex_index) VertexIndex : u32) -> @builtin(position) vec4<f32> {
            var pos = array<vec4<f32>, 6>(
              vec4<f32>( 1.0,  1.0, 0.0, 1.0),
              vec4<f32>( 1.0, -1.0, 0.0, 1.0),
              vec4<f32>(-1.0, -1.0, 0.0, 1.0),
              vec4<f32>( 1.0,  1.0, 0.0, 1.0),
              vec4<f32>(-1.0, -1.0, 0.0, 1.0),
              vec4<f32>(-1.0,  1.0, 0.0, 1.0)
            );
            return pos[VertexIndex];
        }
        `,
      }),
      entryPoint: 'main',
    },
    fragment: {
      module: t.device.createShaderModule({
        code: `
        @group(0) @binding(0) var s : sampler;
        @group(0) @binding(1) var t : texture_external;

        @fragment fn main(@builtin(position) FragCoord : vec4<f32>)
                                 -> @location(0) vec4<f32> {
            return textureSampleLevel(t, s, FragCoord.xy / vec2<f32>(16.0, 16.0));
        }
        `,
      }),
      entryPoint: 'main',
      targets: [
        {
          format: kFormat,
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  return pipeline;
}

function createExternalTextureSamplingTestBindGroup(
  t: GPUTest,
  source: HTMLVideoElement | VideoFrame,
  pipeline: GPURenderPipeline
): GPUBindGroup {
  const linearSampler = t.device.createSampler();

  const externalTexture = t.device.importExternalTexture({
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    source: source as any,
  });

  const bindGroup = t.device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: linearSampler,
      },
      {
        binding: 1,
        resource: externalTexture,
      },
    ],
  });

  return bindGroup;
}

g.test('importExternalTexture,sample')
  .desc(
    `
Tests that we can import an HTMLVideoElement/VideoFrame into a GPUExternalTexture, sample from it
for several combinations of video format and color space.

TODO: add 'VideoFrame' as an additional 'sourceType'
`
  )
  .params(u =>
    u //
      .combine('sourceType', ['VideoElement'])
      .combineWithParams(kVideoExpectations)
  )
  .fn(async t => {
    const sourceType = t.params.sourceType;
    if (sourceType === 'VideoFrame' && typeof VideoFrame === 'undefined') {
      t.skip('WebCodec is not supported');
    }

    const videoUrl = getResourcePath(t.params.videoSource);
    const videoElement = document.createElement('video');
    videoElement.src = videoUrl;

    await startPlayingAndWaitForVideo(videoElement, async () => {
      const source =
        sourceType === 'VideoFrame'
          ? await getVideoFrameFromVideoElement(t, videoElement)
          : videoElement;

      const colorAttachment = t.device.createTexture({
        format: kFormat,
        size: { width: kWidth, height: kHeight, depthOrArrayLayers: 1 },
        usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      const pipeline = createExternalTextureSamplingTestPipeline(t);
      const bindGroup = createExternalTextureSamplingTestBindGroup(t, source, pipeline);

      const commandEncoder = t.device.createCommandEncoder();
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: colorAttachment.createView(),
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6);
      passEncoder.end();
      t.device.queue.submit([commandEncoder.finish()]);

      // Top left corner should be red. Sample a few pixels away from the edges to avoid compression
      // artifacts.
      t.expectSinglePixelIn2DTexture(
        colorAttachment,
        kFormat,
        { x: 5, y: 5 },
        {
          exp: t.params._redExpectation,
        }
      );

      // Bottom right corner should be green. Sample a few pixels away from the edges to avoid
      // compression artifacts.
      t.expectSinglePixelIn2DTexture(
        colorAttachment,
        kFormat,
        { x: kWidth - 5, y: kHeight - 5 },
        {
          exp: t.params._greenExpectation,
        }
      );

      if (sourceType === 'VideoFrame') (source as VideoFrame).close();
    });
  });

g.test('importExternalTexture,expired')
  .desc(
    `
Tests that GPUExternalTexture.expired is false when HTMLVideoElement is not updated
or VideoFrame(webcodec) is alive. And it will be changed to true when imported
HTMLVideoElement is updated or imported VideoFrame is closed. Using expired
GPUExternalTexture results in an error.

TODO: Make this test work without requestVideoFrameCallback support (in waitForNextFrame).
`
  )
  .params(u =>
    u //
      .combine('sourceType', ['VideoElement', 'VideoFrame'])
  )
  .fn(async t => {
    const sourceType = t.params.sourceType;
    if (sourceType === 'VideoFrame' && typeof VideoFrame === 'undefined') {
      t.skip('WebCodec is not supported');
    }

    const videoUrl = getResourcePath('red-green.webmvp8.webm');
    const videoElement = document.createElement('video');
    videoElement.src = videoUrl;

    if (!('requestVideoFrameCallback' in videoElement)) {
      t.skip('HTMLVideoElement.requestVideoFrameCallback is not supported');
    }

    const colorAttachment = t.device.createTexture({
      format: kFormat,
      size: { width: kWidth, height: kHeight, depthOrArrayLayers: 1 },
      usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const passDescriptor = {
      colorAttachments: [
        {
          view: colorAttachment.createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    } as const;

    const bindGroupLayout = t.device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} }],
    });

    let bindGroup: GPUBindGroup;
    const useExternalTexture = () => {
      const commandEncoder = t.device.createCommandEncoder();
      const passEncoder = commandEncoder.beginRenderPass(passDescriptor);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.end();
      return commandEncoder.finish();
    };

    let externalTexture: GPUExternalTexture;
    await startPlayingAndWaitForVideo(videoElement, async () => {
      const source =
        sourceType === 'VideoFrame'
          ? await getVideoFrameFromVideoElement(t, videoElement)
          : videoElement;
      externalTexture = t.device.importExternalTexture({
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        source: source as any,
      });
      // Set `bindGroup` here, which will then be used in microtask1 and microtask3.
      bindGroup = t.device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: externalTexture }],
      });

      const commandBuffer = useExternalTexture();
      t.expectGPUError('validation', () => t.device.queue.submit([commandBuffer]), false);
      t.expect(!externalTexture.expired);

      if (sourceType === 'VideoFrame') {
        (source as VideoFrame).close();
        const commandBuffer = useExternalTexture();
        t.expectGPUError('validation', () => t.device.queue.submit([commandBuffer]), true);
        t.expect(externalTexture.expired);
      }
    });

    if (sourceType === 'VideoElement') {
      // Update new video frame.
      await waitForNextFrame(videoElement, () => {
        // VideoFrame is updated. GPUExternalTexture imported from HTMLVideoElement should be expired.
        // Using the GPUExternalTexture should result in an error.
        const commandBuffer = useExternalTexture();
        t.expectGPUError('validation', () => t.device.queue.submit([commandBuffer]), true);
        t.expect(externalTexture.expired);
      });
    }
  });

g.test('importExternalTexture,compute')
  .desc(
    `
Tests that we can import an HTMLVideoElement/VideoFrame into a GPUExternalTexture and use it in a
compute shader, for several combinations of video format and color space.

TODO: add 'VideoFrame' as an additional 'sourceType'
`
  )
  .params(u =>
    u //
      .combine('sourceType', ['VideoElement'])
      .combineWithParams(kVideoExpectations)
  )
  .fn(async t => {
    const sourceType = t.params.sourceType;

    const videoUrl = getResourcePath(t.params.videoSource);
    const videoElement = document.createElement('video');
    videoElement.src = videoUrl;

    await startPlayingAndWaitForVideo(videoElement, async () => {
      const source =
        sourceType === 'VideoFrame'
          ? await getVideoFrameFromVideoElement(t, videoElement)
          : videoElement;
      const externalTexture = t.device.importExternalTexture({
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        source: source as any,
      });

      const outputTexture = t.device.createTexture({
        format: 'rgba8unorm',
        size: [2, 1, 1],
        usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.STORAGE_BINDING,
      });

      const pipeline = t.device.createComputePipeline({
        layout: 'auto',
        compute: {
          // Shader will load a pixel near the upper left and lower right corners, which are then
          // stored in storage texture.
          module: t.device.createShaderModule({
            code: `
              @group(0) @binding(0) var t : texture_external;
              @group(0) @binding(1) var outImage : texture_storage_2d<rgba8unorm, write>;

              @compute @workgroup_size(1) fn main() {
                var red : vec4<f32> = textureLoad(t, vec2<i32>(10,10));
                textureStore(outImage, vec2<i32>(0, 0), red);
                var green : vec4<f32> = textureLoad(t, vec2<i32>(70,118));
                textureStore(outImage, vec2<i32>(1, 0), green);
                return;
              }
            `,
          }),
          entryPoint: 'main',
        },
      });

      const bg = t.device.createBindGroup({
        entries: [
          { binding: 0, resource: externalTexture },
          { binding: 1, resource: outputTexture.createView() },
        ],
        layout: pipeline.getBindGroupLayout(0),
      });

      const encoder = t.device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(1);
      pass.end();
      t.device.queue.submit([encoder.finish()]);

      // Pixel loaded from top left corner should be red.
      t.expectSinglePixelIn2DTexture(
        outputTexture,
        kFormat,
        { x: 0, y: 0 },
        {
          exp: t.params._redExpectation,
        }
      );

      // Pixel loaded from Bottom right corner should be green.
      t.expectSinglePixelIn2DTexture(
        outputTexture,
        kFormat,
        { x: 1, y: 0 },
        {
          exp: t.params._greenExpectation,
        }
      );

      if (sourceType === 'VideoFrame') (source as VideoFrame).close();
    });
  });
