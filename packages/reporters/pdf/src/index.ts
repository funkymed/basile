import path from 'node:path';
import { exec, ExecError, which } from '@basile/core';

export type RenderPdfOptions = {
  template?: 'eisvogel' | 'default';
  toc?: boolean;
  output?: string;
  /** Extra args appended to the pandoc invocation. */
  extraArgs?: string[];
  /** Override pandoc binary (mainly for testing). */
  pandocBin?: string;
  /** Inject an exec implementation (mainly for testing). */
  execImpl?: typeof exec;
};

export class PandocNotFoundError extends Error {
  constructor() {
    super(
      [
        'pandoc not found. Installation required to generate a PDF.',
        '',
        'macOS:    brew install pandoc && brew install --cask basictex',
        'Debian:   sudo apt-get install pandoc texlive-xetex',
        '',
        'For the eisvogel template: tlmgr install eisvogel',
      ].join('\n'),
    );
    this.name = 'PandocNotFoundError';
  }
}

export class PdfRenderError extends Error {
  constructor(message: string, public readonly hint?: string) {
    super(hint ? `${message}\n\nHint: ${hint}` : message);
    this.name = 'PdfRenderError';
  }
}

/**
 * Render a Markdown file to PDF via pandoc + xelatex.
 *
 * Returns the absolute path of the generated PDF.
 */
export async function renderPdf(mdPath: string, opts: RenderPdfOptions = {}): Promise<string> {
  const pandocBin = opts.pandocBin ?? 'pandoc';
  if (!opts.pandocBin && !which(pandocBin)) {
    throw new PandocNotFoundError();
  }

  const absMd = path.resolve(mdPath);
  const output = path.resolve(opts.output ?? absMd.replace(/\.md$/i, '.pdf'));
  const template = opts.template ?? 'default';
  const toc = opts.toc ?? true;

  const cmd: string[] = [pandocBin, absMd, '-o', output, '--pdf-engine=xelatex'];
  if (toc) cmd.push('--toc');
  if (template === 'eisvogel') {
    cmd.push('--template=eisvogel', '--listings');
  }
  if (opts.extraArgs?.length) cmd.push(...opts.extraArgs);

  const run = opts.execImpl ?? exec;

  try {
    await run(cmd, { timeoutMs: 120_000 });
  } catch (err) {
    if (err instanceof ExecError) {
      const stderr = err.result.stderr ?? '';
      let hint: string | undefined;
      if (/fontspec/i.test(stderr) || /xelatex/i.test(stderr)) {
        hint =
          'xelatex or fontspec missing. macOS: brew install --cask basictex then sudo tlmgr update --self && sudo tlmgr install eisvogel fontspec.';
      } else if (/template.*eisvogel/i.test(stderr)) {
        hint = 'Eisvogel template not found. Install: tlmgr install eisvogel.';
      }
      throw new PdfRenderError(err.message, hint);
    }
    throw err;
  }

  return output;
}

export { exec as _execForTesting };
