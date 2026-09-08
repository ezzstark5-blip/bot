import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { logEntrada, logError, logInfo } from '../logs/logger.js';
import { buildLogEmbed, sendChannelLog } from '../logs/channels.js';
import { ET } from '../emojis.js';
import { sendAsChannelMessage } from '../utils/publicReply.js';
import { formatBRL, loadBoosterConfig, saveBoosterConfig } from './config.js';
import {
  buildBoosterEmbed,
  buildLoadingPanel,
  buildCartPanel,
  buildPayMethodPanel,
  buildTermsPanel,
  buildQtyPanel,
  buildPaymentMessage,
  buildPaidPanel,
  qrBufferFromDataUri,
} from './components.js';
import { createPayment, getPayment, validateAccount } from './storm.js';
import {
  createExternalId,
  getOrder,
  getOrderByExternalId,
  upsertOrder,
} from './store.js';

/** @type {Map<string, NodeJS.Timeout>} */
const pollTimers = new Map();

/** Carrinho em memória: userId → { qty, channelId } */
const carts = new Map();

/** @type {import('discord.js').Client | null} */
let botClient = null;

export function bindBoosterClient(client) {
  botClient = client;
}

function isStaff(interaction) {
  if (process.env.OWNER_ID && interaction.user.id === process.env.OWNER_ID) return true;
  return !!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function getCart(userId) {
  const key = String(userId);
  if (!carts.has(key)) carts.set(key, { qty: 1, channelId: null });
  return carts.get(key);
}

function clearCartChannel(userId) {
  const cart = getCart(userId);
  cart.channelId = null;
}

function safeChannelName(user) {
  const base = String(user.username || 'cliente')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 20);
  return `carrinho-${base || 'cliente'}`.slice(0, 90);
}

async function createCartChannel(interaction) {
  const cfg = loadBoosterConfig();
  const guild = interaction.guild;
  if (!guild) throw new Error('Servidor não encontrado.');

  const categoryId = cfg.cartCategoryId;
  if (!categoryId) throw new Error('Categoria do carrinho não configurada.');

  return guild.channels.create({
    name: safeChannelName(interaction.user),
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: `Carrinho Booster · ${interaction.user.tag} · ${interaction.user.id}`,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: interaction.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ],
    reason: `Carrinho Booster de ${interaction.user.tag}`,
  });
}

async function resolveOpenCartChannel(client, userId) {
  const cart = getCart(userId);
  if (!cart.channelId) return null;
  const ch =
    client.channels.cache.get(cart.channelId) ||
    (await client.channels.fetch(cart.channelId).catch(() => null));
  if (!ch) {
    cart.channelId = null;
    return null;
  }
  return ch;
}

function scheduleCloseCart(channel, userId, delayMs = 60_000) {
  setTimeout(() => {
    clearCartChannel(userId);
    channel?.delete('Carrinho Booster finalizado').catch(() => null);
  }, delayMs);
}

/** Nome automático (Discord) — API exige payerName. */
function autoPayerName(user) {
  const raw = String(user.globalName || user.username || 'Cliente Discord').trim();
  const cleaned = raw.replace(/[^\p{L}\p{N}\s._-]/gu, '').trim() || 'Cliente Discord';
  return cleaned.slice(0, 100).padEnd(3, 'x');
}

/**
 * CPF sintético válido (checksum) a partir do Discord ID.
 * A Storm exige o campo; o cliente não digita nada.
 */
