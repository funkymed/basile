import { describe, expect, it } from 'vitest';
import { renderPdf } from './index.js';

describe('renderPdf', () => {
  it('builds a pandoc command with xelatex and toc by default', async () => {
    let captured: string[] = [];
    const fakeExec = async (cmd: string[]) => {
      captured = cmd;
      return { stdout: '', stderr: '', exitCode: 0, durationMs: 0 };
    };
    const out = await renderPdf('/tmp/report.md', {
      pandocBin: 'pandoc',
      execImpl: fakeExec as never,
      output: '/tmp/report.pdf',
    });
    expect(out).toBe('/tmp/report.pdf');
    expect(captured[0]).toBe('pandoc');
    expect(captured).toContain('/tmp/report.md');
    expect(captured).toContain('-o');
    expect(captured).toContain('/tmp/report.pdf');
    expect(captured).toContain('--pdf-engine=xelatex');
    expect(captured).toContain('--toc');
  });

  it('adds eisvogel template flags when requested', async () => {
    let captured: string[] = [];
    const fakeExec = async (cmd: string[]) => {
      captured = cmd;
      return { stdout: '', stderr: '', exitCode: 0, durationMs: 0 };
    };
    await renderPdf('/tmp/r.md', {
      pandocBin: 'pandoc',
      execImpl: fakeExec as never,
      template: 'eisvogel',
      output: '/tmp/r.pdf',
    });
    expect(captured).toContain('--template=eisvogel');
    expect(captured).toContain('--listings');
  });

  it('omits --toc when toc=false', async () => {
    let captured: string[] = [];
    const fakeExec = async (cmd: string[]) => {
      captured = cmd;
      return { stdout: '', stderr: '', exitCode: 0, durationMs: 0 };
    };
    await renderPdf('/tmp/r.md', {
      pandocBin: 'pandoc',
      execImpl: fakeExec as never,
      output: '/tmp/r.pdf',
      toc: false,
    });
    expect(captured).not.toContain('--toc');
  });
});
