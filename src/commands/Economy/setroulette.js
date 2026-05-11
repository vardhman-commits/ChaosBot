import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData } from '../../utils/economy.js';

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const activeRouletteServers = new Set();

// Global memory for spin history (Allows /roulettestats to read it)
export const globalSpinHistory = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('setroulette')
        .setDescription('Starts a 24/7 Automated Roulette dealer in this channel')
        .setDefaultMemberPermissions(8),
    category: 'Economy',

    async execute(interaction, config, client) {
        if (activeRouletteServers.has(interaction.guildId)) {
            return interaction.reply({ content: '❌ A 24/7 Roulette dealer is already running in this server!', ephemeral: true });
        }

        activeRouletteServers.add(interaction.guildId);
        
        // Initialize an empty history array for this server if it doesn't exist yet
        if (!globalSpinHistory.has(interaction.guildId)) {
            globalSpinHistory.set(interaction.guildId, []);
        }

        await interaction.reply({ content: '✅ **24/7 Roulette Dealer Activated!** Starting the first round now...', ephemeral: true });
        runRouletteLoop(interaction.channel, client, interaction.guildId);
    }
};

function formatHistory(history) {
    if (history.length === 0) return "*No spins yet. The table is fresh!*";
    const recentSpins = history.slice(-15);
    return recentSpins.map(num => {
        if (num === 0) return '🟢**0**';
        return RED_NUMBERS.includes(num) ? `🔴**${num}**` : `⚫**${num}**`;
    }).join(' ┃ ');
}

