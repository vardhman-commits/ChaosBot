import { SlashCommandBuilder } from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createInitialHelpMenu } from '../../handlers/helpSelectMenus.js';
import { createEmbed } from "../../utils/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays the community help menu with available commands"),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);
        
        // The "false" flag tells the system to ONLY load community safe commands
        const { embeds, components } = await createInitialHelpMenu(client, false);
        await InteractionHelper.safeEditReply(interaction, { embeds, components });

        setTimeout(async () => {
            try {
                const closedEmbed = createEmbed({
                    title: "Help menu closed",
                    description: "Help menu has been closed due to inactivity. Use `/help` again.",
                    color: "secondary",
                });
                await InteractionHelper.safeEditReply(interaction, { embeds: [closedEmbed], components: [] });
            } catch (error) {}
        }, 5 * 60 * 1000);
    },
};
