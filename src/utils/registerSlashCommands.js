const { REST, Routes } = require('discord.js');

async function registerSlashCommands(client) {
    const commands = [...client.commands.values()].map((command) => command.data.toJSON());

    if (commands.length === 0) {
        console.log('Nenhum slash command para registrar.');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    if (process.env.GUILD_ID) {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log(`${commands.length} slash commands registrados no servidor ${process.env.GUILD_ID}.`);
        return;
    }

    await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
    );
    console.log(`${commands.length} slash commands registrados globalmente.`);
}

module.exports = { registerSlashCommands };
