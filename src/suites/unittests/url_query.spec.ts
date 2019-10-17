export const description = `
Unit tests for URL queries.
`;

import { TestGroup } from '../../framework/index.js';
import { makeQueryString } from '../../framework/url_query.js';

import { UnitTest } from './unit_test.js';

export const g = new TestGroup(UnitTest);

g.test('makeQueryString', async t => {
  const s = makeQueryString({ suite: 'a', path: 'b/c' }, { test: 'd/e', params: { f: 'g', h: 3 } });
  t.expect(s === 'a:b/c:d/e={"f":"g","h":3}');
});

g.test('makeQueryString/private', async t => {
  const s = makeQueryString({ suite: 'a', path: 'b' }, { test: 'c', params: { pub: 2, _pri: 3 } });
  t.expect(s === 'a:b:c={"pub":2}');
});
