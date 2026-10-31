export const ROLES = [
  ['raw', 'Valor livre'], ['pan', 'Horizontal (pan)'], ['panFine', 'Horizontal fino'],
  ['tilt', 'Vertical (tilt)'], ['tiltFine', 'Vertical fino'],
  ['colorWheel', 'Roda de cores'], ['gobo', 'Gobo'], ['strobe', 'Estrobo'],
  ['lamp', 'Lâmpada / abertura'], ['speed', 'Velocidade'], ['macro', 'Macro'],
  ['reset', 'Reset'], ['ring', 'Anel de LED'], ['dimmer', 'Intensidade'],
  ['red', 'Vermelho'], ['green', 'Verde'], ['blue', 'Azul'],
  ['white', 'Branco'], ['whiteStrobe', 'Branco com strobo'], ['effect', 'Cor / efeito'], ['unused', 'Sem função']
];

const moving = [
  ['Horizontal', 'pan'], ['Horizontal fino', 'panFine'], ['Vertical', 'tilt'],
  ['Vertical fino', 'tiltFine'], ['Cor', 'colorWheel'], ['Gobo', 'gobo'],
  ['Strobe', 'strobe'], ['Lâmpada', 'lamp'], ['Velocidade', 'speed'],
  ['Macro', 'macro'], ['Reset', 'reset'], ['Anel de LED', 'ring']
];
const ribalta = [['Velocidade', 'speed'], ['Cores / efeitos', 'effect']];
const par = [
  ['Nada', 'unused'], ['Intensidade', 'dimmer'], ['Vermelho', 'red'],
  ['Verde', 'green'], ['Azul', 'blue'], ['Branco', 'white'],
  ['Branco com strobo', 'whiteStrobe'], ['Cores sortidas', 'effect']
];

export const PROFILE_CHANNELS = { Moving: moving, Ribalta: ribalta, 'PAR LED': par };

export function profileFixture(name, type, address) {
  const template = PROFILE_CHANNELS[type];
  const groupId = ({ Moving: 'group-moving', Ribalta: 'group-ribalta', 'PAR LED': 'group-par-led' })[type] || '';
  return {
    id: crypto.randomUUID(), name, type, address, channels: template.length, groupId,
    channelDefs: template.map(([label, role]) => ({ label, role, presets: [] }))
  };
}

export function imageFixtures() {
  return [
    profileFixture('Moving esquerdo', 'Moving', 1),
    profileFixture('Moving direito', 'Moving', 13),
    profileFixture('Ribalta 1', 'Ribalta', 25),
    profileFixture('Ribalta 2', 'Ribalta', 27),
    profileFixture('PAR LED 1', 'PAR LED', 29),
    profileFixture('PAR LED 2', 'PAR LED', 37),
    profileFixture('PAR LED 3', 'PAR LED', 45),
    profileFixture('PAR LED 4', 'PAR LED', 53)
  ];
}

export function channelDefinitions(fixture) {
  const template = PROFILE_CHANNELS[fixture.type] || [];
  return Array.from({ length: fixture.channels }, (_, index) => {
    const saved = fixture.channelDefs?.[index] || {};
    const fallback = template.length === fixture.channels ? template[index] : null;
    const oldWhite = fixture.type === 'PAR LED' && fixture.channels === 8 && index === 6 && saved.role === 'white' && saved.label === 'Branco 2';
    return {
      label: String(oldWhite ? 'Branco com strobo' : saved.label || fallback?.[0] || `Canal ${index + 1}`),
      role: oldWhite ? 'whiteStrobe' : (ROLES.some(([role]) => role === saved.role) ? saved.role : (fallback?.[1] || 'raw')),
      presets: Array.isArray(saved.presets) ? saved.presets.filter(p => p && typeof p.name === 'string' && Number.isInteger(Number(p.value)) && Number(p.value) >= 0 && Number(p.value) <= 255).map(p => ({ name: p.name, value: Number(p.value) })) : []
    };
  });
}

export function channelForRole(fixture, role) {
  const index = channelDefinitions(fixture).findIndex(def => def.role === role);
  return index < 0 ? null : fixture.address + index;
}

export function continuousChannelAddresses(fixtures) {
  const continuous = new Set(['pan', 'panFine', 'tilt', 'tiltFine', 'dimmer', 'red', 'green', 'blue', 'white']);
  return new Set(fixtures.flatMap(fixture => channelDefinitions(fixture).flatMap((def, index) => continuous.has(def.role) ? [fixture.address + index] : [])));
}
