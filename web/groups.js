import { channelDefinitions } from './profiles.js';

export const DEFAULT_GROUPS = [
  { id: 'group-moving', name: 'Movings' },
  { id: 'group-ribalta', name: 'Ribaltas' },
  { id: 'group-par-led', name: 'PAR LEDs' }
];

export function defaultGroupId(type) {
  return ({ Moving: 'group-moving', Ribalta: 'group-ribalta', 'PAR LED': 'group-par-led' })[type] || '';
}

export function normalizedGroups(value, fixtures) {
  const stored = Array.isArray(value.groups) ? value.groups : DEFAULT_GROUPS;
  const groups = stored.filter(group => group && typeof group.id === 'string').map(group => ({ id: String(group.id), name: String(group.name || 'Grupo') }));
  const ids = new Set(groups.map(group => group.id));
  const normalizedFixtures = fixtures.map(fixture => {
    const requested = fixture.groupId || (Array.isArray(value.groups) ? '' : defaultGroupId(fixture.type));
    return { ...fixture, groupId: ids.has(requested) ? requested : '' };
  });
  return { groups, fixtures: normalizedFixtures };
}

export function compatibleGroup(fixtures) {
  if (!fixtures.length) return false;
  const first = fixtures[0];
  const signature = channelDefinitions(first).map(definition => definition.role).join('|');
  return fixtures.every(fixture => fixture.type === first.type && fixture.channels === first.channels && channelDefinitions(fixture).map(definition => definition.role).join('|') === signature);
}

export function matchingGroupChannel(sourceFixture, targetFixture, sourceChannel) {
  const index = Number(sourceChannel) - sourceFixture.address;
  if (index < 0 || index >= sourceFixture.channels || targetFixture.channels !== sourceFixture.channels) return null;
  const source = channelDefinitions(sourceFixture)[index];
  const target = channelDefinitions(targetFixture)[index];
  return source?.role === target?.role ? targetFixture.address + index : null;
}
