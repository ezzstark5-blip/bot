const { buildContainer, buildPayload } = require('../utils/componentsV2');

function registerInteractionHandlers({
    client,
    dbMySQL,
    CONFIG,
    registrarLog,
    enviarLog,
    vendasHandlers,
    registroHandlers
}) {
    client.on('interactionCreate', async (interaction) => {
        try {
            if (registroHandlers.isRegistroInteraction(interaction)) {
                await registroHandlers.execute(interaction, client, dbMySQL, enviarLog);
                return;
            }

            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (command) {
                    await command.execute(interaction, client, dbMySQL, { CONFIG, registrarLog });
                }
                return;
            }

            if (interaction.isButton()) {
                await vendasHandlers.handleButtonInteraction(interaction);
                return;
            }

            if (interaction.isStringSelectMenu()) {
                await vendasHandlers.handleSelectMenuInteraction(interaction);
                return;
            }

            if (interaction.isModalSubmit()) {
                await vendasHandlers.handleModalInteraction(interaction);
                return;
            }
        } catch (error) {
            console.error('❌ Erro interação:', error);
            const msg = buildPayload({
                container: buildContainer({
                    title: '❌ Erro',
                    description: '❌ Erro ao processar sua solicitação!',
                    color: 0xffffff
                }),
                ephemeral: true
            });
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(msg);
                } else {
                    await interaction.reply(msg);
                }
            } catch {
                // ignore
            }
        }
    });
}

module.exports = { registerInteractionHandlers };
