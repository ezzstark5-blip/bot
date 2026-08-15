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

async function registerAllFromDisk() {
    require('dotenv').config();

    const { Collection } = require('discord.js');
    const { loadCommands } = require('./loadCommands');

    const client = { commands: new Collection() };
    loadCommands(client);

    const names = [...client.commands.keys()];
    console.log(`Registrando ${names.length} comando(s)...`);
    console.log(names.map((name) => `  - /${name}`).join('\n'));

    await registerSlashCommands(client);
}

if (require.main === module) {
    registerAllFromDisk()
        .then(() => setTimeout(() => process.exit(0), 250))
        .catch((error) => {
            console.error('Erro ao registrar comandos:', error.message || error);
            setTimeout(() => process.exit(1), 250);
        });
}

module.exports = { registerSlashCommands, registerAllFromDisk };
