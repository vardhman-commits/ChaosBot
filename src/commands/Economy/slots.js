import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData } from '../../utils/economy.js';

const SLOTS = ['🍒', '🍋', '🍉', '🍇', '🔔', '💎', '🎰'];

// Multipliers for getting 3 in a row
const MULTIPLIERS_3 = { '🍒': 3, '🍋': 4, '🍉': 5, '🍇': 7, '🔔': 10, '💎': 20, '🎰': 50 };
// Multipliers for getting 2 in a row (get money back + a little extra)
const MULTIPLIERS_2 = { '🍒': 1, '🍋': 1.5, '🍉': 1.5, '🍇': 2, '🔔': 2, '💎': 3, '🎰': 5 }; 

// Helper function to create a delay
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function generateGrid() {
    return Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => SLOTS[Math.floor(Math.random() * SLOTS.length)])
    );
}

function renderGrid(grid) {
    return `⬛⬛⬛⬛⬛⬛⬛\n⬛ ${grid[0][0]} ┃ ${grid[0][1]} ┃ ${grid[0][2]} ⬛\n🟥 ${grid[1][0]} ┃ ${grid[1][1]} ┃ ${grid[1][2]} 🟥 ⬅️\n⬛ ${grid[2][0]} ┃ ${grid[2][1]} ┃ ${grid[2][2]} ⬛\n⬛⬛⬛⬛⬛⬛⬛`;
}

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
        try {
            await InteractionHelper.safeDefer(interaction);
            const bet = interaction.options.getInteger('bet');
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            // Define the recursive game logic so the button can run it
            async function play(i, isFirstTime) {
                try {
                    // If it's a button click, we need to acknowledge it
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
                    await EconomyService.removeMoney(client, guildId, userId, bet, 'Slots Bet');

                    // 3. Animation Frame (Spinning)
                    const spinEmbed = new EmbedBuilder()
                        .setTitle('🎰 Slot Machine 🎰')
                        .setColor('#f1c40f')
                        .setDescription(`**Bet:** $${bet.toLocaleString()}\n\n*Spinning the reels...*\n\n${renderGrid(generateGrid())}`)
                        .setFooter({ text: `${interaction.user.username}'s game` });

                    let message;
                    if (isFirstTime) {
                        await InteractionHelper.safeEditReply(i, { embeds: [spinEmbed], components: [] });
                        message = await i.fetchReply();
                    } else {
                        await i.editReply({ embeds: [spinEmbed], components: [] });
                        message = i.message;
                    }

                    // Wait 1.5 seconds to simulate the reels spinning
                    await wait(1500);

                    // 4. Calculate Final Grid
                    const finalGrid = generateGrid();
                    
                    // Rig the game in the player's favor (50% chance to force at least a small win)
                    if (Math.random() < 0.5) {
                        const symbol = SLOTS[Math.floor(Math.random() * (SLOTS.length - 2))]; 
                        finalGrid[1][0] = symbol;
                        finalGrid[1][1] = symbol; // Guarantee 2 matching
                        // 30% chance to upgrade the rig to a 3-match jackpot
                        if (Math.random() < 0.3) {
                            finalGrid[1][2] = symbol;
                        }
                    }

                    const resultRow = finalGrid[1];
                    const isWin3 = resultRow[0] === resultRow[1] && resultRow[1] === resultRow[2];
                    const isWin2 = !isWin3 && (resultRow[0] === resultRow[1] || resultRow[1] === resultRow[2]);
                    
                    let winningSymbol = null;
                    let winnings = 0;
                    let resultText = '❌ You lost your bet.';
                    let embedColor = '#e74c3c'; // Red

                    if (isWin3) {
                        winningSymbol = resultRow[0];
                        winnings = Math.floor(bet * MULTIPLIERS_3[winningSymbol]);
                        resultText = `🎉 **JACKPOT! (3 Matches)** You won **$${winnings.toLocaleString()}**!`;
                        embedColor = '#f1c40f'; // Gold
                    } else if (isWin2) {
                        winningSymbol = resultRow[0] === resultRow[1] ? resultRow[0] : resultRow[1];
                        winnings = Math.floor(bet * MULTIPLIERS_2[winningSymbol]);
                        resultText = `✅ **Small Win! (2 Matches)** You won **$${winnings.toLocaleString()}**!`;
                        embedColor = '#2ecc71'; // Green
                    }

                    // Add winnings to database
                    if (winnings > 0) {
                        await EconomyService.addMoney(client, guildId, userId, winnings, 'Slots Winnings');
                    }

                    // 5. Final Display & Button
                    const finalEmbed = new EmbedBuilder()
                        .setTitle('🎰 Slot Machine 🎰')
                        .setColor(embedColor)
                        .setDescription(`**Bet:** $${bet.toLocaleString()}\n\n${renderGrid(finalGrid)}\n\n${resultText}`)
                        .setFooter({ text: `${interaction.user.username}'s game` });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('spin_again')
                            .setLabel(`Spin Again ($${bet})`)
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🔁')
                    );

                    await i.editReply({ embeds: [finalEmbed], components: [row] });

                    // 6. Handle the "Spin Again" Button Click
                    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                    collector.on('collect', async btnInt => {
                        // Prevent other people from clicking your button
                        if (btnInt.user.id !== userId) {
                            return btnInt.reply({ content: "This isn't your machine! Use `/slots` to play.", ephemeral: true });
                        }
                        
                        // Stop the current collector and start a brand new game
                        collector.stop('replayed');
                        play(btnInt, false); 
                    });

                    // If they don't click it within 60 seconds, disable the button
                    collector.on('end', (_, reason) => {
                        if (reason !== 'replayed') {
                            row.components.forEach(c => c.setDisabled(true));
                            i.editReply({ components: [row] }).catch(() => null);
                        }
                    });

                } catch (err) {
                    logger.error('Slots play loop error:', err);
                    const errMsg = { content: "An error occurred during the game. Please try again." };
                    if (!isFirstTime) i.followUp(errMsg).catch(()=>null);
                    else InteractionHelper.safeEditReply(i, errMsg).catch(()=>null);
                }
            }

            // Start the very first game when they use the slash command
            await play(interaction, true);

        } catch (error) {
            logger.error('Slots command error:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'slots'
            });
        }
    }
};
