import { createEmbed } from '../utils/embeds.js';
import { createInitialHelpMenu, createAllCommandsMenu } from './helpSelectMenus.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';

function getPaginationInfo(components, prefix) {
    for (const row of components || []) {
        for (const component of row.components || []) {
            if (component.customId === `${prefix}_page`) {
                const match = (component.label || '').match(/Page\s+(\d+)\s+of\s+(\d+)/i);
                if (match) return { currentPage: Number(match[1]), totalPages: Number(match[2]) };
            }
        }
    }
    return { currentPage: 1, totalPages: 1 };
}

async function handlePagination(interaction, client, isAdminMenu) {
    try {
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
        
        const prefix = isAdminMenu ? 'adminhelp-page' : 'help-page';
        const { currentPage, totalPages } = getPaginationInfo(interaction.message?.components, prefix);
        
        let nextPage = currentPage;
        if (interaction.customId.includes('_first')) nextPage = 1;
        else if (interaction.customId.includes('_prev')) nextPage = Math.max(1, currentPage - 1);
        else if (interaction.customId.includes('_next')) nextPage = Math.min(totalPages, currentPage + 1);
        else if (interaction.customId.includes('_last')) nextPage = totalPages;

        const data = await createAllCommandsMenu(nextPage, client, isAdminMenu);
        await interaction.editReply({ embeds: data.embeds, components: data.components });
    } catch (error) {
        if (error?.code === 40060 || error?.code === 10062) return;
        throw error;
    }
}

// ---- NORMAL HELP BUTTONS ----
export const helpBackButton = {
    name: "help-back-to-main",
    async execute(interaction, client) {
        await interaction.deferUpdate();
        await interaction.editReply(await createInitialHelpMenu(client, false));
    }
};
export const helpPaginationButton = {
    name: "help-page_next", // Base name for the interaction handler to grab
    async execute(interaction, client) { await handlePagination(interaction, client, false); }
};

// ---- ADMIN HELP BUTTONS ----
export const adminHelpBackButton = {
    name: "adminhelp-back-to-main",
    async execute(interaction, client) {
        await interaction.deferUpdate();
        await interaction.editReply(await createInitialHelpMenu(client, true));
    }
};
export const adminHelpPaginationButton = {
    name: "adminhelp-page_next",
    async execute(interaction, client) { await handlePagination(interaction, client, true); }
};

// ---- BUG REPORT ----
export const helpBugReportButton = {
    name: "help-bug-report",
    async execute(interaction, client) {
        const githubButton = new ButtonBuilder().setLabel('🐛 Report Bug on GitHub').setStyle(ButtonStyle.Link).setURL('https://github.com/codebymitch/TitanBot/issues');
        const bugReportEmbed = createEmbed({
            title: '🐛 Bug Report',
            description: 'Found a bug? Please report it on our GitHub Issues page!\n\n**When reporting a bug, please include:**\n• 📝 Detailed description of the issue\n• 📋 Steps to reproduce the problem\n• 📸 Screenshots if applicable\n• 💻 Your bot version and environment',
            color: 'error'
        });
        bugReportEmbed.setFooter({ text: 'TitanBot Bug Reporting System', iconURL: client.user.displayAvatarURL() });
        await interaction.reply({ embeds: [bugReportEmbed], components: [new ActionRowBuilder().addComponents(githubButton)], flags: MessageFlags.Ephemeral });
    }
};

export const helpReportCommand = { name: "help-command-list", categoryName: null, async execute(interaction, client) {} };
