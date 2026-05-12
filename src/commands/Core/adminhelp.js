import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createInitialHelpMenu } from '../../handlers/helpSelectMenus.js';
import { createEmbed } from "../../utils/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("adminhelp")
        .setDescription("Displays the Admin-only Server Control help menu")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Completely hides command from normal players

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);
        
        // The "true" flag tells the system to load absolutely EVERYTHING
        const { embeds, components } = await createInitialHelpMenu(client, true);
        await InteractionHelper.safeEditReply(interaction, { embeds, components });

        setTimeout(async () => {
            try {
                const closedEmbed = createEmbed({
                    title: "Admin menu closed",
                    description: "Admin menu closed due to inactivity. Use `/adminhelp` again.",
                    color: "secondary",
                });
                await InteractionHelper.safeEditReply(interaction, { embeds: [closedEmbed], components: [] });
            } catch (error) {}
        }, 5 * 60 * 1000);
    },
};
