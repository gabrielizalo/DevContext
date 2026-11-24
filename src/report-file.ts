import { randomUUID } from 'node:crypto';
import { link, mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReportData } from './report-model.js';

function isExistingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

export function reportMetadata(now: Date): ReportData['report'] {
  const two = (part: number) => String(part).padStart(2, '0');
  return {
    date: `${String(now.getFullYear()).padStart(4, '0')}-${two(now.getMonth() + 1)}-${two(now.getDate())}`,
    time: `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`,
  };
}

export async function publishReport(
  cwd: string,
  metadata: ReportData['report'],
  content: string,
  warn: (message: string) => void = console.error,
): Promise<string> {
  const stamp = `${metadata.date.replaceAll('-', '')}-${metadata.time.replaceAll(':', '')}`;
  if (!/^\d{8}-\d{6}$/.test(stamp)) throw new Error('Invalid report timestamp.');
  const directory = join(cwd, 'reports');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.devcontext-${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  let published = false;
  try {
    try {
      await handle.writeFile(content, 'utf8');
    } finally {
      await handle.close();
    }
    for (let attempt = 1; ; attempt += 1) {
      const suffix = attempt === 1 ? '' : `-${attempt}`;
      const name = `DevContext-report-${stamp}${suffix}.md`;
      try {
        await link(temporary, join(directory, name));
        published = true;
        return join('reports', name);
      } catch (error) {
        if (!isExistingPath(error)) throw error;
      }
    }
  } finally {
    try {
      await unlink(temporary);
    } catch {
      warn(`Warning: could not remove a report staging file. Check permissions in reports/${published ? ' (report was published).' : '.'}`);
    }
  }
}
