import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelrole')
    .setDescription('Manage role rewards for leveling up')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add a role reward for reaching a specific level')
        .addIntegerOption((option) =>
          option
            .setName('level')
            .setDescription('The level required to get the role')
            .setRequired(true)
            .setMinValue(1)
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The role to reward')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a role reward from a specific level')
        .addIntegerOption((option) =>
          option
            .setName('level')
            .setDescription('The level to remove the reward from')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List all role rewards set for this server')
    ),
  category: 'Leveling',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const guildId = interaction.guildId;
      const levelingConfig = await getLevelingConfig(client, guildId);

      // Ensure the roleRewards object exists in the config
      if (!levelingConfig.roleRewards) {
        levelingConfig.roleRewards = {};
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'add') {
        const level = interaction.options.getInteger('level');
        const role = interaction.options.getRole('role');

        // Save the role ID to the level key
        levelingConfig.roleRewards[level] = role.id;
        await saveLevelingConfig(client, guildId, levelingConfig);

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '✅ Role Reward Added',
              description: `Users will now automatically receive the ${role} role when they reach **Level ${level}**.`,
              color: 'success'
            })
          ]
        });

      } else if (subcommand === 'remove') {
        const level = interaction.options.getInteger('level');

        if (levelingConfig.roleRewards[level]) {
          delete levelingConfig.roleRewards[level];
          await saveLevelingConfig(client, guildId, levelingConfig);

          await InteractionHelper.safeEditReply(interaction, {
            embeds: [
              createEmbed({
                title: '✅ Role Reward Removed',
                description: `Successfully removed the role reward for **Level ${level}**.`,
                color: 'success'
              })
            ]
          });
        } else {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [
              createEmbed({
                title: '❌ Not Found',
                description: `There is no role reward currently set up for **Level ${level}**.`,
                color: 'error'
              })
            ]
          });
        }

      } else if (subcommand === 'list') {
        // Map the stored role IDs to pingable role formats
        const rewardsList = Object.entries(levelingConfig.roleRewards)
          .sort((a, b) => Number(a[0]) - Number(b[0])) // Sort by level ascending
          .map(([level, roleId]) => `**Level ${level}:** <@&${roleId}>`)
          .join('\n');

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '📊 Level Role Rewards',
              description: rewardsList.length > 0 ? rewardsList : 'No role rewards have been set up yet.',
              color: 'info'
            })
          ]
        });
      }

    } catch (error) {
      logger.error('LevelRole command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'levelrole'
      });
    }
  }
};
