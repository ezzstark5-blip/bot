const {
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const { buildContainer, ActionRowBuilder } = require('../../utils/componentsV2');

const PRODUTO_DISPLAY = {
    'external-advanced': {
        title: 'NEW ADVANCED PC | INTERNAL',
        description:
            '⚡ **Entrega Automática!**\n\n' +
            '**Painel contém:**\n\n' +
            '• Aimbot\n' +
            '• Aimbot Key\n' +
            '• Aim Bone\n' +
            '• Aim Delay\n' +
            '• Aim Distance\n' +
            '• Ignore Bot\n' +
            '• Ignore Knocked\n\n' +
            '• Enable Esp\n' +
            '• Enable WaterMark\n' +
            '• Enable Enemies Count\n' +
            '• Enable Lines\n' +
            '• Enable Health Text\n' +
            '• Enable Health Bar\n' +
            '• Enable Box\n' +
            '• Enable Fill Color\n' +
            '• Enable Name\n' +
            '• Enable Dist\n' +
            '• Enable Skel\n' +
            '• Enable Icon Weapon\n' +
            '• Trickness\n' +
            '• Distance',
        image: 'https://i.imgur.com/t7ttTSo.png'
    },
    'external-premium': {
        title: 'NEW EXTERNAL PREMIUM',
        description:
            '⚡ **Entrega Automática!**\n\n' +
            '**Recursos External Premium:**\n\n' +
            '• Aimbot Externo Premium (Memory Based)\n' +
            '• ESP Overlay Premium (Box, Name, Distance)\n' +
            '• Triggerbot Configurável\n' +
            '• Recoil Control System Advanced\n' +
            '• Radar 2D/3D\n' +
            '• Configurações Personalizáveis\n' +
            '• Glow ESP\n' +
            '• Chams External\n' +
            '• FOV Circle\n' +
            '• Crosshair Customizado\n' +
            '• Head Hitbox\n' +
            '• Smoothing Avançado\n' +
            '• Prediction System\n' +
            '• Anti-Screenshot\n' +
            '• Stream Safe Mode',
        image: 'https://i.imgur.com/cLlv8O8.png'
    },
    'internal-advanced': {
        title: 'NEW INTERNAL ADVANCED',
        description:
            '⚡ **Entrega Automática!**\n\n' +
            '**Painel contém:**\n\n' +
            '• Aimbot\n' +
            '• Aimbot Key\n' +
            '• Aim Bone\n' +
            '• Aim Delay\n' +
            '• Aim Distance\n' +
            '• Ignore Bot\n' +
            '• Ignore Knocked\n\n' +
            '• Enable Esp\n' +
            '• Enable WaterMark\n' +
            '• Enable Enemies Count\n' +
            '• Enable Lines\n' +
            '• Enable Health Text\n' +
            '• Enable Health Bar\n' +
            '• Enable Box\n' +
            '• Enable Fill Color\n' +
            '• Enable Name\n' +
            '• Enable Dist\n' +
            '• Enable Skel\n' +
            '• Enable Icon Weapon\n' +
            '• Trickness\n' +
            '• Distance',
        image: 'https://i.imgur.com/4DkYaqf.png'
    },
    'internal-premium': {
        title: 'NEW INTERNAL PREMIUM',
        description:
            '⚡ **Entrega Automática!**\n\n' +
            '**Painel contém:**\n\n' +
            '• Aimbot Premium\n' +
            '• Aimbot Key\n' +
            '• Aim Bone Avançado\n' +
            '• Aim Delay Customizável\n' +
            '• Aim Distance\n' +
            '• Ignore Bot\n' +
            '• Ignore Knocked\n' +
            '• Silent Aim\n\n' +
            '• Enable Esp Premium\n' +
            '• Enable WaterMark\n' +
            '• Enable Enemies Count\n' +
            '• Enable Lines\n' +
            '• Enable Health Text\n' +
            '• Enable Health Bar\n' +
            '• Enable Box 3D\n' +
            '• Enable Fill Color\n' +
            '• Enable Name\n' +
            '• Enable Distance\n' +
            '• Enable Skeleton\n' +
            '• Enable Icon Weapon\n' +
            '• Chams\n' +
            '• Glow ESP',
        image: 'https://i.imgur.com/e8U6beb.png'
    }
};

function getProdutoDisplay(prod) {
    const display = PRODUTO_DISPLAY[prod.slug];

    if (display) {
        return display;
    }

    return {
        title: prod.nome || 'Produto',
        description: prod.descricao || '⚡ **Entrega Automática!**',
        image: prod.imagem_url || null
    };
}

function buildErroContainer(client, title, description) {
    return buildContainer({
        title,
        description,
        color: 0xFF0000,
        thumbnail: client.user.displayAvatarURL()
    });
}

function buildProdutoVendaContainer(client, prod, actionRows = []) {
    const display = getProdutoDisplay(prod);

    return buildContainer({
        title: display.title,
        description: display.description,
        color: 0xffffff,
        image: display.image,
        thumbnail: client.user.displayAvatarURL(),
        actionRows
    });
}

function buildVerOpcoesButton(prod) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ver_opcoes_${prod.id}`)
            .setLabel('Clique aqui para ver as opções')
            .setStyle(ButtonStyle.Primary)
    );
}

function buildPlanoSelectMenu(prod) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`selecionar_plano_${prod.id}`)
            .setPlaceholder('📋 Clique aqui para ver as opções')
            .addOptions([
                {
                    label: 'Login Diário',
                    value: 'diario',
                    description: `Preço: R$ ${prod.preco_diario} | Estoque: ${prod.estoque_diario}`,
                    emoji: '🛒'
                },
                {
                    label: 'Login Semanal',
                    value: 'semanal',
                    description: `Preço: R$ ${prod.preco_semanal} | Estoque: ${prod.estoque_semanal}`,
                    emoji: '🛒'
                },
                {
                    label: 'Login Mensal',
                    value: 'mensal',
                    description: `Preço: R$ ${prod.preco_mensal} | Estoque: ${prod.estoque_mensal}`,
                    emoji: '🛒'
                },
                {
                    label: 'Login Permanente',
                    value: 'permanente',
                    description: `Preço: R$ ${prod.preco_permanente} | Estoque: ${prod.estoque_permanente}`,
                    emoji: '🛒'
                }
            ])
    );
}

module.exports = {
    buildErroContainer,
    buildProdutoVendaContainer,
    buildVerOpcoesButton,
    buildPlanoSelectMenu
};
