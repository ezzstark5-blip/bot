const { ActivityType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');

function configurarPresenca(client, CONFIG) {
    client.user.setPresence({
        activities: [{
            name: CONFIG.BOT_STATUS,
            type: ActivityType.Streaming,
            url: CONFIG.TWITCH_URL
        }],
        status: 'online'
    });
}

async function entrarCanalVoz(client, CONFIG) {
    const channelId = CONFIG.VOICE_CHANNEL_ID;
    if (!channelId) {
        return;
    }

    try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || !channel.isVoiceBased()) {
            console.error('Canal de voz invalido:', channelId);
            return;
        }

        const existente = getVoiceConnection(channel.guild.id);
        if (existente) {
            existente.destroy();
        }

        joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false
        });

        console.log('Bot entrou no canal de voz:', channel.name);
    } catch (error) {
        console.error('Erro ao entrar no canal de voz:', error.message);
    }
}

async function iniciarPresencaEBotVoice(client, CONFIG) {
    configurarPresenca(client, CONFIG);
    await entrarCanalVoz(client, CONFIG);
}

module.exports = { configurarPresenca, entrarCanalVoz, iniciarPresencaEBotVoice };