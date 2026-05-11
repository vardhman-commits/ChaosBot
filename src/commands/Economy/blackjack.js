import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
// TODO: Adjust these imports to match your actual economy service functions
import { getBalance, removeBalance, addBalance } from '../../services/economyService.js'; 

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
    let deck = [];
    for (let suit of SUITS) {
        for (let value of VALUES) {
            let weight = parseInt(value);
            if (value === 'J' || value === 'Q' || value === 'K') weight = 10;
            if (value === 'A') weight = 11;
            deck.push({ suit, value, weight });
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

function calculateScore(hand) {
    let score = 0;
    let aces = 0;
    for (let card of hand) {
        score += card.weight;
        if (card.value === 'A') aces += 1;
    }
    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }
    return score;
}

export default {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play a game of Blackjack!')
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

        const currentBalance = await getBalance(client, guildId, userId);
        if (currentBalance < bet) {
            return InteractionHelper.safeEditReply(interaction, { content: `❌ You don't have enough coins! Your balance is **${currentBalance}**.` });
        }

        await removeBalance(client, guildId, userId, bet);

        let deck = createDeck();
        let playerHand = [deck.pop(), deck.pop()];
        let dealerHand = [deck.pop(), deck.pop()];

        const generateEmbed = (hideDealerCard = true, status = 'Playing') => {
            const playerScore = calculateScore(playerHand);
            const dealerScore = hideDealerCard ? dealerHand[0].weight : calculateScore(dealerHand);
            
            const playerString = playerHand.map(c => `\`${c.value}${c.suit}\``).join(' ');
            const dealerString = hideDealerCard ? `\`${dealerHand[0].value}${dealerHand[0].suit}\` \`? \`` : dealerHand.map(c => `\`${c.value}${c.suit}\``).join(' ');

            let color = '#3498db'; // Playing
            if (status.includes('Win') || status.includes('Blackjack')) color = '#2ecc71';
            if (status.includes('Lost') || status.includes('Bust')) color = '#e74c3c';
            if (status.includes('Tie')) color = '#f1c40f';

            return new EmbedBuilder()
                .setTitle('🃏 Blackjack')
                .setColor(color)
                .setDescription(`**Bet:** 🪙 ${bet}\n**Status:** ${status}`)
                .addFields(
                    { name: `Dealer's Hand (${dealerScore})`, value: dealerString, inline: true },
                    { name: `Your Hand (${playerScore})`, value: playerString, inline: true }
                )
                .setFooter({ text: `${interaction.user.username}'s game` });
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Secondary)
        );

        // Check for instant Blackjack
        if (calculateScore(playerHand) === 21) {
            const winnings = Math.floor(bet * 2.5);
            await addBalance(client, guildId, userId, winnings);
            return InteractionHelper.safeEditReply(interaction, { embeds: [generateEmbed(false, `🎉 Blackjack! You won **🪙 ${winnings}**!`)], components: [] });
        }

        const message = await InteractionHelper.safeEditReply(interaction, { embeds: [generateEmbed()], components: [row] });

        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== userId) return i.reply({ content: "This isn't your game!", ephemeral: true });

            if (i.customId === 'hit') {
                playerHand.push(deck.pop());
                if (calculateScore(playerHand) > 21) {
                    collector.stop('bust');
                } else {
                    await i.update({ embeds: [generateEmbed()], components: [row] });
                }
            } else if (i.customId === 'stand') {
                collector.stop('stand');
            }
        });

        collector.on('end', async (collected, reason) => {
            let status = '';
            let winnings = 0;

            if (reason === 'bust') {
                status = '❌ You Busted! You lost your bet.';
            } else {
                // Dealer AI logic
                while (calculateScore(dealerHand) < 17) {
                    dealerHand.push(deck.pop());
                }

                const pScore = calculateScore(playerHand);
                const dScore = calculateScore(dealerHand);

                if (dScore > 21 || pScore > dScore) {
                    status = `🎉 You Won **🪙 ${bet * 2}**!`;
                    winnings = bet * 2;
                } else if (pScore === dScore) {
                    status = `🤝 Push (Tie). Your bet was returned.`;
                    winnings = bet;
                } else {
                    status = `❌ Dealer Wins. You lost your bet.`;
                }
            }

            if (winnings > 0) {
                await addBalance(client, guildId, userId, winnings);
            }

            // Disable buttons and show final hands
            row.components.forEach(c => c.setDisabled(true));
            await interaction.editReply({ embeds: [generateEmbed(false, status)], components: [row] });
        });
    }
};