async function runRouletteLoop(channel, client, guildId) {
    while (activeRouletteServers.has(guildId)) {
        try {
            let currentBets = [];
            let spinHistory = globalSpinHistory.get(guildId);

            // ==========================================
            // PHASE 1: BETTING OPEN
            // ==========================================
            const tableArt = `
🟢 **0**
🔴 **1** ┃ ⚫ **2** ┃ 🔴 **3** | *1st 12*
⚫ **4** ┃ 🔴 **5** ┃ ⚫ **6** |
🔴 **7** ┃ ⚫ **8** ┃ 🔴 **9** |
⚫ **10**┃ ⚫ **11**┃ 🔴 **12** |
⚫ **13**┃ 🔴 **14**┃ ⚫ **15** | *2nd 12*
🔴 **16**┃ ⚫ **17**┃ 🔴 **18** |
🔴 **19**┃ ⚫ **20**┃ 🔴 **21** |
⚫ **22**┃ 🔴 **23**┃ ⚫ **24** |
🔴 **25**┃ ⚫ **26**┃ 🔴 **27** | *3rd 12*
⚫ **28**┃ ⚫ **29**┃ 🔴 **30** |
⚫ **31**┃ 🔴 **32**┃ ⚫ **33** |
🔴 **34**┃ ⚫ **35**┃ 🔴 **36** |
*Col1* *Col2* *Col3*
            `;

            const betEmbed = new EmbedBuilder()
                .setTitle('🎰 LIVE DEALER ROULETTE 🎰')
                .setColor('#2ecc71')
                .setDescription(`**Betting is OPEN!** You have **1 Minute** to place your bets.\nClick the button below to play.`)
                .addFields(
                    { name: '🔄 Recent Spins', value: formatHistory(spinHistory), inline: false },
                    { name: 'Roulette Board', value: tableArt, inline: false },
                    { name: '🔴 Red / ⚫ Black', value: 'Payout: **1:1**', inline: true },
                    { name: '🔵 Even / 🟡 Odd', value: 'Payout: **1:1**', inline: true },
                    { name: '⬇️ Low(1-18) / ⬆️ High(19-36)', value: 'Payout: **1:1**', inline: true },
                    { name: '📦 Dozens (1-12, 13-24, 25-36)', value: 'Payout: **2:1**', inline: true },
                    { name: '🏛️ Columns (col1, col2, col3)', value: 'Payout: **2:1**', inline: true },
                    { name: '🔢 Specific Number (0-36)', value: 'Payout: **35:1**', inline: true }
                )
                .setFooter({ text: `The Dealer is waiting for bets... • Total Server Spins: ${spinHistory.length}` });

            const betButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('place_bet').setLabel('💰 Place Your Bet').setStyle(ButtonStyle.Success)
            );

            const gameMessage = await channel.send({ embeds: [betEmbed], components: [betButton] });
            const collector = gameMessage.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'place_bet') {
                    const modal = new ModalBuilder()
                        .setCustomId(`bet_modal_${i.id}`)
                        .setTitle('Roulette Betting Table');

                    const betTypeInput = new TextInputBuilder()
                        .setCustomId('bet_type')
                        .setLabel("What are you betting on?")
                        .setPlaceholder("Red, Black, Even, Odd, 1-18, 19-36, col1, 1-12...")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    const betAmountInput = new TextInputBuilder()
                        .setCustomId('bet_amount')
                        .setLabel("How much cash?")
                        .setPlaceholder("e.g. 500")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(betTypeInput), new ActionRowBuilder().addComponents(betAmountInput));
                    await i.showModal(modal);

                    try {
                        const modalSubmit = await i.awaitModalSubmit({ filter: (mi) => mi.customId === `bet_modal_${i.id}` && mi.user.id === i.user.id, time: 45000 });
                        const rawType = modalSubmit.fields.getTextInputValue('bet_type').toLowerCase().replace(/\s/g, '');
                        const rawAmount = parseInt(modalSubmit.fields.getTextInputValue('bet_amount'));

                        if (isNaN(rawAmount) || rawAmount <= 0) return modalSubmit.reply({ content: '❌ Invalid bet amount!', ephemeral: true });

                        const userData = await getEconomyData(client, guildId, i.user.id);
                        if ((userData.wallet || 0) < rawAmount) return modalSubmit.reply({ content: `❌ Not enough cash! Balance: **$${(userData.wallet || 0).toLocaleString()}**`, ephemeral: true });

                        const validWords = ['red', 'black', 'even', 'odd', '1-18', '19-36', '1-12', '13-24', '25-36', 'col1', 'col2', 'col3'];
                        const isNumber = !isNaN(parseInt(rawType)) && parseInt(rawType) >= 0 && parseInt(rawType) <= 36;
                        
                        if (!validWords.includes(rawType) && !isNumber) {
                            return modalSubmit.reply({ content: "❌ Invalid bet! Use terms like 'red', 'even', '1-18', 'col1', '13-24', or '17'.", ephemeral: true });
                        }

                        await EconomyService.removeMoney(client, guildId, i.user.id, rawAmount, `Roulette Bet: ${rawType}`);
                        currentBets.push({ userId: i.user.id, userTag: i.user.tag, type: rawType, amount: rawAmount });

                        await modalSubmit.reply({ content: `✅ Bet Accepted! **$${rawAmount.toLocaleString()}** on **${rawType.toUpperCase()}**.`, ephemeral: true });
                    } catch (err) { }
                }
            });

            await new Promise(resolve => collector.on('end', resolve));

            // ==========================================
            // PHASE 2: SPINNING
            // ==========================================
            betButton.components[0].setDisabled(true);
            const spinningEmbed = new EmbedBuilder()
                .setTitle('🎰 ROULETTE SPINNING... 🎰')
                .setColor('#f1c40f')
                .setDescription(`**NO MORE BETS!**\n\nThe Dealer is spinning the wheel...\nTotal Bets Placed: **${currentBets.length}**`);

            await gameMessage.edit({ embeds: [spinningEmbed], components: [betButton] });
            await new Promise(resolve => setTimeout(resolve, 8000));

            // ==========================================
            // PHASE 3: PAYOUT
            // ==========================================
            const winningNumber = Math.floor(Math.random() * 37);
            const isRed = RED_NUMBERS.includes(winningNumber);
            const isBlack = winningNumber !== 0 && !isRed;
            const isEven = winningNumber !== 0 && winningNumber % 2 === 0;
            const isOdd = winningNumber !== 0 && winningNumber % 2 !== 0;

            // Save to global history (Keep max 500 spins to prevent memory leaks)
            spinHistory.push(winningNumber);
            if (spinHistory.length > 500) spinHistory.shift();

            let colorEmoji = '🟢'; let colorName = 'Green';
            if (isRed) { colorEmoji = '🔴'; colorName = 'Red'; }
            else if (isBlack) { colorEmoji = '⚫'; colorName = 'Black'; }

            let resultsText = `The ball landed on...\n## ${colorEmoji} ${winningNumber} (${colorName})\n\n`;
            let winners = [];

            for (const bet of currentBets) {
                let won = false; let multiplier = 0;

                // 1:1 Bets
                if (bet.type === 'red' && isRed) { won = true; multiplier = 2; }
                else if (bet.type === 'black' && isBlack) { won = true; multiplier = 2; }
                else if (bet.type === 'even' && isEven) { won = true; multiplier = 2; }
                else if (bet.type === 'odd' && isOdd) { won = true; multiplier = 2; }
                else if (bet.type === '1-18' && winningNumber >= 1 && winningNumber <= 18) { won = true; multiplier = 2; }
                else if (bet.type === '19-36' && winningNumber >= 19 && winningNumber <= 36) { won = true; multiplier = 2; }
                
                // 2:1 Bets (Dozens)
                else if (bet.type === '1-12' && winningNumber >= 1 && winningNumber <= 12) { won = true; multiplier = 3; }
                else if (bet.type === '13-24' && winningNumber >= 13 && winningNumber <= 24) { won = true; multiplier = 3; }
                else if (bet.type === '25-36' && winningNumber >= 25 && winningNumber <= 36) { won = true; multiplier = 3; }
                
                // 2:1 Bets (Columns)
                else if (bet.type === 'col1' && winningNumber !== 0 && winningNumber % 3 === 1) { won = true; multiplier = 3; }
                else if (bet.type === 'col2' && winningNumber !== 0 && winningNumber % 3 === 2) { won = true; multiplier = 3; }
                else if (bet.type === 'col3' && winningNumber !== 0 && winningNumber % 3 === 0) { won = true; multiplier = 3; }
                
                // 35:1 Bets (Straight Up)
                else if (parseInt(bet.type) === winningNumber) { won = true; multiplier = 36; }

                if (won) {
                    const winnings = bet.amount * multiplier;
                    await EconomyService.addMoney(client, guildId, bet.userId, winnings, 'Roulette Winnings');
                    winners.push(`🎉 **${bet.userTag}** won **$${winnings.toLocaleString()}** *(Bet: ${bet.type.toUpperCase()})*`);
                }
            }

            if (winners.length > 0) resultsText += `🏆 **WINNERS:**\n${winners.join('\n')}`;
            else if (currentBets.length > 0) resultsText += `💀 **HOUSE WINS!** No winning bets.`;
            else resultsText += `*No bets were placed this round.*`;

            const resultEmbed = new EmbedBuilder()
                .setTitle(`🎰 ROULETTE RESULT: ${winningNumber} ${colorName} 🎰`)
                .setColor(isRed ? '#e74c3c' : (isBlack ? '#2c3e50' : '#2ecc71'))
                .setDescription(resultsText);

            await gameMessage.edit({ embeds: [resultEmbed], components: [] });
            await new Promise(resolve => setTimeout(resolve, 20000));
            await gameMessage.delete().catch(() => null);

        } catch (error) {
            logger.error('Roulette Loop Error:', error);
            await new Promise(resolve => setTimeout(resolve, 10000)); 
        }
    }
}
