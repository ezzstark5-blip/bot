import {
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { E, ET, WHITE } from '../emojis.js';
import { formatBRL, loadBoosterConfig } from './config.js';

const COLOR = WHITE;
const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function flagsFor({ ephemeral = false } = {}) {
  return ephemeral ? V2_EPHEMERAL : V2;
}

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function btn(id, label, style = ButtonStyle.Secondary, emoji = null, disabled = false) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function shopFooter() {
  return `-# ${ET.bot} Booster Shop · <t:${Math.floor(Date.now() / 1000)}:f>`;
}

/** Painel público do produto (Components V2). */
export function buildBoosterEmbed() {
  const cfg = loadBoosterConfig();
  const container = new ContainerBuilder().setAccentColor(COLOR);

  if (cfg.bannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(cfg.bannerUrl)
      )
    );
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${/<:\w+:\d+>/.test(cfg.title) ? cfg.title : `${ET.coin} ${cfg.title}`}`
      ),
      new TextDisplayBuilder().setContent(cfg.description)
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${ET.coin} **${formatBRL(cfg.price)}**\n${cfg.stockLabel}`
      )
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents((row) =>
      row.setComponents(btn('booster_buy', 'Comprar', ButtonStyle.Success, E.coin))
    );

  return {
    components: [container],
    flags: V2,
    allowedMentions: { parse: [] },
  };
}

export function buildLoadingPanel(text) {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${ET.tempo} ${text}`)
    );

  return {
    components: [container],
    flags: V2_EPHEMERAL,
    allowedMentions: { parse: [] },
  };
}

/** Carrinho — Detalhes da compra. */
export function buildCartPanel({ qty = 1, userTag = '', ephemeral = false } = {}) {
  const cfg = loadBoosterConfig();
  const total = Math.round(cfg.price * qty * 100) / 100;

  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.lupa} Detalhes da sua compra`),
      new TextDisplayBuilder().setContent(
        'Aqui estão os produtos que você escolheu, com valores atualizados e estoque em tempo real. Você pode **alterar quantidades** ou **concluir sua compra** usando os botões abaixo.'
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**Produtos no Carrinho (${qty}x)**`,
          `\`\`\`\n${qty}x ${cfg.title} | ${formatBRL(cfg.price)}\n\`\`\``,
          `**Valor à vista**`,
          `**${formatBRL(total)}**`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(shopFooter()))
    .addActionRowComponents((row) =>
      row.setComponents(
        btn('booster_goto_pay', 'Ir para pagamento', ButtonStyle.Success, E.check),
        btn('booster_qty', 'Editar quantidade', ButtonStyle.Secondary, E.edit)
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        btn('booster_coupon', 'Usar cupom de desconto', ButtonStyle.Secondary, E.coin),
        btn('booster_terms', 'Ler Termos e Condições', ButtonStyle.Primary, E.lupa)
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(btn('booster_close_cart', 'Fechar carrinho', ButtonStyle.Danger, E.config))
    );

  return {
    components: [container],
    flags: flagsFor({ ephemeral }),
    allowedMentions: { parse: [] },
    _meta: { qty, total, userTag },
  };
}

/** Escolha de forma de pagamento. */
export function buildPayMethodPanel({ qty = 1, ephemeral = false } = {}) {
  const cfg = loadBoosterConfig();
  const total = Math.round(cfg.price * qty * 100) / 100;

  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.coin} Escolha a sua forma de pagamento`),
      new TextDisplayBuilder().setContent(
        'Dê uma última olhada na sua compra e escolha como deseja pagar para concluir de forma prática e rápida.'
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**Produtos no Carrinho (${qty}x)**`,
          `\`\`\`\n${qty}x ${cfg.title} | ${formatBRL(cfg.price)}\n\`\`\``,
          `**Valor à vista**`,
          `**${formatBRL(total)}**`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(shopFooter()))
    .addActionRowComponents((row) =>
      row.setComponents(
        btn('booster_pix', 'Pagar com Pix', ButtonStyle.Secondary, E.raio),
        btn('booster_card', 'Pagar com Cartão', ButtonStyle.Secondary, E.coin, true)
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(btn('booster_back_cart', 'Voltar', ButtonStyle.Secondary, E.tempo))
    );

  return {
    components: [container],
    flags: flagsFor({ ephemeral }),
    allowedMentions: { parse: [] },
  };
}

