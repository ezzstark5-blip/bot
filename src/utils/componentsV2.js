const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    FileBuilder,
    ActionRowBuilder,
    MessageFlags
} = require('discord.js');

const V2_FLAG = MessageFlags.IsComponentsV2;

function truncate(text, max = 4000) {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatEmbedContent({ title, description, fields, footer, timestamp, url }) {
    const lines = [];

    if (title) {
        lines.push(url ? `# [${title}](${url})` : `# ${title}`);
    }

    if (description) {
        lines.push(description);
    }

    if (fields?.length) {
        for (const field of fields) {
            if (field.name && field.value) {
                lines.push(`**${field.name}**\n${field.value}`);
            }
        }
    }

    return truncate(lines.join('\n\n'));
}

const HOOKTRICK_BANNER_URL = 'https://api.purincash.com/uploads/embed/696bdd6fad083adf.png';

function resolveMediaUrl(url) {
    if (!url) {
        return null;
    }

    const value = String(url);
    if (value.includes('hooktrick-banner.png')) {
        return HOOKTRICK_BANNER_URL;
    }

    if (value.startsWith('attachment://') || value.startsWith('https://') || value.startsWith('http://')) {
        return value;
    }

    return null;
}

function buildContainer(options = {}) {
    const {
        title,
        description,
        fields,
        footer,
        timestamp,
        url,
        color = 0xffffff,
        thumbnail: _thumbnail,
        image,
        actionRows = [],
        separators = false
    } = options;

    const container = new ContainerBuilder().setAccentColor(color ?? 0xffffff);
    const content = formatEmbedContent({ title, description, fields, footer, timestamp, url });
    const thumbnail = null;
    const resolvedImage = resolveMediaUrl(image);

    if (thumbnail) {
        const section = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content || ' ')
        );
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
        container.addSectionComponents(section);
    } else if (content) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    }

    if (resolvedImage) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(resolvedImage))
        );
    }

    if (separators) {
        container.addSeparatorComponents(new SeparatorBuilder());
    }

    for (const row of actionRows) {
        if (row) {
            container.addActionRowComponents(row);
        }
    }

    return container;
}

function fromEmbed(embed, actionRows = []) {
    const data = embed?.data ?? embed ?? {};

    return buildContainer({
        title: data.title,
        description: data.description,
        fields: data.fields,
        footer: data.footer,
        timestamp: data.timestamp,
        url: data.url,
        color: data.color ?? 0xffffff,
        thumbnail: data.thumbnail?.url,
        image: data.image?.url,
        actionRows
    });
}

function buildPayload(options = {}) {
    const {
        container,
        containers,
        files,
        ephemeral = false,
        flags = 0,
        attachmentName
    } = options;

    const list = containers ?? (container ? [container] : []);
    let messageFlags = V2_FLAG | flags;

    if (ephemeral) {
        messageFlags |= MessageFlags.Ephemeral;
    }

    const payload = {
        components: list,
        flags: messageFlags
    };

    if (files?.length) {
        payload.files = files;

        if (attachmentName && list[0] instanceof ContainerBuilder) {
            list[0].addFileComponents(new FileBuilder().setURL(`attachment://${attachmentName}`));
        }
    }

    return payload;
}

function serializeComponents(components) {
    return (components ?? []).map((component) =>
        typeof component.toJSON === 'function' ? component.toJSON() : component
    );
}

function buildWebhookPayload(options = {}) {
    const { username, avatar_url, ...payloadOptions } = options;
    const payload = buildPayload(payloadOptions);

    const body = {
        flags: payload.flags,
        components: serializeComponents(payload.components)
    };

    if (username) {
        body.username = username;
    }

    return body;
}

function replyOptions(options = {}) {
    return buildPayload(options);
}

function withV2Flags(existingFlags = 0, ephemeral = false) {
    let flags = V2_FLAG | existingFlags;
    if (ephemeral) {
        flags |= MessageFlags.Ephemeral;
    }
    return flags;
}

module.exports = {
    V2_FLAG,
    truncate,
    formatEmbedContent,
    buildContainer,
    fromEmbed,
    buildPayload,
    buildWebhookPayload,
    serializeComponents,
    replyOptions,
    withV2Flags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    FileBuilder,
    ActionRowBuilder,
    MessageFlags
};
