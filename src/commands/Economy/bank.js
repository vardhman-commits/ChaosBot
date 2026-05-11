import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';

export default {
    data: new SlashCommandBuilder()
        .setName('bank')
        .setDescription('Manage your finances, view balances, and transfer money.')
        .addSubcommand(sub =>
            sub.setName('view')
            .setDescription('Check your or someone else\'s cash balance.')
            .addUserOption(opt => 
                opt.setName('user').setDescription('User to check (leave blank for yourself)')
            )
        )
        .addSubcommand(sub =>
            sub.setName('deposit')
            .setDescription('Deposit money from your wallet into your safe bank.')
            .addStringOption(opt => 
                opt.setName('amount').setDescription('Amount to deposit, or type "all"').setRequired(true)
            )
        )
        .addSubcommand(sub =>
            sub.setName('withdraw')
            .setDescription('Withdraw money from your bank to gamble with.')
            .addStringOption(opt => 
                opt.setName('amount').setDescription('Amount to withdraw, or type "all"').setRequired(true)
            )
        )
        .addSubcommand(sub =>
            sub.setName('transfer')
            .setDescription('Send money from your wallet to another player.')
            .addUserOption(opt => 
                opt.setName('target').setDescription('Who to send money to').setRequired(true)
            )
            .addIntegerOption(opt => 
                opt.setName('amount').setDescription('How much to send').setRequired(true).setMinValue(1)
            )
        ),
    category: 'Economy',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        if (sub === 'view') {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const userData = await getEconomyData(client, guildId, targetUser.id);
            
            const wallet = userData.wallet || 0;
            const bank = userData.bank || 0;
            const capacity = userData.bankCapacity || 10000;
            const total = wallet + bank;

            const embed = new EmbedBuilder()
                .setTitle(`🏦 ${targetUser.username}'s Finances`)
                .setColor('#2ecc71')
                .addFields(
                    { name: '👛 Wallet (Cash)', value: `$${wallet.toLocaleString()}`, inline: true },
                    { name: '🏛️ Bank', value: `$${bank.toLocaleString()} / $${capacity.toLocaleString()}`, inline: true },
                    { name: '💰 Net Worth', value: `$${total.toLocaleString()}`, inline: false }
                );

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        if (sub === 'deposit') {
            const amountInput = interaction.options.getString('amount').toLowerCase();
            const userData = await getEconomyData(client, guildId, userId);
            
            let wallet = userData.wallet || 0;
            let bank = userData.bank || 0;
            let capacity = userData.bankCapacity || 10000;

            if (wallet <= 0) return InteractionHelper.safeEditReply(interaction, { content: '❌ Your wallet is empty!' });
            if (bank >= capacity) return InteractionHelper.safeEditReply(interaction, { content: '❌ Your bank is full! Buy a Bank Note or Upgrade in the shop.' });

            let amountToDeposit = 0;
            const availableSpace = capacity - bank;

            if (amountInput === 'all' || amountInput === 'max') {
                amountToDeposit = Math.min(wallet, availableSpace);
            } else {
                amountToDeposit = parseInt(amountInput.replace(/,/g, ''));
                if (isNaN(amountToDeposit) || amountToDeposit <= 0) return InteractionHelper.safeEditReply(interaction, { content: '❌ Invalid amount!' });
                if (amountToDeposit > wallet) return InteractionHelper.safeEditReply(interaction, { content: '❌ You do not have that much cash!' });
                if (amountToDeposit > availableSpace) amountToDeposit = availableSpace; // Cap at max capacity
            }

            userData.wallet -= amountToDeposit;
            userData.bank += amountToDeposit;
            await setEconomyData(client, guildId, userId, userData);

            const embed = new EmbedBuilder()
                .setTitle('📥 Deposit Successful')
                .setColor('#3498db')
                .setDescription(`Deposited **$${amountToDeposit.toLocaleString()}** into your bank.\n\n**New Wallet:** $${userData.wallet.toLocaleString()}\n**New Bank:** $${userData.bank.toLocaleString()} / $${capacity.toLocaleString()}`);

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        if (sub === 'withdraw') {
            const amountInput = interaction.options.getString('amount').toLowerCase();
            const userData = await getEconomyData(client, guildId, userId);
            
            let wallet = userData.wallet || 0;
            let bank = userData.bank || 0;

            if (bank <= 0) return InteractionHelper.safeEditReply(interaction, { content: '❌ Your bank is empty!' });

            let amountToWithdraw = 0;

            if (amountInput === 'all' || amountInput === 'max') {
                amountToWithdraw = bank;
            } else {
                amountToWithdraw = parseInt(amountInput.replace(/,/g, ''));
                if (isNaN(amountToWithdraw) || amountToWithdraw <= 0) return InteractionHelper.safeEditReply(interaction, { content: '❌ Invalid amount!' });
                if (amountToWithdraw > bank) return InteractionHelper.safeEditReply(interaction, { content: '❌ You do not have that much in your bank!' });
            }

            userData.wallet += amountToWithdraw;
            userData.bank -= amountToWithdraw;
            await setEconomyData(client, guildId, userId, userData);

            const embed = new EmbedBuilder()
                .setTitle('📤 Withdrawal Successful')
                .setColor('#e67e22')
                .setDescription(`Withdrew **$${amountToWithdraw.toLocaleString()}** from your bank.\n\n**New Wallet:** $${userData.wallet.toLocaleString()}\n**New Bank:** $${userData.bank.toLocaleString()}`);

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        if (sub === 'transfer') {
            const targetUser = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');

            if (targetUser.id === userId) return InteractionHelper.safeEditReply(interaction, { content: '❌ You cannot send money to yourself!' });
            if (targetUser.bot) return InteractionHelper.safeEditReply(interaction, { content: '❌ Bots do not need money.' });

            const senderData = await getEconomyData(client, guildId, userId);
            const targetData = await getEconomyData(client, guildId, targetUser.id);

            if ((senderData.wallet || 0) < amount) {
                return InteractionHelper.safeEditReply(interaction, { content: `❌ You do not have enough cash! Your wallet: **$${(senderData.wallet || 0).toLocaleString()}**` });
            }

            // Transfer the funds
            senderData.wallet -= amount;
            targetData.wallet = (targetData.wallet || 0) + amount;

            await setEconomyData(client, guildId, userId, senderData);
            await setEconomyData(client, guildId, targetUser.id, targetData);

            const embed = new EmbedBuilder()
                .setTitle('💸 Wire Transfer Complete')
                .setColor('#9b59b6')
                .setDescription(`Successfully sent **$${amount.toLocaleString()}** to ${targetUser}.\n\nYour remaining balance: **$${senderData.wallet.toLocaleString()}**`);

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }
};
