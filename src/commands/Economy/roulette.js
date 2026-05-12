import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData } from '../../utils/economy.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import db from '../../utils/database.js';

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

// Global Memory 
const activeRouletteServers = new Set();
const globalSpinHistory = new Map();

// --- LIVE TABLE ANALYTICS ENGINE ---
function getTableStats(history) {
    const data = history.slice(-100); 
    
    if (data.length === 0) {
        return {
            breakdown: "No data yet.",
            hot: "N/A", 
            cold: "N/A",
            historyString: "*No spins recorded yet. The table is fresh!*"
        };
    }

    let r = 0, b = 0, g = 0;
    let freq = {};
    
    data.forEach(num => {
        if (num === 0) g++;
        else if (RED_NUMBERS.includes(num)) r++;
        else b++;
        freq[num] = (freq[num] || 0) + 1;
    });

    const total = data.length;
    const rPct = ((r/total)*100).toFixed(1);
    const bPct = ((b/total)*100).toFixed(1);
    const gPct = ((g/total)*100).toFixed(1);

    const breakdown = `🔴 **Red:** ${r} (${rPct}%)\n⚫ **Black:** ${b} (${bPct}%)\n🟢 **Green:** ${g} (${gPct}%)`;

    const sorted = Object.entries(freq).sort((a,b) => b[1] - a[1]);
    const hot = sorted.slice(0, 5).map(x => `**${x[0]}**`).join(', ') || "N/A";
    
    const allNums = Array.from({length:37}, (_,i) => i);
    const cold = allNums.map(n => [n, freq[n]||0]).sort((a,b) => a[1]-b[1]).slice(0,5).map(x => `**${x[0]}**`).join(', ');

    const historyString = data.map(num => {
        if (num === 0) return '🟢0';
        return RED_NUMBERS.includes(num) ? `🔴${num}` : `⚫${num}`;
    }).join(' ');

    return { breakdown, hot, cold, historyString };
}

