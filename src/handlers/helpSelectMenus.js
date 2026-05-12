import { createEmbed } from '../utils/embeds.js';
import { createButton, getPaginationRow, createSelectMenu } from '../utils/components.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Collection, ActionRowBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Split Custom IDs so Admin and Normal menus NEVER cross paths
const NORMAL_IDS = { select: 'help-category-select', all: 'help-all-commands', back: 'help-back-to-main', page: 'help-page' };
const ADMIN_IDS = { select: 'adminhelp-category-select', all: 'adminhelp-all-commands', back: 'adminhelp-back-to-main', page: 'adminhelp-page' };

const SAFE_CATEGORIES = ["Core", "Economy", "Fun", "Leveling", "Utility", "Ticket", "Tools", "Search", "Community", "Birthday"];
const FOOTER_TEXT = "Made with ❤️";

const CATEGORY_ICONS = {
    Core: "ℹ️", Moderation: "🛡️", Economy: "💰", Fun: "🎮", Leveling: "📊",
    Utility: "🔧", Ticket: "🎫", Welcome: "👋", Giveaway: "🎉", Counter: "🔢",
    Tools: "🛠️", Search: "🔍", Reaction_Roles: "🎭", Community: "👥", Birthday: "🎂", Config: "⚙️"
};

function normalizeCommandData(command) {
    const rawData = command?.data;
    if (!rawData) return null;
    const jsonData = typeof rawData.toJSON === 'function' ? rawData.toJSON() : rawData;
    if (!jsonData?.name) return null;
    return {
        ...jsonData,
        options: Array.isArray(jsonData.options) ? jsonData.options.map((opt) => typeof opt?.toJSON === 'function' ? opt.toJSON() : opt) : [],
    };
}

function buildHelpEntries(command, category, isAdminMenu) {
    const commandData = normalizeCommandData(command);
    if (!commandData?.name) return [];

    // Filter out top-level Admin commands from Community Menu
    const isTopLevelAdmin = String(commandData.default_member_permissions) === String(PermissionFlagsBits.Administrator) || String(commandData.default_member_permissions) === "8";
    if (!isAdminMenu && isTopLevelAdmin) return [];

    const baseName = commandData.name;
    const baseDescription = commandData.description || "No description";
    const options = commandData.options || [];
    const entries = [];

    for (const option of options) {
        if (!option) continue;
        if (option.type === 1 || option.type === 2) {
            const displayName = option.type === 1 ? `${baseName} ${option.name}` : `${baseName} ${option.name} ${option.options?.[0]?.name || ''}`;
            const desc = option.description || baseDescription;

            // 🚨 THE BOUNCER: Rip out admin subcommands from the community menu
            if (!isAdminMenu) {
                const lowerName = displayName.toLowerCase();
                const lowerDesc = desc.toLowerCase();
                if (lowerDesc.includes("admin only") || lowerName.includes("config") || lowerName === "roulette start") {
                    continue; 
                }
            }
            entries.push({ baseName, displayName: displayName.trim(), description: desc, category });
        }
    }

    if (entries.length === 0 && options.length === 0) {
        entries.push({ baseName, displayName: baseName, description: baseDescription, category });
    }
    return entries;
}

export async function createInitialHelpMenu(client, isAdminMenu) {
    const IDs = isAdminMenu ? ADMIN_IDS : NORMAL_IDS;
    const commandsPath = path.join(__dirname, "../commands");
    
    const allDirs = (await fs.readdir(commandsPath, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
    const visibleCategories = isAdminMenu ? allDirs : allDirs.filter(cat => SAFE_CATEGORIES.includes(cat));

    const title = isAdminMenu ? `🛠️ Admin Control Panel` : `🤖 Community Help Center`;
    const embed = createEmbed({ title, description: "Select a category below to explore commands.", color: isAdminMenu ? 'error' : 'primary' });

    visibleCategories.forEach(category => {
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        embed.addFields({ name: `${CATEGORY_ICONS[categoryName] || "📁"} **${categoryName}**`, value: `View ${categoryName} commands`, inline: true });
    });

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    const options = [
        { label: "📋 All Commands", description: "View all commands with pagination", value: IDs.all },
        ...visibleCategories.map(category => {
            const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
            return { label: `${CATEGORY_ICONS[categoryName] || "📁"} ${categoryName}`, description: `View commands in ${categoryName}`, value: category };
        })
    ];

    const selectRow = createSelectMenu(IDs.select, "Select to view the commands", options);
    return { embeds: [embed], components: [selectRow] };
}

export async function createCategoryCommandsMenu(category, client, isAdminMenu) {
    const IDs = isAdminMenu ? ADMIN_IDS : NORMAL_IDS;
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
    const icon = CATEGORY_ICONS[categoryName] || "🔍";
    const categoryCommands = [];

    try {
        const categoryPath = path.join(__dirname, "../commands", category);
        const commandFiles = (await fs.readdir(categoryPath)).filter(f => f.endsWith(".js")).sort();

        for (const file of commandFiles) {
            const commandData = normalizeCommandData((await import(`file://${path.join(categoryPath, file)}`)).default);
            if (commandData && commandData.name !== "help" && commandData.name !== "adminhelp" && commandData.name !== "commandlist") {
                categoryCommands.push(...buildHelpEntries((await import(`file://${path.join(categoryPath, file)}`)).default, categoryName, isAdminMenu));
            }
        }
    } catch (error) { logger.error(`Error reading ${category}:`, error); }

    categoryCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));

    let registeredCommands = new Collection();
    if (client?.application?.commands?.fetch) {
        try { const cmds = await client.application.commands.fetch(); cmds.forEach(c => registeredCommands.set(c.name, c)); } catch (e) {}
    }

    const embed = createEmbed({ title: `${icon} ${categoryName} Commands`, description: categoryCommands.length > 0 ? "Click any command mention below to use it:" : "No commands found." });

    if (categoryCommands.length > 0) {
        const commandMentions = categoryCommands.map(cmd => {
            const regCmd = registeredCommands.get(cmd.baseName);
            return regCmd && regCmd.id ? `</${cmd.displayName}:${regCmd.id}> · ${cmd.description}` : `\`/${cmd.displayName}\` · ${cmd.description}`;
        }).join("\n");

        if (commandMentions.length <= 1000) embed.addFields({ name: "Commands", value: commandMentions, inline: false });
        else {
            let chunks = [], curr = "";
            commandMentions.split("\n").forEach(line => {
                if ((curr + "\n" + line).length > 1000) { chunks.push(curr); curr = line; } else curr += (curr ? "\n" : "") + line;
            });
            if (curr) chunks.push(curr);
            chunks.forEach((chunk, i) => embed.addFields({ name: `Commands (Part ${i + 1})`, value: chunk, inline: false }));
        }
    }

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(createButton(IDs.back, "Back", "primary", "⬅️", false))] };
}

