const { joinVoiceChannel } = require('@discordjs/voice');
const { buildContainer, buildPayload } = require('../utils/componentsV2');

module.exports = {
    name: 'join',
    async execute(message, args, client) {
        const voiceChannel = message.member.voice.channel;

        if (!voiceChannel) {
            return message.reply(buildPayload({
                container: buildContainer({
                    description: 'Voce precisa entrar em um canal de voz primeiro!',
                    color: 0xffffff
                })
            }));
        }

        try {
            joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
                selfDeaf: true
            });

            return message.reply(buildPayload({
                container: buildContainer({
                    description: `Conectado com sucesso em: **${voiceChannel.name}**`,
                    color: 0xffffff
                })
            }));
        } catch (error) {
            console.error('Erro ao entrar na call:', error);
            return message.reply(buildPayload({
                container: buildContainer({
                    description: 'Houve um erro ao tentar entrar no canal de voz.',
                    color: 0xffffff
                })
            }));
        }
    }
};
