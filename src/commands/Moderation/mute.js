import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName("mute")
        .setDescription("Manage the server mute system")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) // Locks this command to Moderators/Admins
        .addSubcommand(subcommand =>
            subcommand
                .setName("apply")
                .setDescription("Apply the Mute role to a user")
                .addUserOption(option => 
                    option.setName("user")
                        .setDescription("The user to mute")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Reason for the mute")
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove the Mute role from a user")
                .addUserOption(option => 
                    option.setName("user")
                        .setDescription("The user to unmute")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Reason for the unmute")
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("setrole")
                .setDescription("Set the role used for muting users")
                .addRoleOption(option =>
                    option.setName("role")
                        .setDescription("The Mute role to assign")
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";

        try {
            // Fetch live config to ensure we have the latest muteRole settings
            const liveConfig = await getGuildConfig(client, interaction.guildId);
            
            // ================================
            // SUBCOMMAND: SETROLE
            // ================================
            if (subcommand === "setrole") {
                const role = interaction.options.getRole("role");
                
                // Security Check: Make sure the bot's role is high enough to actually give this role
                if (role.position >= interaction.guild.members.me.roles.highest.position) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createEmbed({
                            title: "❌ Setup Failed",
                            description: `I cannot use the ${role} role because it is higher than my own role!\n\nPlease go to **Server Settings -> Roles** and drag my bot role above the Mute role.`,
                            color: "error"
                        })]
                    });
                }

                await updateGuildConfig(client, interaction.guildId, { muteRole: role.id });
                
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: "✅ Mute Role Configured",
                        description: `The mute role has been successfully set to ${role}.\n\n*Important: Make sure you edit this role in your Server Settings and disable its "Send Messages" and "Speak" permissions!*`,
                        color: "success"
                    })]
                });
            }

            // ================================
            // PRE-CHECKS FOR APPLY & REMOVE
            // ================================
            
            // Ensure they actually set up the role first!
            if (!liveConfig.muteRole) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: "❌ Mute Role Not Set",
                        description: "You need to set a mute role first before you can mute people!\n\nUse `/mute setrole <role>` to configure it.",
                        color: "error"
                    })]
                });
            }

            const muteRole = interaction.guild.roles.cache.get(liveConfig.muteRole);
            if (!muteRole) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: "❌ Mute Role Missing",
                        description: "The configured mute role was deleted or no longer exists! Please set a new one using `/mute setrole <role>`.",
                        color: "error"
                    })]
                });
            }

            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({ title: "❌ User Not Found", description: "That user is no longer in the server.", color: "error" })]
                });
            }

            // Hierarchy Checks (Don't let them mute the bot or higher admins)
            if (member.id === interaction.user.id) {
                return InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: "❌ Error", description: "You cannot mute or unmute yourself.", color: "error" })] });
            }
            if (member.id === client.user.id) {
                return InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: "❌ Error", description: "I cannot mute myself.", color: "error" })] });
            }
            if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
                return InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: "❌ Permission Denied", description: "You cannot mute a user with a higher or equal role to you.", color: "error" })] });
            }
            if (!member.manageable) {
                return InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: "❌ Permission Denied", description: "I do not have permission to manage that user's roles. Please ensure my bot role is above theirs.", color: "error" })] });
            }

            // ================================
            // SUBCOMMAND: APPLY
            // ================================
            if (subcommand === "apply") {
                if (member.roles.cache.has(muteRole.id)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createEmbed({ title: "⚠️ Already Muted", description: `${targetUser} is already muted.`, color: "warning" })]
                    });
                }

                await member.roles.add(muteRole, `Muted by ${interaction.user.tag}: ${reason}`);
                
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: "🔇 User Muted",
                        description: `${targetUser} has been muted.`,
                        color: "success"
                    }).addFields(
                        { name: "Reason", value: reason, inline: true },
                        { name: "Moderator", value: interaction.user.tag, inline: true }
                    )]
                });
            }

            // ================================
            // SUBCOMMAND: REMOVE
            // ================================
            if (subcommand === "remove") {
                if (!member.roles.cache.has(muteRole.id)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createEmbed({ title: "⚠️ Not Muted", description: `${targetUser} is not currently muted.`, color: "warning" })]
                    });
                }

                await member.roles.remove(muteRole, `Unmuted by ${interaction.user.tag}: ${reason}`);
                
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: "🔊 User Unmuted",
                        description: `${targetUser} has been unmuted.`,
                        color: "success"
                    }).addFields(
                        { name: "Reason", value: reason, inline: true },
                        { name: "Moderator", value: interaction.user.tag, inline: true }
                    )]
                });
            }

        } catch (error) {
            logger.error('Mute command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: "❌ Action Failed",
                    description: "An error occurred while executing the mute command.",
                    color: "error"
                })]
            });
        }
    },
};
