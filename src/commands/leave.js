const { getVoiceConnection } = require('@discordjs/voice');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    name: 'leave',
    async execute(message, args, client) {
        const connection = getVoiceConnection(message.guild.id);

        if (!connection) {
            return message.reply(buildPayload({
                container: buildContainer({
                    description: 'Eu nao estou em nenhum canal de voz neste servidor!',
                    color: 0xffffff
                })
            }));
        }

        try {
            connection.destroy();
            return message.reply(buildPayload({
                container: buildContainer({
                    description: 'Sai da call com sucesso!',
                    color: 0xffffff
                })
            }));
        } catch (error) {
            console.error('Erro ao sair da call:', error);
            return message.reply(buildPayload({
                container: buildContainer({
                    description: 'Ocorreu um erro ao tentar sair do canal de voz.',
                    color: 0xffffff
                })
            }));
        }
    }
};
