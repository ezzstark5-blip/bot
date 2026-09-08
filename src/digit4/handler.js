import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { ET } from '../emojis.js';
import {
  buildDigit4StatusPanel,
  startDigit4Scanner,
  stopDigit4Scanner,
  isDigit4Running,
} from './scanner.js';

export async function handleDigit4Command(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: `${ET.config} Apenas administradores podem controlar o scanner.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'iniciar') {
    const result = startDigit4Scanner(interaction.client);
    await interaction.reply({
      content: result.already
        ? `${ET.tempo} Scanner já estava rodando.`
        : `${ET.check} Scanner **4–6 chars** (letra/número) iniciado.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'parar') {
    stopDigit4Scanner();
    await interaction.reply({
      content: `${ET.config} Scanner parado.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply(buildDigit4StatusPanel());
}
