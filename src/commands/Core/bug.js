import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("bug")
        .setDescription("Report a bug or issue with the bot"),

    async execute(interaction) {
        const bugReportEmbed = createEmbed({
            title: '🐛 Bug Report',
            description: 'Found a bug? Please report it by opening a support ticket in this server!\n\n' +
            '**When reporting a bug, please include:**\n' +
            '• 📝 Detailed description of the issue\n' +
            '• 📋 Steps to reproduce the problem\n' +
            '• 📸 Screenshots if applicable\n' +
            '• 💻 What command you were trying to use\n\n' +
            'This helps our moderation team fix issues faster and more effectively!',
            color: 'error'
        })
        .setTimestamp();

        await InteractionHelper.safeReply(interaction, {
            embeds: [bugReportEmbed],
        });
    },
};
