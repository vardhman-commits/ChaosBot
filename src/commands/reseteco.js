import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { shopItems } from '../../config/shop/items.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reseteco')
        .setDescription('ADMIN ONLY: Completely wipe a user\'s economy and remove premium roles.')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The user to reset')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(8), // Admin only
    category: 'Economy',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const targetUser = interaction.options.getUser('target');
        const guildId = interaction.guildId;

        // 1. Completely overwrite their database entry with a fresh slate
        const wipedData = {
            wallet: 0,
            bank: 0,
            bankCapacity: 10000,
            inventory: {},
            upgrades: {},
            roles: [],
            lastDaily: 0,
            lastWork: 0,
            lastGamble: 0,
            lastRob: 0,
            lastCrime: 0,
            lastMine: 0,
            lastFish: 0
        };

        await setEconomyData(client, guildId, targetUser.id, wipedData);

        // 2. Look for any Premium Roles in the shop and strip them from the Discord Member
        let removedRoles = 0;
        try {
            const member = await interaction.guild.members.fetch(targetUser.id);
            const roleItems = shopItems.filter(item => item.type === 'role' && item.roleId);
            
            for (const item of roleItems) {
                if (member.roles.cache.has(item.roleId)) {
                    await member.roles.remove(item.roleId);
                    removedRoles++;
                }
            }
        } catch (err) {
            // Ignore if member is not in the server anymore
        }

        const embed = new EmbedBuilder()
            .setTitle('⚠️ Economy Reset')
            .setColor('#e74c3c')
            .setDescription(`Successfully wiped the economy data for **${targetUser.username}**.\n\n• Wallet & Bank reset to $0\n• Inventory wiped\n• Removed ${removedRoles} Premium VIP Role(s)`)
            .setFooter({ text: `Action performed by ${interaction.user.username}` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
