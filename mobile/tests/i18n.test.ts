import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { FR } from '../src/i18n/fr.ts';
import { getLanguage, monthName, setLanguage, t } from '../src/i18n/index.ts';
import { fromIso, startingDate, toIso } from '../src/lib/dates.ts';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) && !p.includes('i18n') ? [p] : [];
  });
}
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

test('every t() literal has a French entry with the same placeholders', () => {
  const missing: string[] = [];
  for (const f of [...sources('src'), 'App.tsx']) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
      const key = m[2]!.replace(/\\(['"])/g, '$1');
      if (!(key in FR) || placeholders(key) !== placeholders(FR[key]!)) missing.push(`${f}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('t() interpolates and switches language', () => {
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('Week {n}', { n: 3 }), 'Week 3');
  setLanguage('fr');
  assert.equal(t('Week {n}', { n: 3 }), 'Semaine 3');
  assert.equal(t('not in the dictionary {x}', { x: 1 }), 'not in the dictionary 1');
  assert.equal(monthName(0), 'janv.');
  setLanguage('en');
  assert.equal(monthName(0), 'Jan');
});

test('date helpers', () => {
  assert.equal(toIso(new Date(2026, 8, 7)), '2026-09-07');
  assert.equal(fromIso('2026-09-07')?.getDate(), 7);
  assert.equal(fromIso('2026-13-40'), null);
  const today = new Date(2026, 0, 1);
  assert.equal(toIso(startingDate('', '2026-09-01', '2027-02-28', today)), '2026-09-01');
  assert.equal(toIso(startingDate('2030-01-01', '2026-09-01', '2027-02-28', today)), '2027-02-28');
  assert.equal(toIso(startingDate('2026-10-10', '2026-09-01', '2027-02-28', today)), '2026-10-10');
});
