import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData } from '../../utils/economy.js';

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
        try {
            await InteractionHelper.safeDefer(interaction);
            const bet = interaction.options.getInteger('bet');
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            // Check Balance
            const userData = await getEconomyData(client, guildId, userId);
            const currentBalance = userData.wallet || 0;

            if (currentBalance < bet) {
                return InteractionHelper.safeEditReply(interaction, { content: `❌ You don't have enough cash! Your wallet balance is **$${currentBalance.toLocaleString()}**.` });
            }

            // Deduct bet
            await EconomyService.removeMoney(client, guildId, userId, bet, 'Blackjack Bet');

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
                    .setDescription(`**Bet:** $${bet.toLocaleString()}\n**Status:** ${status}`)
                    .addFields(
                        { name: `Dealer's Hand (${dealerScore})`, value: dealerString, inline: true },
                        { name: `Your Hand (${playerScore})`, value: playerString, inline: true }
                    )
                    .setFooter({ text: `${interaction.user.username}'s game` });
            };

            // Instant Blackjack Check
            if (calculateScore(playerHand) === 21) {
                const winnings = Math.floor(bet * 2.5);
                await EconomyService.addMoney(client, guildId, userId, winnings, 'Blackjack Win (Natural)');
                return InteractionHelper.safeEditReply(interaction, { embeds: [generateEmbed(false, `🎉 Blackjack! You won **$${winnings.toLocaleString()}**!`)], components: [] });
            }

            // Unique IDs so buttons don't overlap if multiple people play
            const hitId = `bj_hit_${interaction.id}`;
            const standId = `bj_stand_${interaction.id}`;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(hitId).setLabel('Hit').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(standId).setLabel('Stand').setStyle(ButtonStyle.Secondary)
            );

            // Send the UI
            await InteractionHelper.safeEditReply(interaction, { embeds: [generateEmbed()], components: [row] });
            
            // Fetch the message manually so Discord.js knows where to attach the button listener
            const replyMessage = await interaction.fetchReply();

            const collector = replyMessage.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

            collector.on('collect', async i => {
                if (i.user.id !== userId) return i.reply({ content: "This isn't your game!", ephemeral: true });

                if (i.customId === hitId) {
                    playerHand.push(deck.pop());
                    if (calculateScore(playerHand) > 21) {
                        // FIX: Acknowledge the hit that busted you
                        await i.deferUpdate(); 
                        collector.stop('bust');
                    } else {
                        await i.update({ embeds: [generateEmbed()], components: [row] });
                    }
                } else if (i.customId === standId) {
                    // FIX: Acknowledge the stand button click!
                    await i.deferUpdate(); 
                    collector.stop('stand');
                }
            });

            collector.on('end', async (collected, reason) => {
                let status = '';
                let winnings = 0;

                if (reason === 'bust') {
                    status = '❌ You Busted! You lost your bet.';
                } else if (reason === 'time') {
                    status = '❌ Game timed out. You folded and lost your bet.';
                } else {
                    // Dealer AI logic
                    while (calculateScore(dealerHand) < 17) {
                        dealerHand.push(deck.pop());
                    }

                    const pScore = calculateScore(playerHand);
                    const dScore = calculateScore(dealerHand);

                    if (dScore > 21 || pScore > dScore) {
                        status = `🎉 You Won **$${(bet * 2).toLocaleString()}**!`;
                        winnings = bet * 2;
                    } else if (pScore === dScore) {
                        status = `🤝 Push (Tie). Your bet was returned.`;
                        winnings = bet;
                    } else {
                        status = `❌ Dealer Wins. You lost your bet.`;
                    }
                }

                if (winnings > 0) {
                    await EconomyService.addMoney(client, guildId, userId, winnings, 'Blackjack Win');
                }

                // Disable buttons and show final hands
                row.components.forEach(c => c.setDisabled(true));
                await interaction.editReply({ embeds: [generateEmbed(false, status)], components: [row] });
            });

        } catch (error) {
            logger.error('Blackjack command error:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'blackjack'
            });
        }
    }
};