export function buildTermsPanel({ ephemeral = false } = {}) {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.lupa} Termos e Condições`),
      new TextDisplayBuilder().setContent(
        [
          '• O acesso Booster é digital e liberado após confirmação do PIX.',
          '• Não pedimos nome nem CPF no Discord — o pagamento é processado pela StorM Wallet.',
          '• Após o pagamento, o cargo é entregue automaticamente.',
          '• Em caso de problemas, abra um ticket com o comprovante/ID do pedido.',
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents((row) =>
      row.setComponents(btn('booster_back_cart', 'Voltar ao carrinho', ButtonStyle.Secondary, E.tempo))
    );

  return {
    components: [container],
    flags: flagsFor({ ephemeral }),
    allowedMentions: { parse: [] },
  };
}

export function buildQtyPanel({ qty = 1, ephemeral = false } = {}) {
  const cfg = loadBoosterConfig();
  const total = Math.round(cfg.price * qty * 100) / 100;

  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.edit} Quantidade`),
      new TextDisplayBuilder().setContent(
        `Produto: **${cfg.title}**\nQuantidade: **${qty}**\nTotal: **${formatBRL(total)}**`
      )
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents((row) =>
      row.setComponents(
        btn('booster_qty_dec', '-1', ButtonStyle.Secondary, null, qty <= 1),
        btn('booster_qty_inc', '+1', ButtonStyle.Secondary, null, qty >= 10),
        btn('booster_back_cart', 'Confirmar', ButtonStyle.Success, E.check)
      )
    );

  return {
    components: [container],
    flags: flagsFor({ ephemeral }),
    allowedMentions: { parse: [] },
  };
}

/** Painel PIX com QR + copia e cola. */
export function buildPaymentMessage(order, { qrAttachmentName = 'pix-qr.png', ephemeral = false } = {}) {
  const cfg = loadBoosterConfig();
  const container = new ContainerBuilder().setAccentColor(COLOR);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${ET.check} Pagamento via PIX criado`),
    new TextDisplayBuilder().setContent(
      [
        `**${cfg.title}** · ${formatBRL(order.amount ?? cfg.price)}`,
        `Pedido: \`${order.externalId}\``,
        `Status: **${order.status || 'PENDENTE'}**`,
        '',
        '**Código copia e cola**',
        `\`\`\`\n${order.pixCode}\n\`\`\``,
      ].join('\n')
    )
  );

  if (order.qrLocal) {
    container.addSeparatorComponents(sep());
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${qrAttachmentName}`)
      )
    );
  }

  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Escaneie o QR ou cole o código no app do banco · ID \`${order.id}\``
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        btn(`booster_check:${order.id}`, 'Verificar pagamento', ButtonStyle.Success, E.check),
        btn(`booster_copyhint:${order.id}`, 'Como pagar', ButtonStyle.Secondary, E.lupa)
      )
    );

  const payload = {
    components: [container],
    flags: flagsFor({ ephemeral }),
    allowedMentions: { parse: [] },
  };

  if (order.qrBuffer) {
    payload.files = [new AttachmentBuilder(order.qrBuffer, { name: qrAttachmentName })];
  }

  return payload;
}

export function buildPaidPanel(order, roleId, { ephemeral = false } = {}) {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ET.check} Pagamento confirmado!`),
      new TextDisplayBuilder().setContent(
        [
          `Pedido \`${order.externalId}\` pago com sucesso.`,
          roleId
            ? `Cargo <@&${roleId}> liberado na sua conta.`
            : 'Acesso liberado. Se o cargo não aparecer, chame a staff.',
          '',
          'Este canal será fechado em breve.',
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents((row) =>
      row.setComponents(btn('booster_close_cart', 'Fechar carrinho', ButtonStyle.Danger, E.config))
    );

  return {
    components: [container],
    flags: flagsFor({ ephemeral }),
    allowedMentions: { parse: [] },
  };
}

export function qrBufferFromDataUri(qrCode) {
  if (!qrCode || typeof qrCode !== 'string') return null;
  const match = qrCode.match(/^data:image\/\w+;base64,(.+)$/);
  const b64 = match ? match[1] : qrCode.includes(',') ? qrCode.split(',').pop() : qrCode;
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

/** Compat: modal removido do fluxo. */
export function buildBuyModal() {
  return null;
}