// --- BOOT PROCESS: WAKE UP THE DEALERS ---
export async function startPersistentRoulettes(client) {
    try {
        const query = `SELECT guild_id, config FROM guild_configs WHERE config->>'rouletteChannel' IS NOT NULL;`;
        const result = await db.query(query);

        for (const row of result.rows) {
            const guildId = row.guild_id;
            const channelId = row.config.rouletteChannel;

            if (channelId && !activeRouletteServers.has(guildId)) {
                try {
                    const channel = await client.channels.fetch(channelId);
                    if (channel) {
                        activeRouletteServers.add(guildId);
                        globalSpinHistory.set(guildId, []);
                        logger.info(`Starting persistent 24/7 Roulette in guild ${guildId}`);
                        
                        // Fire and forget
                        runRouletteLoop(channel, client, guildId);
                    }
                } catch (e) {
                    logger.warn(`Could not start Roulette for guild ${guildId} - Channel ${channelId} missing or inaccessible.`);
                }
            }
        }
    } catch (error) {
        logger.error('Failed to load persistent roulettes on boot:', error);
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Play the 24/7 Automated Roulette or check table statistics.')
        
        // --- SUBCOMMAND: SETCHANNEL ---
        .addSubcommand(sub =>
            sub.setName('setchannel')
            .setDescription('ADMIN ONLY: Set the channel for the 24/7 Automated Roulette dealer.')
            .addChannelOption(option => 
                option.setName('channel')
                .setDescription('The channel to run Roulette in (Leave blank to disable)')
                .setRequired(false)
            )
        )
        
        // --- SUBCOMMAND: STATS ---
        .addSubcommand(sub =>
            sub.setName('stats')
            .setDescription('View advanced statistics for the active Roulette table')
            .addIntegerOption(option => 
                option.setName('spins')
                    .setDescription('How many past spins to analyze')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Last 100 Spins', value: 100 },
                        { name: 'Last 200 Spins', value: 200 },
                        { name: 'Last 500 Spins', value: 500 }
                    )
            )
        ),
    category: 'Economy',

    async execute(interaction, config, client) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        // ==========================================
        //         ADMIN: SET ROULETTE CHANNEL
        // ==========================================
        if (sub === 'setchannel') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ **Access Denied.** You must be a server Administrator to configure the dealer.', ephemeral: true });
            }

            const channel = interaction.options.getChannel('channel');

            // DISABLING
            if (!channel) {
                await updateGuildConfig(client, guildId, { rouletteChannel: null });
                activeRouletteServers.delete(guildId);
                globalSpinHistory.delete(guildId);
                return interaction.reply({ content: '🛑 **Roulette Disabled.** The dealer will finish their current spin and leave the server.', ephemeral: true });
            }

            // ENABLING / CHANGING
            if (channel.type !== 0) { // Text Channel
                return interaction.reply({ content: '❌ Please select a standard Text Channel.', ephemeral: true });
            }

            // Save to DB
            await updateGuildConfig(client, guildId, { rouletteChannel: channel.id });

            // If it's already running somewhere else, stop it first
            if (activeRouletteServers.has(guildId)) {
                activeRouletteServers.delete(guildId);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause to kill the old loop
            }

            // Start the new loop
            activeRouletteServers.add(guildId);
            if (!globalSpinHistory.has(guildId)) globalSpinHistory.set(guildId, []);

            await interaction.reply({ content: `✅ **24/7 Roulette Dealer Activated!** The dealer is setting up the table in <#${channel.id}>...`, ephemeral: true });
            runRouletteLoop(channel, client, guildId);
        }

        // ==========================================
        //         PLAYER: TABLE STATS
        // ==========================================
        if (sub === 'stats') {
            await interaction.deferReply({ ephemeral: true }).catch(() => null);

            const serverHistory = globalSpinHistory.get(guildId);
            
            if (!serverHistory || serverHistory.length === 0) {
                return InteractionHelper.safeEditReply(interaction, { content: '❌ There is no active Roulette game, or no spins have been recorded yet!' });
            }

            const requestedSpins = interaction.options.getInteger('spins');
            const dataToAnalyze = serverHistory.slice(-requestedSpins);
            const actualSpinCount = dataToAnalyze.length;

            let redCount = 0; let blackCount = 0; let greenCount = 0;
            let evenCount = 0; let oddCount = 0;
            const numberFrequency = {};
            const individualSpinsLog = []; 

            for (const num of dataToAnalyze) {
                if (num === 0) {
                    greenCount++; individualSpinsLog.push('🟢0');
                } else if (RED_NUMBERS.includes(num)) {
                    redCount++; individualSpinsLog.push(`🔴${num}`);
                } else {
                    blackCount++; individualSpinsLog.push(`⚫${num}`);
                }

                if (num !== 0 && num % 2 === 0) evenCount++;
                else if (num !== 0 && num % 2 !== 0) oddCount++;

                numberFrequency[num] = (numberFrequency[num] || 0) + 1;
            }

            const redPct = ((redCount / actualSpinCount) * 100).toFixed(1);
            const blackPct = ((blackCount / actualSpinCount) * 100).toFixed(1);
            const greenPct = ((greenCount / actualSpinCount) * 100).toFixed(1);

            const sortedNumbers = Object.entries(numberFrequency).sort((a, b) => b[1] - a[1]);
            const hotNumbers = sortedNumbers.slice(0, 5).map(([num, count]) => `**${num}** (${count}x)`).join(', ') || 'N/A';
            
            const allNumbers = Array.from({length: 37}, (_, i) => i);
            const coldNumbers = allNumbers
                .map(num => [num, numberFrequency[num] || 0])
                .sort((a, b) => a[1] - b[1])
                .slice(0, 5)
                .map(([num, count]) => `**${num}** (${count}x)`).join(', ');

            const historyBlock = individualSpinsLog.join(' ');

            const embed = new EmbedBuilder()
                .setTitle(`📊 Roulette Analytics (Last ${actualSpinCount} Spins)`)
                .setColor('#3498db')
                .setDescription(`**Individual Spin Log (Oldest ➡️ Newest):**\n\n${historyBlock}`)
                .addFields(
                    { name: 'Color Breakdown', value: `🔴 **Red:** ${redCount} (${redPct}%)\n⚫ **Black:** ${blackCount} (${blackPct}%)\n🟢 **Green:** ${greenCount} (${greenPct}%)`, inline: true },
                    { name: 'Odd / Even', value: `🟡 **Odd:** ${oddCount}\n🔵 **Even:** ${evenCount}`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }, 
                    { name: '🔥 Hot Numbers', value: hotNumbers, inline: false },
                    { name: '🧊 Cold Numbers', value: coldNumbers, inline: false }
                )
                .setFooter({ text: 'Data resets when the bot restarts.' });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }
};

