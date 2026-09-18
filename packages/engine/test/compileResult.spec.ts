import { describe, expect, it } from 'vitest';
import { toCompileResult, type BackendResult } from '../src/compileResult.js';

/**
 * The backend's answer, held to `CompileResult`'s contract (F-008).
 *
 * A failed compile came back as `pdf: null` -- measured in the harness -- and was passed
 * straight through, so the PDF tab threw `Cannot read properties of null (reading
 * 'slice')` over the previous compile's pages.
 */

const job = { jobId: 'j' };
const run = (r: Partial<BackendResult>) =>
  toCompileResult(job, { success: true, log: '', exitCode: 0, ...r }, 5);

describe('toCompileResult', () => {
  it('drops a null pdf, as a failed compile returns it', () => {
    const r = run({ success: false, pdf: null, exitCode: 1 });
    expect(r.ok).toBe(false);
    expect('pdf' in r).toBe(false);
  });

  it('is not ok when the backend claims success with a null pdf', () => {
    const r = run({ success: true, pdf: null });
    expect(r.ok).toBe(false);
    expect('pdf' in r).toBe(false);
  });

  it('drops a zero-length pdf, which is TeX aborting after opening the file', () => {
    const r = run({ pdf: new Uint8Array() });
    expect(r.ok).toBe(false);
    expect('pdf' in r).toBe(false);
  });

  it('drops a null synctex', () => {
    expect('synctex' in run({ pdf: new Uint8Array([1]), synctex: null })).toBe(false);
  });

  it('keeps a real pdf, and says so', () => {
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const r = run({ pdf });
    expect(r.ok).toBe(true);
    expect(r.pdf).toBe(pdf);
    expect(r.durationMs).toBe(5);
  });

  it('keeps a pdf TeX wrote despite errors, but does not call it a success', () => {
    // A document with a recoverable error still produces pages; showing them is useful,
    // calling the compile clean is not.
    const r = run({ success: false, pdf: new Uint8Array([1]) });
    expect(r.ok).toBe(false);
    expect(r.pdf).toBeDefined();
  });

  it('parses the log into diagnostics', () => {
    const r = run({ success: false, pdf: null, log: '! Undefined control sequence.\nl.7 \\foo\n' });
    expect(r.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