function autoPayerDocument(userId) {
  const envCpf = String(process.env.BOOSTER_DEFAULT_CPF || '').replace(/\D/g, '');
  if (envCpf.length === 11) return envCpf;

  let base = String(userId).replace(/\D/g, '');
  while (base.length < 9) base += '0';
  base = base.slice(-9);

  const calc = (digits, factor) => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * (factor - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calc(base, 10);
  const d2 = calc(base + String(d1), 11);
  return base + String(d1) + String(d2);
}

async function deliverRole(guild, userId, roleId) {
  if (!guild || !roleId) return false;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;
  if (member.roles.cache.has(roleId)) return true;
  await member.roles.add(roleId, 'Compra Booster — StorM Wallet');
  return true;
}

async function fulfillOrder(order, guild) {
  if (order.status === 'COMPLETO' && order.delivered) return order;

  const cfg = loadBoosterConfig();
  order.status = 'COMPLETO';
  order.completedAt = order.completedAt || new Date().toISOString();

  if (cfg.roleId && guild) {
    try {
      await deliverRole(guild, order.userId, cfg.roleId);
      order.delivered = true;
      order.deliveredAt = Date.now();
    } catch (err) {
      order.deliverError = err.message;
      logError({ event: 'BOOSTER_ROLE_FAIL', orderId: order.id, message: err.message });
    }
  } else {
    order.delivered = !cfg.roleId;
  }

  upsertOrder(order);
  clearPoll(order.id);
  logInfo({ event: 'BOOSTER_FULFILLED', orderId: order.id, userId: order.userId });

  if (botClient) {
    void sendChannelLog(
      botClient,
      'vendas',
      buildLogEmbed({
        title: `${ET.check} Venda Booster confirmada`,
        description: [
          `**Cliente:** <@${order.userId}> (\`${order.userId}\`)`,
          `**Valor:** ${formatBRL(order.amount)}`,
          `**Pedido:** \`${order.externalId}\``,
          `**Payment ID:** \`${order.id}\``,
          `**Cargo:** ${order.delivered ? 'entregue' : 'pendente/falha'}`,
        ].join('\n'),
      })
    );
  }

  return order;
}

export async function handleStormPaymentWebhook({ event, data }) {
  if (!data?.id && !data?.externalId) {
    throw new Error('Webhook sem id/externalId');
  }

  let order = (data.id && getOrder(data.id)) || null;
  if (!order && data.externalId) {
    order = getOrderByExternalId(data.externalId);
  }

  const isCompleted =
    event === 'payment.completed' || data.status === 'COMPLETO' || data.status === 'completed';
  const isFailed =
    event === 'payment.failed' || data.status === 'FALHA' || data.status === 'failed';

  if (!order) {
    const userId =
      data.metadata?.discordUserId ||
      (typeof data.externalId === 'string' && data.externalId.startsWith('booster-')
        ? data.externalId.split('-')[1]
        : null);

    if (isCompleted && userId && botClient) {
      const guildId = data.metadata?.guildId || process.env.GUILD_ID;
      const guild =
        botClient.guilds.cache.get(guildId) ||
        (await botClient.guilds.fetch(guildId).catch(() => null));
      const cfg = loadBoosterConfig();
      if (cfg.roleId && guild) {
        await deliverRole(guild, userId, cfg.roleId);
        logInfo({
          event: 'BOOSTER_WEBHOOK_DELIVERED_WITHOUT_ORDER',
          paymentId: data.id,
          userId,
        });
      }
    }

    logInfo({
      event: 'STORM_WEBHOOK_UNKNOWN_ORDER',
      paymentId: data.id,
      externalId: data.externalId,
      webhookEvent: event,
    });
    return;
  }

  if (isCompleted) {
    const guild =
      botClient?.guilds.cache.get(order.guildId) ||
      (await botClient?.guilds.fetch(order.guildId).catch(() => null));
    order.netAmount = data.netAmount ?? order.netAmount;
    await fulfillOrder(order, guild);

    try {
      const user = await botClient?.users.fetch(order.userId);
      await user?.send(
        `${ET.check} Pagamento confirmado! Seu **Acesso Boost** foi liberado.`
      );
    } catch {
      /* DM fechada */
    }
    return;
  }

  if (isFailed) {
    order.status = 'FALHA';
    order.failedAt = data.completedAt || new Date().toISOString();
    upsertOrder(order);
    clearPoll(order.id);
    logInfo({ event: 'BOOSTER_PAYMENT_FAILED', orderId: order.id });
  }
}

function clearPoll(paymentId) {
  const t = pollTimers.get(paymentId);
  if (t) {
    clearInterval(t);
    pollTimers.delete(paymentId);
  }
}

function startPoll(paymentId, guildId) {
  clearPoll(paymentId);
  let ticks = 0;
  let failStreak = 0;
  const timer = setInterval(async () => {
    ticks += 1;
    if (ticks > 90) {
      const order = getOrder(paymentId);
      if (order && order.status === 'PENDENTE') {
        order.status = 'EXPIRADO';
        order.failedAt = new Date().toISOString();
        upsertOrder(order);
      }
      clearPoll(paymentId);
      return;
    }
    try {
      const remote = await getPayment(paymentId);
      failStreak = 0;
      const order = getOrder(paymentId);
      if (!order) {
        clearPoll(paymentId);
        return;
      }
      order.status = remote.status || order.status;
      upsertOrder(order);

      if (remote.status === 'COMPLETO') {
        const guild =
          botClient?.guilds.cache.get(guildId || order.guildId) ||
          (await botClient?.guilds.fetch(guildId || order.guildId).catch(() => null));
        await fulfillOrder(order, guild);
      } else if (remote.status === 'FALHA') {
        order.status = 'FALHA';
        upsertOrder(order);
        clearPoll(paymentId);
      }
    } catch (err) {
      failStreak += 1;
      const msg = String(err.message || '');
      const gone =
        /não encontrado|not found|404/i.test(msg) || err.status === 404;

      if (gone || failStreak >= 3) {
        const order = getOrder(paymentId);
        if (order && order.status === 'PENDENTE') {
          order.status = gone ? 'EXPIRADO' : 'FALHA';
          order.failedAt = new Date().toISOString();
          order.pollError = msg.slice(0, 200);
          upsertOrder(order);
        }
        clearPoll(paymentId);
        logInfo({
          event: 'BOOSTER_POLL_STOPPED',
          paymentId,
          reason: gone ? 'payment_not_found' : 'poll_fail_streak',
          message: msg.slice(0, 120),
        });
        return;
      }

      logError({ event: 'BOOSTER_POLL_FAIL', paymentId, message: err.message });
    }
  }, 10_000);
  pollTimers.set(paymentId, timer);
}

export async function resumeBoosterPolls(client) {
  bindBoosterClient(client);
  const { listOrders } = await import('./store.js');
  const maxAgeMs = 2 * 60 * 60 * 1000; // 2h
  const now = Date.now();

  for (const order of listOrders()) {
    if (order.status !== 'PENDENTE') continue;

    const created = Number(order.createdAt) || Date.parse(String(order.createdAt || '')) || 0;
    if (created && now - created > maxAgeMs) {
      order.status = 'EXPIRADO';
      order.failedAt = new Date().toISOString();
      upsertOrder(order);
      logInfo({ event: 'BOOSTER_ORDER_EXPIRED_ON_RESUME', orderId: order.id });
      continue;
    }

    startPoll(order.id, order.guildId);
  }
}

export async function replyBoosterPanel(interaction) {
  if (!isStaff(interaction)) {
    await interaction.reply({
      content: `${ET.config} Você precisa de **Gerenciar Servidor** para postar o painel.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const cfg = loadBoosterConfig();
  if (!cfg.apiKey) {
    await interaction.reply({
      content: `${ET.config} Configure \`STORM_WALLET_API_KEY\` no \`.env\` antes de vender.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await sendAsChannelMessage(interaction, buildBoosterEmbed());
  logEntrada({ event: 'BOOSTER_PANEL_POSTED', userId: interaction.user.id, guildId: interaction.guildId });
}

export async function handleBoosterConfigCommand(interaction) {
  if (!isStaff(interaction)) {
    await interaction.reply({
      content: `${ET.config} Sem permissão.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const price = interaction.options.getNumber('preco');
  const role = interaction.options.getRole('cargo');
  const banner = interaction.options.getString('banner');
  const title = interaction.options.getString('titulo');

  const partial = {};
  if (price != null) partial.price = price;
  if (role) partial.roleId = role.id;
  if (banner != null) partial.bannerUrl = banner;
  if (title) partial.title = title;

  const cfg = saveBoosterConfig(partial);

  let accountLine = '';
  try {
    if (cfg.apiKey) {
      const acc = await validateAccount();
      accountLine = `\n${ET.check} Wallet OK: **${acc.name || acc.email || acc.id}**`;
    } else {
      accountLine = `\n${ET.config} \`STORM_WALLET_API_KEY\` ainda não definida.`;
    }
  } catch (err) {
    accountLine = `\n${ET.config} Wallet: ${err.message}`;
  }

  await interaction.reply({
    content: [
      `${ET.check} Configuração do Booster atualizada.`,
      `Título: **${cfg.title}**`,
      `Preço: **${formatBRL(cfg.price)}**`,
      `Cargo: ${cfg.roleId ? `<@&${cfg.roleId}>` : '`não definido`'}`,
      `Banner: ${cfg.bannerUrl ? 'definido' : '`não definido`'}`,
      accountLine,
    ].join('\n'),
    flags: MessageFlags.Ephemeral,
  });
}

async function createPixForUser(interaction, qty) {
  const cfg = loadBoosterConfig();
  const amount = Math.round(cfg.price * qty * 100) / 100;
  const externalId = createExternalId(interaction.user.id);

  const payment = await createPayment({
    amount,
    payerName: autoPayerName(interaction.user),
    payerDocument: autoPayerDocument(interaction.user.id),
    description: `${cfg.title} x${qty}`.slice(0, 200),
    externalId,
    metadata: {
      discordUserId: interaction.user.id,
      guildId: interaction.guildId,
      product: 'booster',
      qty,
    },
  });

  const order = {
    id: payment.id,
    externalId: payment.externalId || externalId,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    amount: payment.amount ?? amount,
    qty,
    pixCode: payment.pixCode,
    qrCode: payment.qrCode,
    status: payment.status || 'PENDENTE',
    createdAt: Date.now(),
    delivered: false,
  };
  upsertOrder(order);
  startPoll(order.id, order.guildId);

  logEntrada({
    event: 'BOOSTER_PAYMENT_CREATED',
    userId: interaction.user.id,
    paymentId: order.id,
    externalId: order.externalId,
  });
  void sendChannelLog(
    interaction.client,
    'vendas',
    buildLogEmbed({
      title: `${ET.coin} PIX Booster gerado`,
      description: [
        `**Cliente:** ${interaction.user.tag} (\`${interaction.user.id}\`)`,
        `**Valor:** ${formatBRL(order.amount)}`,
        `**Qtd:** ${qty}`,
        `**Pedido:** \`${order.externalId}\``,
        `**Status:** ${order.status}`,
      ].join('\n'),
    })
  );

  return order;
}

export async function handleBoosterInteraction(interaction) {
  const id = interaction.customId || '';
  if (!id.startsWith('booster_')) return false;

  try {
    bindBoosterClient(interaction.client);
    const cart = getCart(interaction.user.id);

    if (interaction.isButton() && id === 'booster_buy') {
      const cfg = loadBoosterConfig();
      if (!cfg.apiKey) {
        await interaction.reply({
          content: `${ET.config} Vendas temporariamente indisponíveis (Wallet não configurada).`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      await interaction.reply(buildLoadingPanel('Aguarde, criando o carrinho...'));

      try {
        let channel = await resolveOpenCartChannel(interaction.client, interaction.user.id);
        if (!channel) {
          channel = await createCartChannel(interaction);
          cart.channelId = channel.id;
          cart.qty = cart.qty || 1;
        }

        await channel.send({
          content: `<@${interaction.user.id}>`,
          allowedMentions: { users: [interaction.user.id] },
        });

        await channel.send(
          buildCartPanel({ qty: cart.qty || 1, userTag: interaction.user.tag, ephemeral: false })
        );

        await interaction.editReply(
          buildLoadingPanel(`${ET.check} Carrinho aberto: ${channel}`)
        );

        logEntrada({
          event: 'BOOSTER_CART_OPENED',
          userId: interaction.user.id,
          channelId: channel.id,
        });
      } catch (err) {
        logError({ event: 'BOOSTER_CART_CREATE_FAIL', message: err.message });
        await interaction.editReply(
          buildLoadingPanel(`${ET.config} Não foi possível abrir o carrinho: ${err.message}`)
        );
      }
      return true;
    }

    if (interaction.isButton() && id === 'booster_close_cart') {
      await interaction.reply({
        content: `${ET.tempo} Fechando carrinho...`,
        flags: MessageFlags.Ephemeral,
      });
      clearCartChannel(interaction.user.id);
      await interaction.channel?.delete('Carrinho Booster fechado pelo cliente').catch(() => null);
      return true;
    }

    if (interaction.isButton() && id === 'booster_goto_pay') {
      await interaction.update(buildPayMethodPanel({ qty: cart.qty || 1, ephemeral: false }));
      return true;
    }

    if (interaction.isButton() && id === 'booster_back_cart') {
      await interaction.update(
        buildCartPanel({ qty: cart.qty || 1, userTag: interaction.user.tag, ephemeral: false })
      );
      return true;
    }

    if (interaction.isButton() && id === 'booster_terms') {
      await interaction.update(buildTermsPanel({ ephemeral: false }));
      return true;
    }

    if (interaction.isButton() && id === 'booster_qty') {
      await interaction.update(buildQtyPanel({ qty: cart.qty || 1, ephemeral: false }));
      return true;
    }

    if (interaction.isButton() && id === 'booster_qty_inc') {
      cart.qty = Math.min(10, (cart.qty || 1) + 1);
      await interaction.update(buildQtyPanel({ qty: cart.qty, ephemeral: false }));
      return true;
    }

    if (interaction.isButton() && id === 'booster_qty_dec') {
      cart.qty = Math.max(1, (cart.qty || 1) - 1);
      await interaction.update(buildQtyPanel({ qty: cart.qty, ephemeral: false }));
      return true;
    }

    if (interaction.isButton() && id === 'booster_coupon') {
      await interaction.reply({
        content: `${ET.coin} Nenhum cupom ativo no momento.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (interaction.isButton() && id === 'booster_card') {
      await interaction.reply({
        content: `${ET.config} Pagamento com cartão ainda não está disponível. Use **PIX**.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (interaction.isButton() && id === 'booster_pix') {
      await interaction.update(
        buildLoadingPanel('Capturando detalhes do carrinho, aguarde...')
      );

      try {
        await interaction.editReply(
          buildLoadingPanel('Quase lá! Preparando os detalhes do pagamento...')
        );

        const qty = cart.qty || 1;
        const order = await createPixForUser(interaction, qty);
        const qrBuffer = qrBufferFromDataUri(order.qrCode);
        const payload = buildPaymentMessage(
          { ...order, qrBuffer, qrLocal: !!qrBuffer },
          { ephemeral: false }
        );
        await interaction.editReply(payload);
      } catch (err) {
        logError({ event: 'BOOSTER_PAYMENT_CREATE_FAIL', message: err.message });
        await interaction.editReply(
          buildLoadingPanel(`${ET.config} Não foi possível criar o PIX: ${err.message}`)
        );
      }
      return true;
    }

    if (interaction.isButton() && id.startsWith('booster_copyhint:')) {
      await interaction.reply({
        content:
          `${ET.lupa} Abra o app do banco → **PIX** → **Copia e Cola** → cole o código da mensagem.\n` +
          `Ou escaneie o QR Code. Depois clique em **Verificar pagamento**.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (interaction.isButton() && id.startsWith('booster_check:')) {
      const paymentId = id.split(':')[1];
      await interaction.deferUpdate();

      const order = getOrder(paymentId);
      if (!order || order.userId !== interaction.user.id) {
        await interaction.followUp({
          content: `${ET.config} Pedido não encontrado.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      try {
        const remote = await getPayment(paymentId);
        order.status = remote.status || order.status;
        upsertOrder(order);

        if (remote.status === 'COMPLETO') {
          await fulfillOrder(order, interaction.guild);
          const cfg = loadBoosterConfig();
          await interaction.editReply(buildPaidPanel(order, cfg.roleId, { ephemeral: false }));
          scheduleCloseCart(interaction.channel, interaction.user.id, 60_000);
        } else if (remote.status === 'FALHA') {
          await interaction.followUp({
            content: `${ET.config} Pagamento marcado como **FALHA**. Gere um novo em **Comprar**.`,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.followUp({
            content: `${ET.tempo} Ainda **${remote.status || 'PENDENTE'}**. Pague o PIX e tente de novo em alguns segundos.`,
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (err) {
        await interaction.followUp({
          content: `${ET.config} ${err.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      return true;
    }
  } catch (err) {
    logError({ event: 'BOOSTER_INTERACTION_FAIL', message: err.message, customId: id });
    const payload = {
      content: `${ET.config} Erro no booster: ${err.message}`,
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }

  return true;
}
