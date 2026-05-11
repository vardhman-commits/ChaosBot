import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('casino')
        .setDescription('Casino information and guides.')
        .addSubcommand(sub => 
            sub.setName('help')
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
                            { name: '🃏 High Card', value: 'highcard' },
                            { name: '🎫 Scratch Card', value: 'scratchcard' }
                        )
                )
        ),
    category: 'Economy',

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction);
        const sub = interaction.options.getSubcommand();

        if (sub === 'help') {
            const gameChoice = interaction.options.getString('game');
            let embed = new EmbedBuilder();

            switch (gameChoice) {
                case 'roulette':
                    embed.setTitle('🎡 The Ultimate Guide to 24/7 Roulette')
                        .setColor('#2ecc71')
                        .setDescription('Our automated dealer runs infinitely. You have exactly **60 seconds** to place bets before the wheel spins.')
                        .addFields(
                            { name: '🟢 1:1 Payouts (Double your money)', value: '• **Colors:** `red` or `black`\n• **Evens/Odds:** `even` or `odd`\n• **Halves:** `1-18` (Low) or `19-36` (High)' },
                            { name: '🔵 2:1 Payouts (Triple your money)', value: '• **Dozens:** `1-12`, `13-24`, or `25-36`\n• **Columns:** `col1`, `col2`, or `col3`' },
                            { name: '🔥 35:1 Payout (The Jackpot)', value: '• **Straight Up:** Type any specific number from `0` to `36`.' },
                            { name: '📊 Analytics System', value: 'Use `/roulette stats` to analyze the table. It calculates exact percentages and reveals Hot/Cold numbers!' }
                        );
                    break;

                case 'teenpatti':
                    embed.setTitle('🎴 The Ultimate Guide to Teen Patti')
                        .setColor('#9b59b6')
                        .setDescription('A highly strategic 5-player Indian Poker game. You play against 4 AI bots with **2 Hidden Table Jokers**.')
                        .addFields(
                            { name: '✨ The Table Jokers', value: 'If you hold a card that matches the *number* of a revealed Joker, it becomes a Wildcard!' },
                            { name: '🕶️ Blind vs. Seen Economics', value: 'You start **Blind** (Half-Price bets). Click **👀 See Cards** to look, but your bets will permanently double to match the bots.' },
                            { name: '🧠 Betting & Bot AI', value: '• **Call:** Match current bet.\n• **Double Bet:** Permanently doubles stakes to scare bots into folding.' },
                            { name: '🏆 Hand Rankings', value: '1. Trail (Set) > 2. Pure Sequence > 3. Sequence > 4. Color > 5. Pair > 6. High Card' }
                        );
                    break;

                case 'blackjack':
                    embed.setTitle('🃏 The Ultimate Guide to Blackjack')
                        .setColor('#3498db')
                        .setDescription('Play 1-on-1 against the Dealer. Get closer to 21 without going over (Busting).')
                        .addFields(
                            { name: '🔢 Card Values', value: '• Face cards (J, Q, K) = **10**.\n• Aces = **11** (drops to **1** if you go over 21).' },
                            { name: '🕹️ Your Actions', value: '• **Hit:** Draw another card.\n• **Stand:** Lock score.' },
                            { name: '🤖 Dealer Rules', value: 'The Dealer *must* keep hitting until their score is **17 or higher**.' },
                            { name: '💰 Payouts', value: '• **Win:** 2.0x Payout\n• **Push (Tie):** 1.0x Payout\n• **Blackjack!:** 2.5x Payout' }
                        );
                    break;

                case 'slots':
                    embed.setTitle('🍒 The Ultimate Guide to Slots')
                        .setColor('#f1c40f')
                        .setDescription('A high-speed 3x3 slot machine. Win by matching the middle row.')
                        .addFields(
                            { name: '🟢 2-Match Payouts', value: '🍒 = 1.0x\n🍋, 🍉 = 1.5x\n🍇, 🔔 = 2.0x\n💎 = 3.0x\n🎰 = 5.0x' },
                            { name: '🔥 3-Match Jackpots', value: '🍒 = 3x\n🍋 = 4x\n🍉 = 5x\n🍇 = 7x\n🔔 = 10x\n💎 = 20x\n🎰 = **50x Multiplier!**' }
                        );
                    break;

                case 'highcard':
                    embed.setTitle('🃏 The Ultimate Guide to High Card')
                        .setColor('#e67e22')
                        .setDescription('The absolute fastest game in the casino. Pure 50/50 luck against the dealer.')
                        .addFields(
                            { name: 'The Rules', value: 'Whoever has the highest card takes the pot. 2 is lowest, Ace is highest.' },
                            { name: 'Payouts', value: '• **Win:** 2x your bet.\n• **Push:** Tie, money safely returned.\n• **Lose:** Dealer takes your bet.' }
                        );
                    break;

                case 'scratchcard':
                    embed.setTitle('🎫 The Ultimate Guide to Scratch Cards')
                        .setColor('#e84393')
                        .setDescription('A high-risk, incredibly high-reward instant lottery ticket.')
                        .addFields(
                            { name: 'The Rules', value: 'You buy a ticket and are given a 3x3 grid of hidden spoiler boxes. Click the boxes to physically scratch them off. Find **3 matching symbols** anywhere on the board to win!' },
                            { name: 'Payouts & Odds', value: '• 💎 3x = **100x your bet!** (0.1% chance)\n• 🔔 3x = **50x your bet** (0.9% chance)\n• 🍀 3x = **20x your bet** (4.0% chance)\n• 💵 3x = **10x your bet** (10.0% chance)' },
                            { name: 'Instant Delivery', value: 'Because it is a physical scratch card, the bot calculates your win the moment you buy the ticket. If you win, the cash is deposited instantly before you even finish scratching!' }
                        );
                    break;
            }

            embed.setFooter({ text: 'May the odds be ever in your favor! • Use /bank view to check your cash.' });
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }
};
