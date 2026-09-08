import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { E, ET } from '../emojis.js';

const COLOR = 0xffffff;
const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

export function getAuthPublicUrl() {
  return (
    process.env.AUTH_PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${process.env.PORT || process.env.AUTH_PORT || 3850}`
  ).replace(/\/$/, '');
}

export function getAuthRoleId() {
  return process.env.AUTH_ROLE_ID || '1546353810723577937';
}

/** Painel público de autenticação. */
export function buildAuthPanel({ ephemeral = false } = {}) {
  const roleId = getAuthRoleId();
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.check} Autenticação`),
      new TextDisplayBuilder().setContent(
        [
          `${ET.lupa} Verifique sua conta Discord para liberar o acesso.`,
          `${ET.raio} Ao concluir, você recebe o cargo <@&${roleId}>.`,
          `${ET.rocket} A auth também autoriza entrar em servidores com o bot.`,
          `${ET.tempo} O processo é rápido e seguro.`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${ET.bot} Auth · <t:${Math.floor(Date.now() / 1000)}:f>`
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId('auth_open')
          .setLabel('Autenticar')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(E.check)
      )
    );

  return {
    components: [container],
    flags: ephemeral ? V2_EPHEMERAL : V2,
    allowedMentions: { parse: [] },
  };
}

/** Resposta ephemeral com link do site. */
export function buildAuthLinkPanel() {
  const url = getAuthPublicUrl();
  const redirect =
    process.env.AUTH_REDIRECT_URI || `${url}/callback`;
  const clientId = process.env.AUTH_CLIENT_ID || process.env.APP_ID || '';
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.rocket} Seu link de autenticação`),
      new TextDisplayBuilder().setContent(
        [
          `${ET.lupa} Clique no botão para abrir o site (fluxo automático).`,
          '',
          `${ET.config} Se der **redirect_uri inválido**, no [Developer Portal](https://discord.com/developers/applications/${clientId}/oauth2) → **OAuth2** → **Redirects**, adicione exatamente:`,
          `\`${redirect}\``,
          'Depois **Save Changes** e tente de novo.',
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setLabel('Abrir autenticação')
          .setStyle(ButtonStyle.Link)
          .setURL(url)
          .setEmoji(E.rocket)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${ET.bot} ${url}`)
    );

  return {
    components: [container],
    flags: V2_EPHEMERAL,
    allowedMentions: { parse: [] },
  };
}
