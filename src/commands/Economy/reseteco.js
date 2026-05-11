import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { setEconomyData } from '../../utils/economy.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reseteco')
        .setDescription('ADMIN ONLY: Completely wipe a user\'s economy data.')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The user to reset')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(8), // Hides it from non-admins
    category: 'Economy',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const targetUser = interaction.options.getUser('target');
        const guildId = interaction.guildId;

        // Overwrite their database entry with a fresh slate, clearing the bugged upgrades
        const wipedData = {
            wallet: 0,
            bank: 0,
            bankCapacity: 10000,
            inventory: {},
            upgrades: {},
            lastDaily: 0,
            lastWork: 0,
            lastCrime: 0,
            lastMine: 0,
            lastFish: 0,
            lastScavenge: 0
        };

        await setEconomyData(client, guildId, targetUser.id, wipedData);

        const embed = new EmbedBuilder()
            .setTitle('⚠️ Economy Reset')
            .setColor('#e74c3c')
            .setDescription(`Successfully wiped the economy data for **${targetUser.username}**.\n\n• Wallet & Bank reset to $0\n• Inventory and Upgrades wiped`)
            .setFooter({ text: `Action performed by ${interaction.user.username}` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