export async function createAllCommandsMenu(page = 1, client, isAdminMenu) {
    const IDs = isAdminMenu ? ADMIN_IDS : NORMAL_IDS;
    const allCommands = [];

    const categoryDirs = (await fs.readdir(path.join(__dirname, "../commands"), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
    const visibleDirs = isAdminMenu ? categoryDirs : categoryDirs.filter(cat => SAFE_CATEGORIES.includes(cat));

    for (const category of visibleDirs) {
        try {
            const categoryPath = path.join(__dirname, "../commands", category);
            const commandFiles = (await fs.readdir(categoryPath)).filter(f => f.endsWith(".js"));
            for (const file of commandFiles) {
                const cmd = (await import(`file://${path.join(categoryPath, file)}`)).default;
                const cmdData = normalizeCommandData(cmd);
                if (cmdData && cmdData.name !== "help" && cmdData.name !== "adminhelp" && cmdData.name !== "commandlist") {
                    allCommands.push(...buildHelpEntries(cmd, category, isAdminMenu));
                }
            }
        } catch (e) {}
    }

    allCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    let registeredCommands = new Collection();
    if (client?.application?.commands?.fetch) {
        try { const cmds = await client.application.commands.fetch(); cmds.forEach(c => registeredCommands.set(c.name, c)); } catch (e) {}
    }

    const totalPages = Math.ceil(allCommands.length / 45) || 1;
    const pageCommands = allCommands.slice((page - 1) * 45, ((page - 1) * 45) + 45);

    const embed = createEmbed({ title: "📋 All Commands", description: `(${allCommands.length} total commands available to you)` });
    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    if (pageCommands.length > 0) {
        const mentions = pageCommands.map(cmd => {
            const regCmd = registeredCommands.get(cmd.baseName);
            return regCmd && regCmd.id ? `</${cmd.displayName}:${regCmd.id}>` : `\`/${cmd.displayName}\``;
        });
        const colCount = pageCommands.length > 20 ? 3 : (pageCommands.length > 10 ? 2 : 1);
        const chunkSize = Math.ceil(mentions.length / colCount);
        for (let i = 0; i < colCount; i++) {
            const chunk = mentions.slice(i * chunkSize, (i + 1) * chunkSize).join("\n");
            if (chunk) embed.addFields({ name: i === 0 ? `Commands (Pg ${page})` : "Commands (cont.)", value: chunk, inline: colCount > 1 });
        }
    }

    const components = [];
    if (totalPages > 1) components.push(getPaginationRow(IDs.page, page, totalPages));
    components.push(new ActionRowBuilder().addComponents(createButton(IDs.back, "Back", "primary", "⬅️", false)));

    return { embeds: [embed], components, currentPage: page, totalPages };
}

export const helpCategorySelectMenu = {
    name: NORMAL_IDS.select,
    async execute(interaction, client) {
        await interaction.deferUpdate();
        const val = interaction.values[0];
        const data = val === NORMAL_IDS.all ? await createAllCommandsMenu(1, client, false) : await createCategoryCommandsMenu(val, client, false);
        await interaction.editReply({ embeds: data.embeds, components: data.components });
    }
};

export const adminHelpCategorySelectMenu = {
    name: ADMIN_IDS.select,
    async execute(interaction, client) {
        await interaction.deferUpdate();
        const val = interaction.values[0];
        const data = val === ADMIN_IDS.all ? await createAllCommandsMenu(1, client, true) : await createCategoryCommandsMenu(val, client, true);
        await interaction.editReply({ embeds: data.embeds, components: data.components });
    }
};
