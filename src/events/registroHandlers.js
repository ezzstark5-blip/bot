const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const { buildContainer, buildPayload, ActionRowBuilder } = require('../utils/componentsV2');

function isRegistroInteraction(interaction) {
    if (interaction.isButton()) {
        return interaction.customId === 'btn_registrar_unificado' || interaction.customId.startsWith('btn_gerar_');
    }

    if (interaction.isStringSelectMenu()) {
        return interaction.customId.startsWith('sel_plano_') || interaction.customId.startsWith('sel_duracao|||');
    }

    if (interaction.isModalSubmit()) {
        return interaction.customId === 'modal_registro_completo' || interaction.customId.startsWith('modal_gerar_key');
    }

    return false;
}

module.exports = {
    isRegistroInteraction,
    async execute(interaction, client, dbMySQL, enviarLog) {
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('sel_plano_')) {
                const idPedido = interaction.customId.replace('sel_plano_', '');
                const planoEscolhido = interaction.values[0];

                const nomesPlanos = {
                    ext_pre: 'External Premium',
                    ext_adv: 'External Advanced',
                    int_pre: 'Internal Premium',
                    int_adv: 'Internal Advanced'
                };

                const selectDuracao = new StringSelectMenuBuilder()
                    .setCustomId(`sel_duracao|||${idPedido}|||${planoEscolhido}`)
                    .setPlaceholder('Agora selecione a Duracao')
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel('Semanal (7 dias)').setValue('7'),
                        new StringSelectMenuOptionBuilder().setLabel('Mensal (30 dias)').setValue('30'),
                        new StringSelectMenuOptionBuilder().setLabel('Vitalicio (Sem expiracao)').setValue('9999')
                    );

                await interaction.update(buildPayload({
                    container: buildContainer({
                        title: 'Definindo Duracao',
                        description: `Plano selecionado: **${nomesPlanos[planoEscolhido]}**\n\nAgora escolha o tempo de acesso:`,
                        color: 0xffffff,
                        timestamp: true,
                        actionRows: [new ActionRowBuilder().addComponents(selectDuracao)]
                    })
                }));
                return;
            }

            if (interaction.customId.startsWith('sel_duracao|||')) {
                const parts = interaction.customId.split('|||');
                const idPedido = parts[1];
                const plano = parts[2];
                const dias = parseInt(interaction.values[0], 10);
                const diasTexto = dias === 9999 ? 'Vitalicio' : `${dias} dias`;

                const nomesPlanos = {
                    ext_pre: 'External Premium',
                    ext_adv: 'External Advanced',
                    int_pre: 'Internal Premium',
                    int_adv: 'Internal Advanced'
                };

                try {
                    const [existe] = await dbMySQL.query('SELECT * FROM pedidos WHERE id_pedido = ?', [idPedido]);

                    if (existe.length > 0) {
                        await dbMySQL.query(
                            "UPDATE pedidos SET status = 'aprovado', dias = ?, plano = ? WHERE id_pedido = ?",
                            [dias, plano, idPedido]
                        );
                    } else {
                        await dbMySQL.query(
                            "INSERT INTO pedidos (id_pedido, status, dias, plano) VALUES (?, 'aprovado', ?, ?)",
                            [idPedido, dias, plano]
                        );
                    }

                    if (enviarLog) {
                        enviarLog(
                            client,
                            'PEDIDO APROVADO (MENU)',
                            `**Admin:** ${interaction.user.tag}\n**Pedido:** ${idPedido}\n**Plano:** ${nomesPlanos[plano]}\n**Duracao:** ${diasTexto}`,
                            0xffffff
                        );
                    }

                    await interaction.update(buildPayload({
                        container: buildContainer({
                            title: 'APROVACAO CONCLUIDA',
                            description: `Usuario **[${idPedido}]** aprovado com sucesso!`,
                            color: 0xffffff,
                            fields: [
                                { name: 'Plano', value: `\`${nomesPlanos[plano]}\``, inline: true },
                                { name: 'Duracao', value: `\`${diasTexto}\``, inline: true }
                            ],
                            timestamp: true
                        })
                    }));
                } catch (err) {
                    console.error('Erro ao salvar aprovacao:', err);
                    await interaction.followUp(buildPayload({
                        container: buildContainer({
                            description: 'Erro ao salvar no banco de dados.',
                            color: 0xffffff
                        }),
                        ephemeral: true
                    }));
                }
                return;
            }
        }

        if (interaction.isButton() && interaction.customId === 'btn_registrar_unificado') {
            const modal = new ModalBuilder().setCustomId('modal_registro_completo').setTitle('Criar nova conta');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('txtUsuario')
                        .setLabel('Qual sera seu usuario?')
                        .setPlaceholder('Digite seu usuario')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('txtSenha')
                        .setLabel('Qual sera sua senha?')
                        .setPlaceholder('Digite sua senha')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('txtKey')
                        .setLabel('Key de ativacao')
                        .setPlaceholder('XMP-XXXX-XXXX')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );

            await interaction.showModal(modal);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith('btn_gerar_')) {
            const mapPlano = {
                btn_gerar_ext_adv: 'ext_adv',
                btn_gerar_ext_pre: 'ext_pre',
                btn_gerar_int_adv: 'int_adv',
                btn_gerar_int_pre: 'int_pre'
            };
            const planoCod = mapPlano[interaction.customId];
            if (!planoCod) return;

            const modal = new ModalBuilder().setCustomId(`modal_gerar_key|||${planoCod}`).setTitle('Gerar Key');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('txtDias')
                        .setLabel('Quantidade de Dias')
                        .setPlaceholder('Ex: 30, 9999')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );
            await interaction.showModal(modal);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId === 'modal_registro_completo') {
            const user = interaction.fields.getTextInputValue('txtUsuario');
            const pass = interaction.fields.getTextInputValue('txtSenha');
            const key = interaction.fields.getTextInputValue('txtKey');

            await interaction.deferReply({ ephemeral: true });

            try {
                const [rows] = await dbMySQL.query(
                    "SELECT plano, duracao_dias FROM `keys` WHERE `key_code` = ? AND status = 'disponivel'",
                    [key]
                );

                if (rows.length === 0) {
                    return interaction.editReply(buildPayload({
                        container: buildContainer({ description: 'Key invalida ou ja utilizada!', color: 0xffffff }),
                        ephemeral: true
                    }));
                }

                const planoDetectado = rows[0].plano;
                const dias = rows[0].duracao_dias || 0;

                if (!planoDetectado) {
                    return interaction.editReply(buildPayload({
                        container: buildContainer({ description: 'Key invalida: plano nao encontrado.', color: 0xffffff }),
                        ephemeral: true
                    }));
                }

                await dbMySQL.query(
                    "UPDATE `keys` SET status = 'usada', usuario = ?, senha = ?, discord_id = ?, used_at = NOW() WHERE `key_code` = ?",
                    [user, pass, interaction.user.id, key]
                );

                const [existeUser] = await dbMySQL.query('SELECT usuario FROM usuarios WHERE usuario = ?', [user]);

                if (existeUser.length > 0) {
                    await dbMySQL.query(
                        'UPDATE usuarios SET senha = ?, data_expiracao = DATE_ADD(CURDATE(), INTERVAL ? DAY), plano_ativo = ?, discord_id = ? WHERE usuario = ?',
                        [pass, dias, planoDetectado, interaction.user.id, user]
                    );
                } else {
                    await dbMySQL.query(
                        'INSERT INTO usuarios (usuario, senha, data_expiracao, plano_ativo, discord_id) VALUES (?, ?, DATE_ADD(CURDATE(), INTERVAL ? DAY), ?, ?)',
                        [user, pass, dias, planoDetectado, interaction.user.id]
                    );
                }

                if (enviarLog) {
                    enviarLog(
                        client,
                        'NOVA CONTA CRIADA',
                        `**Usuario:** ${user}\n**Plano:** ${planoDetectado}\n**Key:** ${key}\n**Discord ID:** ${interaction.user.id}\n**Autor:** ${interaction.user.tag}`,
                        0xffffff
                    );
                }

                await interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: 'Conta criada e key vinculada!',
                        color: 0xffffff,
                        fields: [
                            { name: 'Usuario', value: `\`${user}\``, inline: true },
                            { name: 'Plano', value: `\`${planoDetectado}\``, inline: true },
                            { name: 'Expiracao', value: `\`${dias === 9999 ? 'Vitalicio' : `${dias} dias`}\``, inline: true },
                            { name: 'Key', value: `\`${key}\``, inline: false }
                        ],
                        thumbnail: interaction.guild?.iconURL() ?? null,
                        footer: { text: 'NEW BYPASS' },
                        timestamp: true
                    }),
                    ephemeral: true
                }));
            } catch (err) {
                console.error('Erro no Registro:', err);
                const msgErro =
                    err.code === 'ER_DUP_ENTRY'
                        ? 'Este nome de usuario ja esta em uso! Escolha outro.'
                        : 'Erro interno ao processar seu cadastro.';
                await interaction.editReply(buildPayload({
                    container: buildContainer({ description: msgErro, color: 0xffffff }),
                    ephemeral: true
                }));
            }
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_gerar_key')) {
            const parts = interaction.customId.split('|||');
            const planoCod = parts[1];
            const nomesPlanos = {
                ext_pre: 'External Premium',
                ext_adv: 'External Advanced',
                int_pre: 'Internal Premium',
                int_adv: 'Internal Advanced'
            };
            const planoNome = nomesPlanos[planoCod];
            const diasStr = interaction.fields.getTextInputValue('txtDias');

            if (!/^\d+$/.test(diasStr)) {
                return interaction.reply(buildPayload({
                    container: buildContainer({ description: 'O campo de dias aceita apenas numeros.', color: 0xffffff }),
                    ephemeral: true
                }));
            }

            const dias = parseInt(diasStr, 10);
            await interaction.deferReply({ ephemeral: true });

            function genKey() {
                const part = () =>
                    Math.random()
                        .toString(36)
                        .toUpperCase()
                        .slice(2, 6)
                        .replace(/[^A-Z0-9]/g, 'A')
                        .padEnd(4, 'A');
                return `XMP-${part()}-${part()}`;
            }

            let key = genKey();
            let tentativas = 0;

            try {
                while (tentativas < 5) {
                    try {
                        await dbMySQL.query(
                            "INSERT INTO `keys` (key_code, plano, duracao_dias, status) VALUES (?, ?, ?, 'disponivel')",
                            [key, planoNome, dias]
                        );
                        break;
                    } catch (e) {
                        if (e.code === 'ER_DUP_ENTRY') {
                            key = genKey();
                            tentativas++;
                            continue;
                        }
                        throw e;
                    }
                }

                const keyContainer = buildContainer({
                    title: 'Key Criada',
                    description: 'A key foi criada com sucesso.',
                    color: 0xffffff,
                    fields: [
                        { name: 'Plano', value: `\`${planoNome}\``, inline: true },
                        { name: 'Duracao', value: `\`${dias} dias\``, inline: true },
                        { name: 'Autor', value: `\`${interaction.user.tag}\``, inline: true },
                        { name: 'Key', value: `\`${key}\``, inline: false }
                    ],
                    thumbnail: interaction.guild?.iconURL() ?? null,
                    footer: { text: 'NEW BYPASS' },
                    timestamp: true
                });

                await interaction.editReply(buildPayload({ container: keyContainer, ephemeral: true }));

                if (enviarLog) {
                    enviarLog(
                        client,
                        'NOVA KEY GERADA',
                        `**Autor:** ${interaction.user.tag}\n**Plano:** ${planoNome}\n**Dias:** ${dias}\n**Key:** ${key}`,
                        0xffffff
                    );
                }

                if (interaction.channel) {
                    await interaction.channel.send(buildPayload({ container: keyContainer }));
                    await interaction.channel.send(key);
                }
            } catch (error) {
                await interaction.editReply(buildPayload({
                    container: buildContainer({ description: 'Erro ao criar a key.', color: 0xffffff }),
                    ephemeral: true
                }));
            }
        }
    }
};
