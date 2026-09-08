const path = require('path');
const {
  AttachmentBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  MessageFlags,
} = require('discord.js');

const BRAND = 'Self Flow';
const ACCENT = 0xffffff;
const BANNER_NAME = 'banner.jpg';
const BANNER_PATH = path.join(__dirname, '..', 'assets', 'banner.jpg');
const BTN = { BLUE: 1, GRAY: 2, GREEN: 3, RED: 4, LINK: 5 };
const { ET, titled } = require('./emojis');

function getBannerFile() {
  return new AttachmentBuilder(BANNER_PATH, { name: BANNER_NAME });
}

function createBaseContainer(bannerUrl = '') {
  const container = new ContainerBuilder();
  container.setAccentColor(ACCENT);
  if (bannerUrl) try {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl))
    );
  } catch (_) {}
  return container;
}

function addTitle(container, title) {
  container.addTextDisplayComponents(new TextDisplayBuilder({ content: `## ${titled(ET.raio, title)}` }));
  return container;
}

function addDivider(container) {
  container.addSeparatorComponents(
    new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true })
  );
  return container;
}

function addText(container, content) {
  container.addTextDisplayComponents(new TextDisplayBuilder({ content }));
  return container;
}

/** Botão secundário no padrão visual do projeto. */
function grayButton(customId, label, options = {}) {
  const btn = new ButtonBuilder()
    .setCustomId(customId)
    .setStyle(BTN.GRAY);
  if (label) btn.setLabel(String(label).slice(0, 80));
  if (options.disabled) btn.setDisabled(true);
  return btn;
}

function publicPanelPayload(container, extraRows = [], files = []) {
  return {
    components: [container.toJSON(), ...extraRows],
    files,
    flags: [MessageFlags.IsComponentsV2],
  };
}

function privatePanelPayload(container, extraRows = []) {
  return {
    components: [container.toJSON(), ...extraRows],
    flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
  };
}

module.exports = {
  BRAND,
  ACCENT,
  BTN,
  BANNER_NAME,
  BANNER_PATH,
  getBannerFile,
  createBaseContainer,
  addTitle,
  addDivider,
  addText,
  grayButton,
  publicPanelPayload,
  privatePanelPayload,
  MessageFlags,
};
