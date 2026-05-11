import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('casinohelp')
        .setDescription('Learn how to play all the games in the Chaos Casino!'),
    category: 'Economy',

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🎰 Chaos Casino: Official Game Guide 🎰')
            .setColor('#f1c40f')
            .setDescription('Welcome to the casino! Here are the rules and mechanics for every game you can play to multiply your cash.')
            .addFields(
                { 
                    name: '🍒 `/slots [bet]`', 
                    value: 'Spin the 3x3 slot machine! You win if you match **2 or 3 symbols** in the middle row. Different symbols have massive different multipliers (up to 50x for Jackpots!). Use the **Spin Again** button to keep gambling quickly.' 
                },
                { 
                    name: '🃏 `/blackjack [bet]`', 
                    value: 'Classic 21. You are dealt 2 cards and play against the Dealer. Click **Hit** to draw another card, or **Stand** to hold your score. If you go over 21, you bust and lose. Beat the dealer\'s score to win 2x your bet. A natural Blackjack (21 on the first two cards) pays 2.5x!' 
                },
                { 
                    name: '🃏 `/highcard [bet]`', 
                    value: 'The fastest game in the casino. You and the Dealer both draw one card. The highest card wins double your bet. If it is a Tie (Push), you get your money safely returned.' 
                },
                { 
                    name: '🎡 `/setroulette` (Admin Only)', 
                    value: 'Starts the 24/7 Live Automated Roulette Table! \n**How to play:** When betting is open, click **💰 Place Your Bet**. A popup will appear. Type your bet amount and exactly what you want to bet on (e.g., `Red`, `Black`, `Even`, `Odd`, `1-18`, `1-12`, `col1`, or a specific number like `17`). The dealer spins every minute automatically!' 
                },
                { 
                    name: '🎴 `/teenpatti [ante]`', 
                    value: 'High-stakes 5-Player Indian Poker (You vs. 4 Bots) with **2 Table Jokers!**\n' +
                           '**Mechanics:**\n' +
                           '• **Blind vs Seen:** You start playing "Blind" (cards hidden), which makes your bets Half-Price. Click **👀 See Cards** to look at your hand, but your required bets will permanently double!\n' +
                           '• **Jokers:** The 2 middle cards are Jokers. If you hold a card with the same number, it becomes a Wildcard and magically upgrades your hand to the highest possible score!\n' +
                           '• **Actions:** You can **Call** (match the current bet), **Double Bet** (raise the stakes and try to scare the bots into folding), or **Fold** (surrender).\n' +
                           '• **Hand Ranks:** Trail (Set) > Pure Sequence > Sequence > Color (Flush) > Pair > High Card.'
                }
            )
            .setFooter({ text: 'May the odds be ever in your favor! • /balance to check your cash.' });

        await interaction.reply({ embeds: [embed] });
    }
};
