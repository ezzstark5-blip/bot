const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "src", "commands");

const files = {
"addmoney.js": String.raw`const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');
const { createWalletService } = require('../services/walletService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addmoney')
        .setDescription('Adiciona saldo na carteira de um usuario')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption((option) =>
            option.setName('pessoa').setDescription('Usuario que recebera o saldo').setRequired(true)
        )
        .addNumberOption((option) =>
            option.setName('valor').setDescription('Valor em reais').setRequired(true).setMinValue(0.01)
        ),

    async execute(interaction, client, dbMySQL) {
        const usuario = interaction.options.getUser('pessoa');
        const valor = interaction.options.getNumber('valor');

        await interaction.deferReply({ ephemeral: true });

        try {
            const walletService = createWalletService({ dbMySQL });
            const saldoApos = await walletService.adicionarSaldo(
                usuario.id,
                valor,
                interaction.user.id,
                `Credito via /addmoney por ${interaction.user.tag}`
            );

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Saldo adicionado',
                    description: `Credito aplicado na carteira de **${usuario.tag}**.`,
                    color: 0xffffff,
                    fields: [
                        { name: 'Valor', value: `\`R$ ${valor.toFixed(2)}\``, inline: true },
                        { name: 'Saldo atual', value: `\`R$ ${saldoApos.toFixed(2)}\``, inline: true }
                    ]
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro no /addmoney:', error);
            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: error.message || 'Nao foi possivel adicionar saldo.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};
`,

"criarusuario.js": String.raw`const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const bcrypt = require('bcrypt');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('criarusuario')
        .setDescription('Cria um usuario no banco de login do painel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option.setName('usuario').setDescription('Nome de usuario').setRequired(true)
        )
        .addStringOption((option) =>
            option.setName('senha').setDescription('Senha do usuario').setRequired(true)
        ),

    async execute(interaction, client, dbMySQL) {
        const username = interaction.options.getString('usuario');
        const password = interaction.options.getString('senha');

        await interaction.deferReply({ ephemeral: true });

        try {
            const [existentes] = await dbMySQL.query(
                'SELECT id FROM users WHERE username = ? LIMIT 1',
                [username]
            );

            if (existentes.length > 0) {
                return interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: 'Usuario existente',
                        description: `Ja existe um usuario com o nome **${username}**.`,
                        color: 0xffffff
                    }),
                    ephemeral: true
                }));
            }

            const hash = await bcrypt.hash(password, 10);

            await dbMySQL.query(
                'INSERT INTO users (username, password, created_by) VALUES (?, ?, ?)',
                [username, hash, interaction.user.tag]
            );

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Usuario criado',
                    description: `Usuario **${username}** criado com sucesso.`,
                    color: 0xffffff,
                    fields: [
                        { name: 'Criado por', value: interaction.user.tag, inline: true }
                    ]
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro no /criarusuario:', error);
            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: 'Ocorreu um erro ao criar o usuario.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};
`,

"deletarusuario.js": String.raw`const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletarusuario')
        .setDescription('Remove um usuario do banco de login do painel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option.setName('usuario').setDescription('Nome de usuario a remover').setRequired(true)
        ),

    async execute(interaction, client, dbMySQL) {
        const username = interaction.options.getString('usuario');

        await interaction.deferReply({ ephemeral: true });

        try {
            const [result] = await dbMySQL.query('DELETE FROM users WHERE username = ?', [username]);

            if (result.affectedRows === 0) {
                return interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: 'Nao encontrado',
                        description: `Nenhum usuario encontrado com o nome **${username}**.`,
                        color: 0xffffff
                    }),
                    ephemeral: true
                }));
            }

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Usuario removido',
                    description: `Usuario **${username}** removido com sucesso.`,
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro no /deletarusuario:', error);
            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: 'Ocorreu um erro ao remover o usuario.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};
`,

"gerarkey.js": String.raw`const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');
const { gerarKeyUnica } = require('../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gerarkey')
        .setDescription('Gera uma key aleatoria e salva no banco')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client, dbMySQL) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const key = await gerarKeyUnica(dbMySQL);

            await dbMySQL.query(
                'INSERT INTO keys_table (key_value, created_by) VALUES (?, ?)',
                [key, interaction.user.tag]
            );

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Key gerada',
                    description: 'Key criada com sucesso.',
                    color: 0xffffff,
                    fields: [
                        { name: 'Key', value: `\`${key}\``, inline: false }
                    ]
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro no /gerarkey:', error);
            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: 'Ocorreu um erro ao gerar a key.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};
`,

"listarusuarios.js": String.raw`const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listarusuarios')
        .setDescription('Lista os usuarios cadastrados no banco de login do painel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client, dbMySQL) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const [rows] = await dbMySQL.query(
                'SELECT username, created_by, created_at FROM users ORDER BY created_at DESC LIMIT 25'
            );

            if (rows.length === 0) {
                return interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: 'Usuarios',
                        description: 'Nenhum usuario cadastrado ainda.',
                        color: 0xffffff
                    }),
                    ephemeral: true
                }));
            }

            const lista = rows
                .map((u, i) => {
                    const data = u.created_at
                        ? new Date(u.created_at).toLocaleString('pt-BR')
                        : 'desconhecido';
                    return `**${i + 1}.** ${u.username} — ${u.created_by ?? 'desconhecido'} (${data})`;
                })
                .join('\n');

            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Usuarios cadastrados',
                    description: lista,
                    color: 0xffffff,
                    footer: { text: 'Ultimos 25 registros' }
                }),
                ephemeral: true
            }));
        } catch (error) {
            console.error('Erro no /listarusuarios:', error);
            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Erro',
                    description: 'Ocorreu um erro ao listar os usuarios.',
                    color: 0xffffff
                }),
                ephemeral: true
            }));
        }
    }
};
`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(dir, name), content, "utf8");
  console.log("wrote", name);
}