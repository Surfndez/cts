import { ErrorWithExtra } from '../../../common/util/util.js';
import { GPUTest } from '../../gpu_test.js';

/**
 * Base fixture for WGSL shader validation tests.
 */
export class ShaderValidationTest extends GPUTest {
  /**
   * Add a test expectation for whether a createShaderModule call succeeds or not.
   *
   * @example
   * ```ts
   * t.expectCompileResult(true, `wgsl code`); // Expect success
   * t.expectCompileResult(false, `wgsl code`); // Expect validation error with any error string
   * ```
   */
  expectCompileResult(expectedResult: boolean, code: string) {
    let shaderModule: GPUShaderModule;
    this.expectGPUError(
      'validation',
      () => {
        shaderModule = this.device.createShaderModule({ code });
      },
      expectedResult !== true
    );

    const error = new ErrorWithExtra('', () => ({ shaderModule }));
    this.eventualAsyncExpectation(async () => {
      const compilationInfo = await shaderModule!.compilationInfo();

      // MAINTENANCE_TODO: Pretty-print error messages with source context.
      const messagesLog = compilationInfo.messages
        .map(m => `${m.lineNum}:${m.linePos}: ${m.type}: ${m.message}`)
        .join('\n');
      error.extra.compilationInfo = compilationInfo;

      if (compilationInfo.messages.some(m => m.type === 'error')) {
        if (expectedResult) {
          error.message = `Unexpected compilationInfo 'error' message.\n` + messagesLog;
          this.rec.validationFailed(error);
        } else {
          error.message = `Found expected compilationInfo 'error' message.\n` + messagesLog;
          this.rec.debug(error);
        }
      } else {
        if (!expectedResult) {
          error.message = `Missing expected compilationInfo 'error' message.\n` + messagesLog;
          this.rec.validationFailed(error);
        } else {
          error.message = `No compilationInfo 'error' messages, as expected.\n` + messagesLog;
          this.rec.debug(error);
        }
      }
    });
  }

  /**
   * Wraps the code fragment into an entry point.
   *
   * @example
   * ```ts
   * t.wrapInEntryPoint(`var i = 0;`);
   * ```
   */
  wrapInEntryPoint(code: string) {
    return `
      @compute @workgroup_size(1)
      fn main() {
        ${code}
      }`;
  }
}
