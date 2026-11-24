import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { publishReport } from '../dist/report-file.js';

const metadata = { date: '2026-11-24', time: '06:42:15' };

test('concurrent publication preserves every complete file without overwrite', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'devcontext-file-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const contents = ['original', 'second', 'third'];
  const originalPath = await publishReport(cwd, metadata, contents[0]);
  const remaining = await Promise.all(contents.slice(1).map((text) => publishReport(cwd, metadata, text)));
  assert.deepEqual(await readdir(join(cwd, 'reports')), [
    'DevContext-report-20261124-064215-2.md',
    'DevContext-report-20261124-064215-3.md',
    'DevContext-report-20261124-064215.md',
  ]);
  const paths = [originalPath, ...remaining];
  assert.deepEqual(await Promise.all(paths.map((path) => readFile(join(cwd, path), 'utf8'))), contents);
});

test('does not overwrite a file that blocks the reports directory', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'devcontext-file-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const blocker = join(cwd, 'reports');
  await writeFile(blocker, 'existing user file');
  await assert.rejects(publishReport(cwd, metadata, 'report'));
  assert.equal(await readFile(blocker, 'utf8'), 'existing user file');
});
