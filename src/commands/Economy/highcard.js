import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData } from '../../utils/economy.js';

// Helper for animations
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = [
    { name: '2', weight: 2 }, { name: '3', weight: 3 }, { name: '4', weight: 4 },
    { name: '5', weight: 5 }, { name: '6', weight: 6 }, { name: '7', weight: 7 },
    { name: '8', weight: 8 }, { name: '9', weight: 9 }, { name: '10', weight: 10 },
    { name: 'J', weight: 11 }, { name: 'Q', weight: 12 }, { name: 'K', weight: 13 },
    { name: 'A', weight: 14 }
];

function drawCard() {
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    const value = VALUES[Math.floor(Math.random() * VALUES.length)];
    return { ...value, suit };
}

// Uses Discord's Heading 2 (##) to make the cards appear huge and bold
function formatCard(card, hidden = false) {
    if (hidden) return `## ❓ 🃏`;
    
    // Add a colored square based on the suit
    const colorBlock = (card.suit === '♥️' || card.suit === '♦️') ? '🟥' : '⬛';
    return `## ${colorBlock} ${card.name}${card.suit}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('highcard')
        .setDescription('Play a game of High Card against the Dealer!')
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

            // Define the recursive game logic for the Play Again button
            async function play(i, isFirstTime) {
                try {
                    if (!isFirstTime) {
                        await i.deferUpdate();
                    }

                    // 1. Check Balance
                    const userData = await getEconomyData(client, guildId, userId);
                    const currentBalance = userData.wallet || 0;

                    if (currentBalance < bet) {
                        const errContent = `❌ You don't have enough cash! Your wallet balance is **$${currentBalance.toLocaleString()}**.`;
                        if (!isFirstTime) return i.followUp({ content: errContent, ephemeral: true });
                        return InteractionHelper.safeEditReply(i, { content: errContent });
                    }

                    // 2. Deduct Bet
                    await EconomyService.removeMoney(client, guildId, userId, bet, 'High Card Bet');

                    // 3. Draw Cards
                    const playerCard = drawCard();
                    const dealerCard = drawCard();

                    // 4. Animation Frame (Dealer card hidden)
                    const drawingEmbed = new EmbedBuilder()
                        .setTitle('🃏 High Card Game')
                        .setColor('#3498db')
                        .setDescription(`**Bet:** $${bet.toLocaleString()}\n\n*The Dealer is drawing cards...*`)
                        .addFields(
                            { name: '🤖 Dealer\'s Card', value: formatCard(null, true), inline: true },
                            { name: '👤 Your Card', value: formatCard(playerCard), inline: true }
                        )
                        .setFooter({ text: `${interaction.user.username}'s game` });

                    let message;
                    if (isFirstTime) {
                        await InteractionHelper.safeEditReply(i, { embeds: [drawingEmbed], components: [] });
                        message = await i.fetchReply();
                    } else {
                        await i.editReply({ embeds: [drawingEmbed], components: [] });
                        message = i.message;
                    }

                    // Wait 1.5 seconds for suspense
                    await wait(1500);

                    // 5. Calculate Winner
                    let status = '';
                    let embedColor = '#3498db';
                    let winnings = 0;

                    if (playerCard.weight > dealerCard.weight) {
                        winnings = bet * 2;
                        status = `🎉 **YOU WON!** Your card is higher.\n**+$${winnings.toLocaleString()}**`;
                        embedColor = '#2ecc71'; // Green
                    } else if (playerCard.weight < dealerCard.weight) {
                        status = `❌ **YOU LOST!** The dealer's card is higher.`;
                        embedColor = '#e74c3c'; // Red
                    } else {
                        winnings = bet; // Return the original bet
                        status = `🤝 **PUSH (TIE)!** Both cards match exactly.\n*Your bet was returned.*`;
                        embedColor = '#f1c40f'; // Yellow
                    }

                    // Pay the user if they won or pushed
                    if (winnings > 0) {
                        await EconomyService.addMoney(client, guildId, userId, winnings, 'High Card Winnings');
                    }

                    // 6. Final Reveal Frame
                    const finalEmbed = new EmbedBuilder()
                        .setTitle('🃏 High Card Game')
                        .setColor(embedColor)
                        .setDescription(`**Bet:** $${bet.toLocaleString()}\n\n${status}`)
                        .addFields(
                            { name: '🤖 Dealer\'s Card', value: formatCard(dealerCard), inline: true },
                            { name: '👤 Your Card', value: formatCard(playerCard), inline: true }
                        )
                        .setFooter({ text: `${interaction.user.username}'s game` });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('play_again_highcard')
                            .setLabel(`Play Again ($${bet})`)
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🔁')
                    );

                    await i.editReply({ embeds: [finalEmbed], components: [row] });

                    // 7. Handle the "Play Again" Button
                    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                    collector.on('collect', async btnInt => {
                        if (btnInt.user.id !== userId) {
                            return btnInt.reply({ content: "This isn't your game! Use `/highcard` to play.", ephemeral: true });
                        }
                        collector.stop('replayed');
                        play(btnInt, false); 
                    });

                    // Disable the button if 60 seconds pass with no clicks
                    collector.on('end', (_, reason) => {
                        if (reason !== 'replayed') {
                            row.components.forEach(c => c.setDisabled(true));
                            i.editReply({ components: [row] }).catch(() => null);
                        }
                    });

                } catch (err) {
                    logger.error('HighCard play loop error:', err);
                    const errMsg = { content: "An error occurred during the game. Please try again." };
                    if (!isFirstTime) i.followUp(errMsg).catch(()=>null);
                    else InteractionHelper.safeEditReply(i, errMsg).catch(()=>null);
                }
            }

            // Start the first game!
            await play(interaction, true);

        } catch (error) {
            logger.error('HighCard command error:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'highcard'
            });
        }
    }
};
