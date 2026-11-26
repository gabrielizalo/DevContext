interface AdfNode {
  readonly type: string;
  readonly content: readonly unknown[];
  readonly attrs: Record<string, unknown>;
  readonly text: unknown;
  readonly marks: readonly unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNode(value: unknown): AdfNode {
  if (
    !isRecord(value) ||
    typeof value.type !== 'string' ||
    value.type === '' ||
    (value.content !== undefined && !Array.isArray(value.content)) ||
    (value.marks !== undefined && !Array.isArray(value.marks)) ||
    (value.attrs !== undefined && !isRecord(value.attrs))
  ) {
    throw new Error('Malformed ADF node.');
  }
  return {
    type: value.type,
    content: value.content ?? [],
    attrs: value.attrs ?? {},
    text: value.text,
    marks: value.marks ?? [],
  };
}

function escapeText(value: string): string {
  return value
    .replace(/[\\`*_~[\]<>|&]/g, '\\$&')
    .replace(/^(\s*)([#>+-])(?=\s)/gm, '$1\\$2')
    .replace(/^(\s*\d+)([.)])(?=\s)/gm, '$1\\$2');
}

function link(label: string, destination: unknown): string {
  if (typeof destination !== 'string') return label;
  try {
    const url = new URL(destination);
    if (url.protocol !== 'https:' && url.protocol !== 'http:' && url.protocol !== 'mailto:') return label;
    return `[${label}](<${url.href.replace(/[<>\\]/g, encodeURIComponent)}>)`;
  } catch {
    return label;
  }
}

function fence(text: string, minimum: number): string {
  const width = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length + 1), minimum);
  return '`'.repeat(width);
}

function renderText(node: AdfNode): string {
  if (typeof node.text !== 'string' || node.content.length !== 0) throw new Error('Malformed ADF text node.');
  let result = escapeText(node.text);
  for (const raw of node.marks) {
    if (!isRecord(raw) || typeof raw.type !== 'string') throw new Error('Malformed ADF text mark.');
    switch (raw.type) {
      case 'strong':
        result = `**${result}**`;
        break;
      case 'em':
        result = `*${result}*`;
        break;
      case 'strike':
        result = `~~${result}~~`;
        break;
      case 'code': {
        const marker = fence(node.text, 1);
        const pad = /^`|`$|^ .* $/.test(node.text) ? ' ' : '';
        result = `${marker}${pad}${node.text}${pad}${marker}`;
        break;
      }
      case 'link':
        result = link(result, isRecord(raw.attrs) ? raw.attrs.href : undefined);
        break;
    }
  }
  return result;
}

function children(node: AdfNode, separator: string): string {
  return node.content.map((raw) => render(readNode(raw))).join(separator);
}

function indentListContinuation(body: string, width: number): string {
  const indent = ' '.repeat(width);
  return body.replace(/\n(?=[^\n])/g, `\n${indent}`);
}

function renderList(node: AdfNode): string {
  const start = node.attrs.order ?? 1;
  if (node.type === 'orderedList' && (typeof start !== 'number' || !Number.isSafeInteger(start) || start < 0)) {
    throw new Error('Malformed ADF ordered list start.');
  }
  return node.content.map((raw, index) => {
    const item = readNode(raw);
    if (item.type !== 'listItem') throw new Error('Malformed ADF list item.');
    const marker = node.type === 'orderedList' && typeof start === 'number' ? `${start + index}. ` : '- ';
    const body = item.content.map((child, block) => {
      const nested = readNode(child);
      const isList = nested.type === 'bulletList' || nested.type === 'orderedList' || nested.type === 'taskList';
      const separator = block === 0 ? '' : isList ? '\n' : '\n\n';
      return separator + render(nested);
    }).join('');
    return marker + indentListContinuation(body, marker.length);
  }).join('\n');
}

function renderTable(node: AdfNode): string {
  const rows = node.content.map((raw) => {
    const row = readNode(raw);
    if (row.type !== 'tableRow') throw new Error('Malformed ADF table row.');
    return row.content.map((rawCell) => {
      const cell = readNode(rawCell);
      if (cell.type !== 'tableHeader' && cell.type !== 'tableCell') throw new Error('Malformed ADF table cell.');
      return cell;
    });
  });
  const [first, ...rest] = rows;
  if (first === undefined || first.length === 0 || rows.some((row) => row.length === 0)) {
    throw new Error('Malformed ADF table.');
  }
  if (rows.some((row) => row.length !== first.length || row.some((cell) =>
    (cell.attrs.colspan ?? 1) !== 1 || (cell.attrs.rowspan ?? 1) !== 1))) {
    return ['[ADF table with merged or uneven cells]', ...rows.map((row) =>
      row.map((cell) => children(cell, '\n\n')).join('\n\n'))].join('\n\n');
  }
  const rowText = (row: AdfNode[]) => `| ${row.map((cell) => children(cell, ' ').replace(/\r?\n/g, '<br>')).join(' | ')} |`;
  const divider = `| ${first.map(() => '---').join(' | ')} |`;
  return first.every((cell) => cell.type === 'tableHeader')
    ? [rowText(first), divider, ...rest.map(rowText)].join('\n')
    : [`| ${first.map(() => ' ').join(' | ')} |`, divider, ...rows.map(rowText)].join('\n');
}

function render(node: AdfNode): string {
  switch (node.type) {
    case 'paragraph':
      return children(node, '');
    case 'heading': {
      const level = node.attrs.level;
      if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 6) {
        throw new Error('Malformed ADF heading level.');
      }
      return `${'#'.repeat(level)} ${children(node, '')}`;
    }
    case 'text':
      return renderText(node);
    case 'hardBreak':
      return '  \n';
    case 'rule':
      return '---';
    case 'blockquote':
      return children(node, '\n\n').split('\n').map((line) => `> ${line}`).join('\n');
    case 'bulletList':
    case 'orderedList':
      return renderList(node);
    case 'taskList':
      return node.content.map((raw) => {
        const item = readNode(raw);
        const body = render(item);
        return item.type === 'taskList' ? `  ${indentListContinuation(body, 2)}` : body;
      }).join('\n');
    case 'taskItem': {
      const { state } = node.attrs;
      if (state !== 'TODO' && state !== 'DONE') throw new Error('Malformed ADF task item state.');
      const marker = state === 'DONE' ? '- [x]' : '- [ ]';
      return `${marker} ${indentListContinuation(children(node, ''), 2)}`;
    }
    case 'table':
      return renderTable(node);
    case 'codeBlock': {
      const code = node.content.map((raw) => {
        const line = readNode(raw);
        if (line.type !== 'text' || typeof line.text !== 'string' || line.content.length !== 0) {
          throw new Error('Malformed ADF code block content.');
        }
        return line.text;
      }).join('');
      const marker = fence(code, 3);
      const language = node.attrs.language;
      const hint = typeof language === 'string' && /^[\w+#.-]+$/.test(language) ? language : '';
      return `${marker}${hint}\n${code}${code.endsWith('\n') ? '' : '\n'}${marker}`;
    }
    case 'mention':
      return typeof node.attrs.text === 'string' ? escapeText(node.attrs.text) : '[Mention]';
    case 'emoji': {
      const label = node.attrs.text ?? node.attrs.shortName;
      return typeof label === 'string' ? escapeText(label) : '[Emoji]';
    }
    case 'media':
    case 'mediaInline': {
      const alt = node.attrs.alt;
      const label = typeof alt === 'string' && alt.trim() !== '' ? `[Media: ${escapeText(alt)}]` : '[Media]';
      return [link(label, node.attrs.url), children(node, '\n\n')].filter(Boolean).join('\n\n');
    }
    case 'mediaSingle':
    case 'mediaGroup':
      return children(node, '\n\n') || '[Media]';
    case 'inlineCard':
    case 'blockCard':
    case 'embedCard':
      return typeof node.attrs.url === 'string' ? link(escapeText(node.attrs.url), node.attrs.url) : '[Card]';
    default:
      return [`[Unsupported ADF: ${escapeText(node.type)}]`, children(node, '\n\n')].filter(Boolean).join('\n\n');
  }
}

export function adfToMarkdown(value: unknown): string {
  if (!isRecord(value) || value.type !== 'doc' || value.version !== 1 || !Array.isArray(value.content)) {
    throw new Error('Malformed ADF document.');
  }
  return value.content.map((raw) => render(readNode(raw))).filter((block) => block.trim() !== '').join('\n\n');
}
