import {
    SlashCommandBuilder,
    ActionRowBuilder,
    PermissionFlagsBits
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import { createSelectMenu } from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

// Centralized category data. Set adminOnly: true to hide from normal players!
const CATEGORY_DATA = {
    Core: { icon: "ℹ️", desc: "Essential bot commands and info", adminOnly: false },
    Moderation: { icon: "🛡️", desc: "Server moderation and user management", adminOnly: true },
    Economy: { icon: "💰", desc: "Currency system, shops, and gambling", adminOnly: false },
    Fun: { icon: "🎮", desc: "Games, entertainment, and interactions", adminOnly: false },
    Leveling: { icon: "📊", desc: "User levels, XP, and progression", adminOnly: false },
    Utility: { icon: "🔧", desc: "Useful tools and server utilities", adminOnly: false },
    Ticket: { icon: "🎫", desc: "Support ticket system", adminOnly: false },
    Welcome: { icon: "👋", desc: "Member welcome messages", adminOnly: true },
    Giveaway: { icon: "🎉", desc: "Giveaway management", adminOnly: true },
    Counter: { icon: "🔢", desc: "Live counter channels", adminOnly: true },
    Tools: { icon: "🛠️", desc: "Advanced server tools", adminOnly: false },
    Search: { icon: "🔍", desc: "Search the web or discord", adminOnly: false },
    Reaction_Roles: { icon: "🎭", desc: "Self-assignable role menus", adminOnly: true },
    Community: { icon: "👥", desc: "Community tools and engagement", adminOnly: false },
    Birthday: { icon: "🎂", desc: "Birthday tracking and celebrations", adminOnly: false },
    Config: { icon: "⚙️", desc: "Server and bot configuration", adminOnly: true },
};

export async function createInitialHelpMenu(client, member) {
    const commandsPath = path.join(__dirname, "../../commands");
    
    // Check if the user is an Admin or Server Manager
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || 
                    member.permissions.has(PermissionFlagsBits.ManageGuild);

    // Read directories
    const allDirs = (await fs.readdir(commandsPath, { withFileTypes: true }))
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    // Filter categories based on permissions
    const visibleCategories = allDirs.filter((category) => {
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        const data = CATEGORY_DATA[categoryName];
        
        // If the category is marked adminOnly and the user IS NOT an admin, hide it.
        if (data?.adminOnly && !isAdmin) return false;
        return true;
    });

    const botName = client?.user?.username || "Bot";
    const embed = createEmbed({ 
        title: `🤖 ${botName} Help Center`,
        description: "Select a category below to explore available commands.",
        color: 'primary'
    });

    // Dynamically build the embed fields based on what the user is allowed to see
    visibleCategories.forEach(category => {
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        const data = CATEGORY_DATA[categoryName] || { icon: "📁", desc: "Miscellaneous commands" };
        
        embed.addFields({
            name: `${data.icon} **${categoryName}**`,
            value: data.desc,
            inline: true
        });
    });

    embed.setFooter({ text: "Made For Community" });
    embed.setTimestamp();

    // Dynamically build the dropdown menu
    const options = [
        {
            label: "📋 All Commands",
            description: "View all available commands with pagination",
            value: ALL_COMMANDS_ID,
        },
        ...visibleCategories.map((category) => {
            const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
            const data = CATEGORY_DATA[categoryName] || { icon: "📁" };
            return {
                label: `${data.icon} ${categoryName}`,
                description: `View commands in the ${categoryName} category`,
                value: category,
            };
        }),
    ];

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Select to view the commands",
        options,
    );

    // Buttons are removed. Returning only the dropdown menu.
    return {
        embeds: [embed],
        components: [selectRow],
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays the help menu with available commands"),

    async execute(interaction, guildConfig, client) {
        
        await InteractionHelper.safeDefer(interaction);
        
        // Pass the interaction.member so the menu knows if they are an Admin!
        const { embeds, components } = await createInitialHelpMenu(client, interaction.member);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        // Time out the menu after 5 minutes to prevent old interactions from crashing
        setTimeout(async () => {
            try {
                const closedEmbed = createEmbed({
                    title: "Help menu closed",
                    description: "Help menu has been closed due to inactivity. Use `/help` again.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                // Ignore errors if the message was already deleted
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};
