import test from 'node:test';
import assert from 'node:assert/strict';
import { imageFixtures } from './profiles.js';
import { DEFAULT_GROUPS, compatibleGroup, matchingGroupChannel, normalizedGroups } from './groups.js';

test('configurações antigas recebem os grupos padrão sem alterar endereços', () => {
  const fixtures = imageFixtures().map(({ groupId, ...fixture }) => fixture);
  const result = normalizedGroups({ fixtures }, fixtures);
  assert.equal(result.groups.length, DEFAULT_GROUPS.length);
  assert.equal(result.fixtures[0].groupId, 'group-moving');
  assert.equal(result.fixtures[4].groupId, 'group-par-led');
  assert.equal(result.fixtures[4].address, 29);
});

test('grupos salvos preservam nomes e associações', () => {
  const fixtures = imageFixtures();
  fixtures[0].groupId = 'stage';
  const result = normalizedGroups({ groups: [{ id: 'stage', name: 'Palco' }] }, fixtures);
  assert.equal(result.groups[0].name, 'Palco');
  assert.equal(result.fixtures[0].groupId, 'stage');
  assert.equal(result.fixtures[1].groupId, '');
});

test('controle de grupo só vale para perfis compatíveis', () => {
  const fixtures = imageFixtures();
  assert.equal(compatibleGroup(fixtures.slice(4)), true);
  assert.equal(compatibleGroup([fixtures[0], fixtures[4]]), false);
  assert.equal(matchingGroupChannel(fixtures[4], fixtures[5], 31), 39);
  assert.equal(matchingGroupChannel(fixtures[4], fixtures[0], 31), null);
});
