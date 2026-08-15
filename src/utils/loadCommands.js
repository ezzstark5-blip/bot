const fsSync = require('fs');
const path = require('path');

function loadCommands(client) {
    const commandsPath = path.join(__dirname, '..', 'commands');

    if (!fsSync.existsSync(commandsPath)) {
        return;
    }

    const commandFiles = fsSync.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
        try {
            const command = require(path.join(commandsPath, file));
            if (command.data && command.execute) {
                client.commands.set(command.data.name, command);
                console.log(`Comando carregado: ${command.data.name}`);
            }
        } catch (error) {
            console.error(`Erro ao carregar comando ${file}:`, error.message);
        }
    }
}

module.exports = { loadCommands };
