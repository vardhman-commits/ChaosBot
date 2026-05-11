import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('casinohelp')
        .setDescription('Get an in-depth guide for a specific casino game.')
        .addStringOption(option => 
            option.setName('game')
                .setDescription('Which game do you want to learn about?')
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
                embed.setTitle('🎡 In-Depth Guide: 24/7 Roulette')
                    .setColor('#2ecc71')
                    .setDescription('Our Roulette table runs 24 hours a day automatically! The dealer gives you 60 seconds to place bets, spins the wheel, pays out, and instantly restarts.')
                    .addFields(
                        { name: 'How to Bet', value: 'When the round starts, click **💰 Place Your Bet**. A popup will ask you for your bet type and amount. You must type your bet *exactly* as listed below.' },
                        { name: '1:1 Payouts (Double your money)', value: '`red` / `black`\n`even` / `odd`\n`1-18` (Low) / `19-36` (High)' },
                        { name: '2:1 Payouts (Triple your money)', value: '`1-12` (1st Dozen)\n`13-24` (2nd Dozen)\n`25-36` (3rd Dozen)\n`col1`, `col2`, `col3` (Vertical Columns)' },
                        { name: '35:1 Payout (Jackpot!)', value: 'Type any specific number between `0` and `36`.' },
                        { name: 'Pro Tip', value: 'Use the `/roulettestats` command to see the Hot/Cold numbers and exact percentages for the last 500 spins!' }
                    );
                break;

            case 'teenpatti':
                embed.setTitle('🎴 In-Depth Guide: Teen Patti (Joker Variant)')
                    .setColor('#9b59b6')
                    .setDescription('A high-stakes, 5-player Indian Poker game against 4 intelligent AI bots. This is a game of bluffing, nerve, and wildcards.')
                    .addFields(
                        { name: 'The Setup', value: 'You are dealt 3 cards. **2 Jokers** are dealt face-down in the middle of the table. Every round, one Joker is revealed.' },
                        { name: '✨ The Joker Mechanic', value: 'If you have a card in your hand that matches the *number* of a revealed Joker, it becomes a Wildcard! It will automatically transform to give you the highest possible score.' },
                        { name: 'Blind vs Seen', value: 'You start the game **Blind** (your cards are hidden). Because you are taking a blind risk, your bets are **Half-Price**. \n\nYou can click **👀 See Cards** at any time. However, once you are "Seen", your required bets permanently double for the rest of the game.' },
                        { name: 'Betting Options', value: '• **Call:** Pay the current base bet to stay in the game.\n• **Double Bet:** This permanently raises the stakes! It forces the bots to pay massive amounts of money to stay in the game, which can scare them into folding.\n• **Fold:** Surrender your hand and lose your invested money.' },
                        { name: 'Hand Rankings', value: '1. Trail (Set/Three of a Kind)\n2. Pure Sequence (Straight Flush)\n3. Sequence (Straight)\n4. Color (Flush)\n5. Pair\n6. High Card' }
                    );
                break;

            case 'blackjack':
                embed.setTitle('🃏 In-Depth Guide: Blackjack')
                    .setColor('#3498db')
                    .setDescription('The classic casino card game where you play 1-on-1 against the Dealer to get as close to 21 as possible without going over.')
                    .addFields(
                        { name: 'The Rules', value: 'You are dealt 2 cards. Number cards are worth their face value, Face cards (J, Q, K) are worth 10, and Aces are worth 1 or 11.' },
                        { name: 'Your Moves', value: '• **Hit:** Draw another card to increase your score. Be careful! If you go over 21, you "Bust" and instantly lose.\n• **Stand:** Lock in your current score and end your turn.' },
                        { name: 'The Dealer AI', value: 'Once you Stand, the Dealer reveals their hidden card. The Dealer is forced to keep hitting until their score is 17 or higher.' },
                        { name: 'Payouts', value: '• **Standard Win:** If
