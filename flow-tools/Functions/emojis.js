/** Emojis personalizados do Bot Hm (CommonJS para o flow-tools). */
const WHITE = 0xffffff;

function titled(emoji, title) {
  const t = String(title || '').trim();
  if (!t) return String(emoji);
  if (/<:\w+:\d+>/.test(t)) return t;
  return `${emoji} ${t}`;
}

const E = {
  check: { id: '1546367702028001320', name: 'check' },
  lupa: { id: '1546367563083161640', name: 'lupa' },
  pessoas: { id: '1546367468522573884', name: 'pessoas' },
  config: { id: '1546367399476076594', name: 'config' },
  raio: { id: '1546367888301236304', name: 'raio' },
  edit: { id: '1546367777428738088', name: 'edit' },
  rocket: { id: '1546367826858614834', name: 'rocket' },
  bot: { id: '1546367440244576358', name: 'bot' },
  tempo: { id: '1546367587531628574', name: 'tempo' },
  coin: { id: '1546367739088871466', name: 'coin' },
};

const ET = {
  check: '<:check:1546367702028001320>',
  lupa: '<:lupa:1546367563083161640>',
  pessoas: '<:pessoas:1546367468522573884>',
  config: '<:config:1546367399476076594>',
  raio: '<:raio:1546367888301236304>',
  edit: '<:edit:1546367777428738088>',
  rocket: '<:rocket:1546367826858614834>',
  bot: '<:bot:1546367440244576358>',
  tempo: '<:tempo:1546367587531628574>',
  coin: '<:coin:1546367739088871466>',
};

module.exports = { E, ET, WHITE, titled };
