import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { shopItems, validatePurchase } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse the store, buy items, and configure shop settings.')
        
        // --- SUBCOMMAND: BROWSE ---
        .addSubcommand(sub =>
            sub.setName('browse')
                .setDescription('Browse the economy shop.')
        )

        // --- SUBCOMMAND: BUY ---
        .addSubcommand(sub =>
            sub.setName('buy')
                .setDescription('Buy an item from the shop.')
                .addStringOption(option =>
                    option.setName('item_id')
                        .setDescription('The exact ID of the item to buy (shown in /shop browse)')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('quantity')
                        .setDescription('Quantity to buy (default: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(10)
                )
        )

        // --- SUBCOMMAND: ADMIN CONFIG ---
        .addSubcommandGroup(group =>
            group.setName('config')
                .setDescription('Configure shop settings. (Manage Server required)')
                .addSubcommand(sub =>
                    sub.setName('setrole')
                        .setDescription('Set the Discord role granted when a specific VIP tier is purchased.')
                        .addStringOption(option => 
                            option.setName('tier')
                            .setDescription('Which VIP tier are you setting the role for?')
                            .setRequired(true)
                            .addChoices(
                                { name: '🥉 Bronze VIP', value: 'vip_bronze' },
                                { name: '🥈 Silver VIP', value: 'vip_silver' },
                                { name: '🥇 Gold VIP', value: 'vip_gold' },
                                { name: '💎 Diamond VIP', value: 'vip_diamond' },
                                { name: '🐳 Chaos Whale', value: 'vip_whale' }
                            )
                        )
                        .addRoleOption(option =>
                            option.setName('role')
                                .setDescription('The role to grant for this VIP tier.')
                                .setRequired(true)
                        )
                )
        ),
    category: 'Economy',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const sub = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup(false);
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        // ==========================================
        //             BROWSE LOGIC
        // ==========================================
        if (sub === 'browse') {
            const embed = new EmbedBuilder()
                .setTitle('🛒 Chaos Casino Shop')
                .setDescription('Use `/shop buy item_id:<id>` to purchase an item.')
                .setColor('#f1c40f')
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }));

            let toolsText = '';
            let rolesText = '';
            let upgradesText = '';

            shopItems.forEach(item => {
                const entry = `**${item.name}** (\`${item.id}\`)\nPrice: **$${item.price.toLocaleString()}**\n*${item.description}*\n\n`;
                if (item.type === 'tool' || item.type === 'consumable') toolsText += entry;
                else if (item.type === 'role') rolesText += entry;
                else if (item.type === 'upgrade') upgradesText += entry;
            });

            if (toolsText) embed.addFields({ name: '🛠️ Tools & Grinding Gear', value: toolsText, inline: false });
            if (upgradesText) embed.addFields({ name: '📈 Bank Upgrades', value: upgradesText, inline: false });
            if (rolesText) embed.addFields({ name: '👑 VIP Premium Roles', value: rolesText, inline: false });

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        // ==========================================
        //               BUY LOGIC
        // ==========================================
        if (sub === 'buy') {
            const itemId = interaction.options.getString("item_id").toLowerCase();
            const quantity = interaction.options.getInteger("quantity") || 1;

            const item = shopItems.find(i => i.id === itemId);
            if (!item) {
                throw createError(`Item not found`, ErrorTypes.VALIDATION, `The item ID \`${itemId}\` does not exist in the shop.`, { itemId });
            }

            const userData = await getEconomyData(client, guildId, userId);

            const validation = validatePurchase(itemId, userData);
            if (!validation.valid && quantity === 1) {
                throw createError("Validation Failed", ErrorTypes.VALIDATION, validation.reason, { itemId });
            }

            const totalCost = item.price * quantity;

            if ((userData.wallet || 0) < totalCost) {
                throw createError("Insufficient funds", ErrorTypes.VALIDATION, `You need **$${totalCost.toLocaleString()}** to purchase ${quantity}x **${item.name}**, but you only have **$${(userData.wallet || 0).toLocaleString()}** in your wallet.`, { required: totalCost, current: userData.wallet });
            }

            let successDescription = `You successfully purchased ${quantity}x **${item.name}** for **$${totalCost.toLocaleString()}**!`;

            // VIP ROLE LOGIC
            if (item.type === "role") {
                const guildConfig = await getGuildConfig(client, guildId);
                const roleId = guildConfig.shopRoles?.[itemId];

                if (!roleId) throw createError("Role not configured", ErrorTypes.CONFIGURATION, `The Admins have not linked a Discord role to **${item.name}** yet.`);
                
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) throw createError("Role missing", ErrorTypes.CONFIGURATION, "The configured premium role no longer exists in this server.");

                if (interaction.member.roles.cache.has(roleId)) {
                    throw createError("Already owned", ErrorTypes.VALIDATION, `You already have the **${item.name}** role.`);
                }

                if (quantity > 1) throw createError("Invalid quantity", ErrorTypes.VALIDATION, `You can only purchase a role once.`);

                try {
                    await interaction.member.roles.add(role, `Purchased role: ${item.name}`);
                    successDescription += `\n\n**👑 The role ${role.toString()} has been granted to you!**`;
                } catch (roleError) {
                    throw createError("Assignment failed", ErrorTypes.DISCORD_API, "I don't have permission to give you that role! Please tell an Admin to move my bot role higher up in the server settings.");
                }
            }

            // APPLY ECONOMY EFFECTS
            userData.wallet -= totalCost;

            if (item.effect?.type === 'bank_capacity') {
                userData.bankCapacity = userData.bankCapacity || 10000;
                if (item.effect.multiplier) userData.bankCapacity = Math.floor(userData.bankCapacity * item.effect.multiplier);
                if (item.effect.increase) userData.bankCapacity += (item.effect.increase * quantity);
                successDescription += `\n\n🏦 **Your Bank Capacity is now $${userData.bankCapacity.toLocaleString()}!**`;
            }

            if (item.type === "upgrade") {
                userData.upgrades = userData.upgrades || {};
                userData.upgrades[itemId] = true;
                if (item.effect?.type !== 'bank_capacity') successDescription += `\n\n**✨ Your upgrade is now active!**`;
            } else if (item.type === "consumable" || item.type === "tool") {
                userData.inventory = userData.inventory || {};
                userData.inventory[itemId] = (userData.inventory[itemId] || 0) + quantity;
            }

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed("💰 Purchase Successful", successDescription)
                .addFields({ name: "New Wallet Balance", value: `$${userData.wallet.toLocaleString()}`, inline: true });

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        // ==========================================
        //             ADMIN CONFIG LOGIC
        // ==========================================
        if (group === 'config' && sub === 'setrole') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return InteractionHelper.safeEditReply(interaction, { content: '❌ You must have the Manage Server permission to configure the shop!' });
            }

            const tierId = interaction.options.getString('tier');
            const role = interaction.options.getRole('role');

            if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
                return InteractionHelper.safeEditReply(interaction, { content: '❌ I cannot assign that role! Please make sure the role is placed **below** my bot role in the server settings, and is not a bot/integration managed role.' });
            }

            const currentConfig = await getGuildConfig(client, guildId);
            const shopRoles = currentConfig.shopRoles || {};
            shopRoles[tierId] = role.id;
            
            await updateGuildConfig(client, guildId, { shopRoles });

            const tierNames = { 'vip_bronze': '🥉 Bronze VIP', 'vip_silver': '🥈 Silver VIP', 'vip_gold': '🥇 Gold VIP', 'vip_diamond': '💎 Diamond VIP', 'vip_whale': '🐳 Chaos Whale' };

            const embed = new EmbedBuilder()
                .setTitle('✅ Shop Configuration Updated')
                .setColor('#2ecc71')
                .setDescription(`Successfully linked the **${tierNames[tierId]}** shop item to the ${role} role!`)
                .setFooter({ text: 'Users who purchase this item will now automatically receive this role.' });

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }, { command: 'shop' })
};