// ==========================================
//      AUTOMATED ROULETTE ENGINE LOOP
// ==========================================
async function runRouletteLoop(channel, client, guildId) {
    while (activeRouletteServers.has(guildId)) {
        try {
            // Safety check: Has the admin turned off the module mid-spin?
            const currentConfig = await getGuildConfig(client, guildId);
            if (currentConfig.rouletteChannel !== channel.id) {
                activeRouletteServers.delete(guildId);
                break;
            }

            let currentBets = [];
            let spinHistory = globalSpinHistory.get(guildId);
            const stats = getTableStats(spinHistory);

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
*Col1* *Col2* *Col3*`;

            const betEmbed = new EmbedBuilder()
                .setTitle('🎰 LIVE DEALER ROULETTE 🎰')
                .setColor('#2ecc71')
                .setDescription(`**Betting is OPEN!** You have **1 Minute** to place your bets.\nClick the button below to play.`)
                .addFields(
                    { name: '📊 Last 100 Spins Analytics', value: stats.breakdown, inline: true },
                    { name: '🔥 Hot Numbers', value: stats.hot, inline: true },
                    { name: '🧊 Cold Numbers', value: stats.cold, inline: true },
                    { name: `📜 Spin History (Last ${Math.min(spinHistory.length, 100)})`, value: stats.historyString, inline: false },
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

            // Stop loop cleanly if it was disabled mid-betting phase
            if (!activeRouletteServers.has(guildId)) break;

            betButton.components[0].setDisabled(true);
            const spinningEmbed = new EmbedBuilder()
                .setTitle('🎰 ROULETTE SPINNING... 🎰')
                .setColor('#f1c40f')
                .setDescription(`**NO MORE BETS!**\n\nThe Dealer is spinning the wheel...\nTotal Bets Placed: **${currentBets.length}**`);

            await gameMessage.edit({ embeds: [spinningEmbed], components: [betButton] });
            await new Promise(resolve => setTimeout(resolve, 8000));

            const winningNumber = Math.floor(Math.random() * 37);
            const isRed = RED_NUMBERS.includes(winningNumber);
            const isBlack = winningNumber !== 0 && !isRed;
            const isEven = winningNumber !== 0 && winningNumber % 2 === 0;
            const isOdd = winningNumber !== 0 && winningNumber % 2 !== 0;

            spinHistory.push(winningNumber);
            if (spinHistory.length > 500) spinHistory.shift();

            let colorEmoji = '🟢'; let colorName = 'Green';
            if (isRed) { colorEmoji = '🔴'; colorName = 'Red'; }
            else if (isBlack) { colorEmoji = '⚫'; colorName = 'Black'; }

            let resultsText = `The ball landed on...\n## ${colorEmoji} ${winningNumber} (${colorName})\n\n`;
            let winners = [];

            for (const bet of currentBets) {
                let won = false; let multiplier = 0;

                if (bet.type === 'red' && isRed) { won = true; multiplier = 2; }
                else if (bet.type === 'black' && isBlack) { won = true; multiplier = 2; }
                else if (bet.type === 'even' && isEven) { won = true; multiplier = 2; }
                else if (bet.type === 'odd' && isOdd) { won = true; multiplier = 2; }
                else if (bet.type === '1-18' && winningNumber >= 1 && winningNumber <= 18) { won = true; multiplier = 2; }
                else if (bet.type === '19-36' && winningNumber >= 19 && winningNumber <= 36) { won = true; multiplier = 2; }
                else if (bet.type === '1-12' && winningNumber >= 1 && winningNumber <= 12) { won = true; multiplier = 3; }
                else if (bet.type === '13-24' && winningNumber >= 13 && winningNumber <= 24) { won = true; multiplier = 3; }
                else if (bet.type === '25-36' && winningNumber >= 25 && winningNumber <= 36) { won = true; multiplier = 3; }
                else if (bet.type === 'col1' && winningNumber !== 0 && winningNumber % 3 === 1) { won = true; multiplier = 3; }
                else if (bet.type === 'col2' && winningNumber !== 0 && winningNumber % 3 === 2) { won = true; multiplier = 3; }
                else if (bet.type === 'col3' && winningNumber !== 0 && winningNumber % 3 === 0) { won = true; multiplier = 3; }
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
