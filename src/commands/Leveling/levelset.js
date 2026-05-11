




import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { setUserLevel, getLevelingConfig } from '../../services/leveling.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelset')
    .setDescription("Set a user's level to a specific value")
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to set the level for')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('The level to set')
        .setRequired(true)
        .setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const hasPermission = await checkUserPermissions(
        interaction,
        PermissionFlagsBits.ManageGuild,
        'You need ManageGuild permission to use this command.'
      );
      if (!hasPermission) return;

      const levelingConfig = await getLevelingConfig(client, interaction.guildId);
      if (!levelingConfig?.enabled) {
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor('#f1c40f')
              .setDescription('The leveling system is currently disabled on this server.')
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const targetUser = interaction.options.getUser('user');
      const newLevel = interaction.options.getInteger('level');

      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        throw new TitanBotError(
          `User ${targetUser.id} not found in this guild`,
          ErrorTypes.USER_INPUT,
          'The specified user is not in this server.'
        );
      }

      // Update the database
      const userData = await setUserLevel(client, interaction.guildId, targetUser.id, newLevel);

      // --- NEW LOGIC: Award roles when level is manually set ---
      if (levelingConfig.roleRewards) {
        // Loop through all configured role rewards
        for (const [reqLevel, roleId] of Object.entries(levelingConfig.roleRewards)) {
          // If the user's new level is greater than or equal to the required level for this role
          if (newLevel >= Number(reqLevel)) {
            // Check if they already have the role to prevent API spam
            if (!member.roles.cache.has(roleId)) {
              try {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role) {
                  await member.roles.add(role, `Admin set level to ${newLevel}`);
                }
              } catch (err) {
                logger.error(`Failed to assign level reward role to ${member.user.id} during /levelset:`, err);
              }
            }
          }
        }
      }
      // ---------------------------------------------------------

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          createEmbed({
            title: '✅ Level Set',
            description: `Successfully set ${targetUser.tag}'s level to **${newLevel}**.\n**Total XP:** ${userData.totalXp}`,
            color: 'success'
          })
        ]
      });

      logger.info(
        `[ADMIN] User ${interaction.user.tag} set ${targetUser.tag}'s level to ${newLevel} in guild ${interaction.guildId}`
      );
    } catch (error) {
      logger.error('LevelSet command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'levelset'
      });
    }
  }
};

