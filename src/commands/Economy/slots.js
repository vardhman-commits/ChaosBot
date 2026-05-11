import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
// TODO: Adjust these imports to match your actual economy service functions
import { getBalance, removeBalance, addBalance } from '../../services/economyService.js'; 

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

        // 1. Check Balance
        const currentBalance = await getBalance(client, guildId, userId);
        if (currentBalance < bet) {
            return InteractionHelper.safeEditReply(interaction, { content: `❌ You don't have enough coins! Your balance is **${currentBalance}**.` });
        }

        // Deduct bet initially
        await removeBalance(client, guildId, userId, bet);

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
            await addBalance(client, guildId, userId, winnings);
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
            .setDescription(`${slotUI}\n\n**Bet:** 🪙 ${bet}\n**Result:** ${isWin ? `🎉 YOU WON **🪙 ${winnings}**!` : '❌ You lost.'}`)
            .setFooter({ text: `${interaction.user.username}'s game` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
