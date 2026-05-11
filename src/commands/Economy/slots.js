import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
// Corrected imports to match the actual database utility and service
import EconomyService from '../../services/economyService.js';
import { getEconomyData } from '../../utils/economy.js';

const SLOTS = ['🍒', '🍋', '🍉', '🍇', '🔔', '💎', '🎰'];
const MULTIPLIERS = {
    '🍒': 2, '🍋': 3, '🍉': 4, '🍇': 5, '🔔': 10, '💎': 20, '🎰': 50
};

export default {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Play the slot machine!')
        .addIntegerOption(option => 
            option.setName('bet')
                .setDescription('Amount to bet')
                .setRequired(true)
                .setMinValue(1)
        ),
    category: 'Economy',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);
        const bet = interaction.options.getInteger('bet');
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        // 1. Check Balance using the correct utility file
        const userData = await getEconomyData(client, guildId, userId);
        const currentBalance = userData.wallet || 0;
        
        if (currentBalance < bet) {
            return InteractionHelper.safeEditReply(interaction, { content: `❌ You don't have enough cash! Your wallet balance is **$${currentBalance.toLocaleString()}**.` });
        }

        // Deduct bet initially using EconomyService
        await EconomyService.removeMoney(client, guildId, userId, bet, 'Slots Bet');

        // 2. Generate Slot Grid
        const grid = Array.from({ length: 3 }, () => 
            Array.from({ length: 3 }, () => SLOTS[Math.floor(Math.random() * SLOTS.length)])
        );

        const resultRow = grid[1]; // The middle row is the winning line
        const isWin = resultRow[0] === resultRow[1] && resultRow[1] === resultRow[2];
        const winningSymbol = isWin ? resultRow[0] : null;
        
        let winnings = 0;
        if (isWin) {
            winnings = bet * MULTIPLIERS[winningSymbol];
            await EconomyService.addMoney(client, guildId, userId, winnings, 'Slots Winnings');
        }

        // 3. Visual UI
        const slotUI = `
        ⬛⬛⬛⬛⬛⬛⬛
        ⬛ ${grid[0][0]} ┃ ${grid[0][1]} ┃ ${grid[0][2]} ⬛
        🟥 ${grid[1][0]} ┃ ${grid[1][1]} ┃ ${grid[1][2]} 🟥 ⬅️
        ⬛ ${grid[2][0]} ┃ ${grid[2][1]} ┃ ${grid[2][2]} ⬛
        ⬛⬛⬛⬛⬛⬛⬛`;

        const embed = new EmbedBuilder()
            .setTitle('🎰 Slot Machine 🎰')
            .setColor(isWin ? '#2ecc71' : '#e74c3c')
            .setDescription(`${slotUI}\n\n**Bet:** $${bet.toLocaleString()}\n**Result:** ${isWin ? `🎉 YOU WON **$${winnings.toLocaleString()}**!` : '❌ You lost.'}`)
            .setFooter({ text: `${interaction.user.username}'s game` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
