import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const patterns = [
  ['chat-artifact', /\b(?:I hope this helps|let me know if you(?:'d| would) like)\b|\bCertainly!/gi],
  ['signposting', /\b(?:let['’]s dive in|in this section we(?:['’]ll| will)|it['’]s worth noting that)\b/gi],
  ['faux-insight', /\b(?:what nobody tells you|what most people get wrong|the uncomfortable truth is|here['’]s the thing)\b/gi],
  ['contrast-redefinition', /\bnot (?:just|only|merely)\b[^.!?\n]{0,100}\bbut\b|\bisn['’]t (?:just|about)\b[^.!?\n]{0,100}\b(?:it['’]s|but)\b/gi],
  ['preference-framing', /\b(?:rather than|instead of)\b/gi],
  ['inflation', /\b(?:pivotal moment|testament to|indelible mark|game[- ]changing|cutting[- ]edge)\b/gi],
  ['vocabulary', /\b(?:delve|leverage|foster|unlock|seamless|transformative)\b/gi],
  ['formulaic-ending', /\b(?:in conclusion|to summarize|to sum up)\b/gi],
];

function maskProse(source) {
  const blank = text => text.replace(/[^\n]/g, ' ');
  let text = source.replace(/^\uFEFF/, '');
  text = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, blank);
  text = text.replace(/<!--[\s\S]*?-->/g, blank);
  let fence = null;
  text = text.split('\n').map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return blank(line);
    }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; return blank(line); }
    if (/^\s*>/.test(line) || /^\s*\|/.test(line) || /^\s*\[[^\]]+\]:/.test(line)) return blank(line);
    return line;
  }).join('\n');
  text = text.replace(/(`+)[^\n]*?\1/g, blank);
  text = text.replace(/!\[[^\]]*\]\([^\n)]*\)/g, blank);
  text = text.replace(/\[([^\]]+)\]\(([^\n)]*)\)/g, (match, label) => label + ' '.repeat(match.length - label.length));
  text = text.replace(/https?:\/\/[^\s<>]+/g, blank);
  text = text.replace(/"[^"\n]*"|“[^”\n]*”/g, blank);
  return text;
}

export function scanText(source, file = '<text>') {
  const prose = maskProse(source);
  const words = (prose.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || []).length;
  const candidates = [];
  const counts = {};
  for (const [id, regex] of patterns) {
    let count = 0;
    for (const match of prose.matchAll(regex)) {
      count++;
      candidates.push({ pattern: id, line: prose.slice(0, match.index).split('\n').length, text: match[0] });
    }
    counts[id] = { count, per1000: words ? Number((count * 1000 / words).toFixed(2)) : 0 };
  }
  candidates.sort((a, b) => a.line - b.line || a.pattern.localeCompare(b.pattern));
  return { file, languageCoverage: 'English lexical candidates only', words, counts, candidates };
}

export function compareScans(before, after) {
  return {
    wordDelta: after.words - before.words,
    patterns: Object.keys(before.counts).map(pattern => ({
      pattern,
      before: before.counts[pattern], after: after.counts[pattern],
      rawDelta: after.counts[pattern].count - before.counts[pattern].count,
      per1000Delta: Number((after.counts[pattern].per1000 - before.counts[pattern].per1000).toFixed(2)),
      reviewIncrease: after.counts[pattern].count > before.counts[pattern].count,
    })),
    verdict: 'Candidates require close reading; no quality or authorship verdict',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const files = process.argv.slice(2);
    if (!files.length || files.length > 2) throw new Error('Usage: node scan.mjs file.md [after.md]');
    const scans = await Promise.all(files.map(async file => scanText(await readFile(file, 'utf8'), file)));
    console.log(JSON.stringify({ scans, ...(scans.length === 2 ? { comparison: compareScans(...scans) } : {}) }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
