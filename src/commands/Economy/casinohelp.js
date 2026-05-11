import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('casinohelp')
        .setDescription('Get an in-depth, detailed guide for a specific casino game.')
        .addStringOption(option => 
            option.setName('game')
                .setDescription('Which game do you want to master?')
                .setRequired(true)
                .addChoices(
                    { name: '🎡 Roulette', value: 'roulette' },
                    { name: '🎴 Teen Patti', value: 'teenpatti' },
                    { name: '🃏 Blackjack', value: 'blackjack' },
                    { name: '🍒 Slots', value: 'slots' },
                    { name: '🃏 High Card', value: 'highcard' }
                )
        ),
    category: 'Economy',

    async execute(interaction) {
        const gameChoice = interaction.options.getString('game');
        let embed = new EmbedBuilder();

        switch (gameChoice) {
            case 'roulette':
                embed.setTitle('🎡 The Ultimate Guide to 24/7 Roulette')
                    .setColor('#2ecc71')
                    .setDescription('Our automated dealer runs infinitely. You have exactly **60 seconds** to place bets before the wheel spins. Here is the exact betting glossary you must use when the popup appears.')
                    .addFields(
                        { name: '🟢 1:1 Payouts (Double your money)', value: '• **Colors:** Type `red` or `black` (48.6% win chance)\n• **Evens/Odds:** Type `even` or `odd` (48.6% win chance)\n• **Halves:** Type `1-18` (Low) or `19-36` (High)' },
                        { name: '🔵 2:1 Payouts (Triple your money)', value: '• **Dozens:** Type `1-12`, `13-24`, or `25-36` (32.4% win chance)\n• **Columns:** Type `col1`, `col2`, or `col3` (32.4% win chance)' },
                        { name: '🔥 35:1 Payout (The Jackpot)', value: '• **Straight Up:** Type any specific number from `0` to `36`. (2.7% win chance). A $1,000 bet here pays out $36,000!' },
                        { name: '📊 Analytics System', value: 'Use the `/roulettestats spins:500` command to analyze the table. It calculates exact color percentages and reveals the "Hot" and "Cold" numbers to help you strategize.' }
                    );
                break;

            case 'teenpatti':
                embed.setTitle('🎴 The Ultimate Guide to Teen Patti (Joker Variant)')
                    .setColor('#9b59b6')
                    .setDescription('A highly strategic 5-player game. You play against 4 AI bots. The table has **2 Hidden Jokers** that are revealed one by one during the betting rounds.')
                    .addFields(
                        { name: '✨ The Table Jokers', value: 'If you hold a card in your hand that matches the *number/face* of a revealed Joker on the table, it becomes a Wildcard! The game automatically transforms it into whatever card gives you the highest possible score.' },
                        { name: '🕶️ Blind vs. Seen Economics', value: 'You start the game **Blind** (cards are hidden `[❓]`). Because you are taking a risk, your bets are **Half-Price**.\n\nYou can click **👀 See Cards** at any time. However, once you are "Seen", your required bets permanently double for the rest of the game to match the AI bots.' },
                        { name: '🧠 Betting & Bot AI', value: '• **Call:** Match the current bet to advance the round.\n• **Double Bet:** Permanently doubles the table stakes! Because bots play "Seen", they have to pay massive amounts to stay in. \n*Bot Logic:* If a bot has a weak hand (High Card), they have a 70% chance to fold when you raise. If they have a Pair or better, they rarely fold!' },
                        { name: '🏆 Hand Rankings (Highest to Lowest)', value: '1. **Trail (Set):** Three of the same rank (e.g., A-A-A)\n2. **Pure Sequence:** Consecutive cards of the same suit\n3. **Sequence:** Consecutive cards of mixed suits\n4. **Color (Flush):** 3 cards of the same suit\n5. **Pair:** Two cards of the same rank\n6. **High Card:** Highest single card wins' }
                    );
                break;

            case 'blackjack':
                embed.setTitle('🃏 The Ultimate Guide to Blackjack')
                    .setColor('#3498db')
                    .setDescription('Play 1-on-1 against the Dealer. The goal is to get closer to 21 than the dealer without going over (Busting).')
                    .addFields(
                        { name: '🔢 Card Values', value: '• Number cards (2-10) are worth their face value.\n• Face cards (Jack, Queen, King) are worth **10**.\n• Aces are dynamic: they count as **11**, but automatically drop to **1** if your score goes over 21.' },
                        { name: '🕹️ Your Actions', value: '• **Hit:** Draw another card to increase your score.\n• **Stand:** Lock in your score and end your turn. This forces the Dealer to play.' },
                        { name: '🤖 The Dealer\'s Rules', value: 'The Dealer plays by strict casino rules: they *must* keep hitting until their score is **17 or higher**. They cannot choose to stand early.' },
                        { name: '💰 Payouts', value: '• **Win:** (2.0x Payout) Beat the dealer or survive if the dealer busts.\n• **Push:** (1.0x Payout) You and the dealer tie. You get your exact bet back.\n• **Blackjack:** (2.5x Payout) Drawing exactly 21 on your first two cards!' }
                    );
                break;

            case 'slots':
                embed.setTitle('🍒 The Ultimate Guide to Slots')
                    .setColor('#f1c40f')
                    .setDescription('A high-speed 3x3 slot machine. You win by matching symbols in the middle horizontal row (marked by red squares).')
                    .addFields(
                        { name: '🟢 2-Match Payouts (Money Back + Profit)', value: 'If you match 2 out of 3 symbols:\n🍒 = 1.0x (Money back)\n🍋, 🍉 = 1.5x\n🍇, 🔔 = 2.0x\n💎 = 3.0x\n🎰 = 5.0x' },
                        { name: '🔥 3-Match Payouts (Jackpots)', value: 'If you hit a perfect 3-in-a-row:\n🍒 = 3x\n🍋 = 4x\n🍉 = 5x\n🍇 = 7x\n🔔 = 10x\n💎 = 20x\n🎰 = **50x Multiplier!**' },
                        { name: '🔁 Fast Rolling', value: 'Once a game finishes, simply click the **Spin Again** button below the machine to instantly deduct your cash and spin again without typing.' }
                    );
                break;

            case 'highcard':
                embed.setTitle('🃏 The Ultimate Guide to High Card')
                    .setColor('#e67e22')
                    .setDescription('The absolute fastest game in the casino. This is a pure 50/50 game of luck against the dealer.')
                    .addFields(
                        { name: 'The Rules', value: 'You and the Dealer are both dealt exactly one card. Whoever has the highest card takes the pot.' },
                        { name: 'Card Hierarchy', value: 'The lowest possible card is a **2**, and the highest is an **Ace**. The suits (Spades, Hearts, Diamonds, Clubs) do not affect the score.' },
                        { name: 'Win Conditions', value: '• **Win:** Your card is higher. Payout is **2x** your bet.\n• **Tie (Push):** Both cards are the exact same rank. Your bet is safely returned.\n• **Lose:** The Dealer\'s card is higher. You lose your bet.' }
                    );
                break;
        }

        embed.setFooter({ text: 'May the odds be ever in your favor! • Use /balance to check your cash.' });

        await interaction.reply({ embeds: [embed] });
    }
};
