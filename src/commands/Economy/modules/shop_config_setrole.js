import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { getGuildConfig, updateGuildConfig } from '../../../services/guildConfig.js';

export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction, { ephemeral: true });

            // Security Check: Only Admins/Managers can set shop roles
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return InteractionHelper.safeEditReply(interaction, { 
                    content: '❌ You must have the Manage Server permission to configure the shop!' 
                });
            }

            const tierId = interaction.options.getString('tier');
            const role = interaction.options.getRole('role');
            const guildId = interaction.guildId;

            // Prevent admins from setting bot roles or managed roles by accident
            if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
                return InteractionHelper.safeEditReply(interaction, { 
                    content: '❌ I cannot assign that role! Please make sure the role is placed **below** my bot role in the server settings, and is not a bot/integration managed role.' 
                });
            }

            // Fetch current guild configuration using the service layer
            const currentConfig = await getGuildConfig(client, guildId);
            
            // Ensure the shopRoles object exists in the config (if it wasn't initialized yet)
            const shopRoles = currentConfig.shopRoles || {};

            // Save the specific role ID to the selected tier
            shopRoles[tierId] = role.id;
            
            // Safely push the update to the database
            await updateGuildConfig(client, guildId, { shopRoles });

            // Format a nice display name for the confirmation message
            const tierNames = {
                'vip_bronze': '🥉 Bronze VIP',
                'vip_silver': '🥈 Silver VIP',
                'vip_gold': '🥇 Gold VIP',
                'vip_diamond': '💎 Diamond VIP',
                'vip_whale': '🐳 Chaos Whale'
            };

            const embed = new EmbedBuilder()
                .setTitle('✅ Shop Configuration Updated')
                .setColor('#2ecc71')
                .setDescription(`Successfully linked the **${tierNames[tierId]}** shop item to the ${role} role!`)
                .setFooter({ text: 'Users who purchase this item will now automatically receive this role.' });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        } catch (error) {
            logger.error('Error in shop_config_setrole:', error);
            await InteractionHelper.safeEditReply(interaction, { 
                content: '❌ An error occurred while trying to save the shop configuration.' 
            });
        }
    }
};
