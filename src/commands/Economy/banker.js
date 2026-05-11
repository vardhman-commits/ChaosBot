import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';

export default {
    data: new SlashCommandBuilder()
        .setName('banker')
        .setDescription('ADMIN ONLY: Master controls for modifying user balances.')
        .setDefaultMemberPermissions(8) // Hides command from regular players
        .addSubcommand(sub =>
            sub.setName('add')
            .setDescription('Print money and give it to a user.')
            .addUserOption(opt => opt.setName('target').setDescription('User to give money to').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to add').setRequired(true).setMinValue(1))
            .addStringOption(opt => opt.setName('account').setDescription('Wallet or Bank?').setRequired(true).addChoices(
                { name: 'Wallet', value: 'wallet' }, { name: 'Bank', value: 'bank' }
            ))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
            .setDescription('Deduct money from a user.')
            .addUserOption(opt => opt.setName('target').setDescription('User to take money from').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to remove').setRequired(true).setMinValue(1))
            .addStringOption(opt => opt.setName('account').setDescription('Wallet or Bank?').setRequired(true).addChoices(
                { name: 'Wallet', value: 'wallet' }, { name: 'Bank', value: 'bank' }
            ))
        )
        .addSubcommand(sub =>
            sub.setName('set')
            .setDescription('Force a user\'s balance to an exact number.')
            .addUserOption(opt => opt.setName('target').setDescription('User to modify').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Exact amount to set').setRequired(true).setMinValue(0))
            .addStringOption(opt => opt.setName('account').setDescription('Wallet or Bank?').setRequired(true).addChoices(
                { name: 'Wallet', value: 'wallet' }, { name: 'Bank', value: 'bank' }
            ))
        ),
    category: 'Economy',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        // Extra fallback security check just in case
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return InteractionHelper.safeEditReply(interaction, { content: '❌ **Access Denied.**' });
        }

        const sub = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        const account = interaction.options.getString('account');
        const guildId = interaction.guildId;
        
        const userData = await getEconomyData(client, guildId, targetUser.id);
        let oldBalance = userData[account] || 0;

        if (sub === 'add') {
            userData[account] = oldBalance + amount;
        } else if (sub === 'remove') {
            userData[account] = Math.max(0, oldBalance - amount); // Prevents negative balance
        } else if (sub === 'set') {
            userData[account] = amount;
        }

        await setEconomyData(client, guildId, targetUser.id, userData);

        let actionWord = sub === 'add' ? 'Added to' : sub === 'remove' ? 'Removed from' : 'Set';
        let color = sub === 'add' ? '#2ecc71' : sub === 'remove' ? '#e74c3c' : '#f1c40f';

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Banker Override')
            .setColor(color)
            .setDescription(`Successfully modified ${targetUser}'s finances.\n\n**Action:** ${actionWord} their ${account}\n**Amount:** $${amount.toLocaleString()}\n**New ${account} Balance:** $${userData[account].toLocaleString()}`)
            .setFooter({ text: `Authorized by ${interaction.user.username}` });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
