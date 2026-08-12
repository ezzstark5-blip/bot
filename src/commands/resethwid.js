const { SlashCommandBuilder } = require('discord.js');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resethwid')
        .setDescription('Reseta o HWID vinculado a sua licenca')
        .addStringOption((option) =>
            option.setName('key').setDescription('Sua key de licenca').setRequired(true)
        ),
    async execute(interaction, client, dbMySQL, ctx) {
        const CONFIG = ctx?.CONFIG || { COR_EMBED_ERRO: 0xffffff, COR_EMBED_SUCESSO: 0xffffff, COR_EMBED_AVISO: 0xffffff, COOLDOWN_RESET_HWID_DIAS: 7 };
        const registrarLog = ctx?.registrarLog || (() => {});

        await interaction.deferReply({ ephemeral: true });

        const key = interaction.options.getString('key').trim().toUpperCase();
        const userId = interaction.user.id;

        try {
            const [vendas] = await dbMySQL.query(
                `
                SELECT v.id, v.pedido_id, v.\`keys\`, v.ultimo_reset_hwid, p.nome as produto_nome
                FROM vendas v
                JOIN produtos p ON v.produto_id = p.id
                WHERE v.user_id = ?
                ORDER BY v.created_at DESC
            `,
                [userId]
            );

            if (vendas.length === 0) {
                return interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: 'Nenhuma Compra Encontrada',
                        description: 'Voce nao possui nenhuma compra registrada.',
                        color: CONFIG.COR_EMBED_ERRO,
                        timestamp: true
                    }),
                    ephemeral: true
                }));
            }

            let vendaEncontrada = null;

            for (const venda of vendas) {
                const keys = JSON.parse(venda.keys);
                if (keys.includes(key)) {
                    vendaEncontrada = venda;
                    break;
                }
            }

            if (!vendaEncontrada) {
                return interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: 'Key Nao Encontrada',
                        description: 'A key informada nao foi encontrada em suas compras.',
                        color: CONFIG.COR_EMBED_ERRO,
                        timestamp: true
                    }),
                    ephemeral: true
                }));
            }

            if (vendaEncontrada.ultimo_reset_hwid) {
                const ultimoReset = new Date(vendaEncontrada.ultimo_reset_hwid);
                const agora = new Date();
                const diferencaDias = Math.floor((agora - ultimoReset) / (1000 * 60 * 60 * 24));

                if (diferencaDias < CONFIG.COOLDOWN_RESET_HWID_DIAS) {
                    const diasRestantes = CONFIG.COOLDOWN_RESET_HWID_DIAS - diferencaDias;

                    return interaction.editReply(buildPayload({
                        container: buildContainer({
                            title: 'Cooldown Ativo',
                            description: `Voce precisa aguardar **${diasRestantes} dia(s)** para resetar o HWID novamente.`,
                            color: CONFIG.COR_EMBED_AVISO,
                            timestamp: true
                        }),
                        ephemeral: true
                    }));
                }
            }

            const connection = await dbMySQL.getConnection();
            try {
                await connection.beginTransaction();
                await connection.query('UPDATE vendas SET ultimo_reset_hwid = NOW() WHERE id = ?', [vendaEncontrada.id]);
                await connection.query('DELETE FROM hwid_vinculados WHERE license_key = ?', [key]);
                await connection.commit();

                registrarLog('HWID_RESET', {
                    user: interaction.user.tag,
                    userId,
                    key,
                    produto: vendaEncontrada.produto_nome
                });

                await interaction.editReply(buildPayload({
                    container: buildContainer({
                        title: 'HWID Resetado com Sucesso',
                        description: `Sua licenca para **${vendaEncontrada.produto_nome}** foi liberada.`,
                        fields: [{ name: 'Key', value: `\`${key}\``, inline: false }],
                        color: CONFIG.COR_EMBED_SUCESSO,
                        timestamp: true
                    }),
                    ephemeral: true
                }));
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('Erro resethwid:', error);
            await interaction.editReply(buildPayload({
                container: buildContainer({
                    title: 'Erro Interno',
                    description: 'Ocorreu um erro ao processar sua solicitacao.',
                    color: CONFIG.COR_EMBED_ERRO,
                    timestamp: true
                }),
                ephemeral: true
            }));
        }
    }
};
