import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData } from '../../utils/economy.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { db } from '../../utils/database.js';

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

// Global Memory 
const activeRouletteServers = new Set();
const globalSpinHistory = new Map();

// The dashboard reads this map to sync the UI!
export const liveRouletteState = new Map(); 

// --- LIVE TABLE ANALYTICS ENGINE ---
function getTableStats(history) {
    const data = history.slice(-100); 
    
    if (data.length === 0) {
        return {
            breakdown: "No data yet.", oddEven: "N/A", lowHigh: "N/A", dozens: "N/A", columns: "N/A",
            hot: "N/A", cold: "N/A", historyString: "*No spins recorded yet. The table is fresh!*"
        };
    }

    let r = 0, b = 0, g = 0;
    let odd = 0, even = 0;
    let low = 0, high = 0;
    let d1 = 0, d2 = 0, d3 = 0;
    let c1 = 0, c2 = 0, c3 = 0;
    let freq = {};
    
    data.forEach(num => {
        if (num === 0) g++;
        else if (RED_NUMBERS.includes(num)) r++;
        else b++;

        if (num !== 0 && num % 2 === 0) even++;
        else if (num !== 0 && num % 2 !== 0) odd++;

        if (num >= 1 && num <= 18) low++;
        else if (num >= 19 && num <= 36) high++;

        if (num >= 1 && num <= 12) d1++;
        else if (num >= 13 && num <= 24) d2++;
        else if (num >= 25 && num <= 36) d3++;

        if (num !== 0 && num % 3 === 1) c1++;
        else if (num !== 0 && num % 3 === 2) c2++;
        else if (num !== 0 && num % 3 === 0) c3++;

        freq[num] = (freq[num] || 0) + 1;
    });

    const total = data.length;
    const pct = (val) => ((val/total)*100).toFixed(1) + '%';

    const breakdown = `🔴 **Red:** ${r} (${pct(r)})\n⚫ **Black:** ${b} (${pct(b)})\n🟢 **Green:** ${g} (${pct(g)})`;
    const oddEven = `🟡 **Odd:** ${odd} (${pct(odd)})\n🔵 **Even:** ${even} (${pct(even)})`;
    const lowHigh = `⬇️ **1-18:** ${low} (${pct(low)})\n⬆️ **19-36:** ${high} (${pct(high)})`;
    const dozens = `📦 **1st 12:** ${d1} (${pct(d1)})\n📦 **2nd 12:** ${d2} (${pct(d2)})\n📦 **3rd 12:** ${d3} (${pct(d3)})`;
    const columns = `🏛️ **Col 1:** ${c1} (${pct(c1)})\n🏛️ **Col 2:** ${c2} (${pct(c2)})\n🏛️ **Col 3:** ${c3} (${pct(c3)})`;

    const sorted = Object.entries(freq).sort((a,b) => b[1] - a[1]);
    const hot = sorted.slice(0, 5).map(x => `**${x[0]}**`).join(', ') || "N/A";
    
    const allNums = Array.from({length:37}, (_,i) => i);
    const cold = allNums.map(n => [n, freq[n]||0]).sort((a,b) => a[1]-b[1]).slice(0,5).map(x => `**${x[0]}**`).join(', ');

    const historyString = data.map(num => {
        if (num === 0) return '🟢0';
        return RED_NUMBERS.includes(num) ? `🔴${num}` : `⚫${num}`;
    }).join(' ');

    return { breakdown, oddEven, lowHigh, dozens, columns, hot, cold, historyString };
}

// --- BOOT PROCESS: WAKE UP THE DEALERS ---
export async function startPersistentRoulettes(client) {
    try {
        // Iterate over cached guilds safely instead of relying on direct SQL queries
        // This perfectly solves the "db.query is not a function" error.
        for (const guild of client.guilds.cache.values()) {
            const guildId = guild.id;
            const config = await getGuildConfig(client, guildId);
            const channelId = config.rouletteChannel;

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

            if (!channel) {
                await updateGuildConfig(client, guildId, { rouletteChannel: null });
                activeRouletteServers.delete(guildId);
                globalSpinHistory.delete(guildId);
                liveRouletteState.delete(guildId);
                return interaction.reply({ content: '🛑 **Roulette Disabled.** The dealer will finish their current spin and leave the server.', ephemeral: true });
            }

            if (channel.type !== 0) { 
                return interaction.reply({ content: '❌ Please select a standard Text Channel.', ephemeral: true });
            }

            await updateGuildConfig(client, guildId, { rouletteChannel: channel.id });

            if (activeRouletteServers.has(guildId)) {
                activeRouletteServers.delete(guildId);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

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
            const stats = getTableStats(dataToAnalyze);

            const embed = new EmbedBuilder()
                .setTitle(`📊 Roulette Analytics (Last ${actualSpinCount} Spins)`)
                .setColor('#3498db')
                .setDescription(`**Individual Spin Log (Oldest ➡️ Newest):**\n\n${stats.historyString}`)
                .addFields(
                    { name: '🎨 Colors', value: stats.breakdown, inline: true },
                    { name: '⚖️ Odd / Even', value: stats.oddEven, inline: true },
                    { name: '📏 Low / High', value: stats.lowHigh, inline: true },
                    { name: '📦 Dozens', value: stats.dozens, inline: true },
                    { name: '🏛️ Columns', value: stats.columns, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }, 
                    { name: '🔥 Hot Numbers', value: stats.hot, inline: true },
                    { name: '🧊 Cold Numbers', value: stats.cold, inline: true }
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
            const currentConfig = await getGuildConfig(client, guildId);
            if (currentConfig.rouletteChannel !== channel.id) {
                activeRouletteServers.delete(guildId);
                break;
            }

            let currentBets = [];
            let spinHistory = globalSpinHistory.get(guildId) || [];
            const stats = getTableStats(spinHistory);

            // ===============================================
            // Dashboard Sync (Timer & Betting)
            // ===============================================
            let timeLeft = 60;
            liveRouletteState.set(guildId, { status: 'betting', timeRemaining: timeLeft, winningNumber: null, history: spinHistory });
            
            const timerInterval = setInterval(() => {
                timeLeft--;
                const state = liveRouletteState.get(guildId);
                if (state) state.timeRemaining = timeLeft;
            }, 1000);

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
                    { name: '🎨 Colors', value: stats.breakdown, inline: true },
                    { name: '⚖️ Odd / Even', value: stats.oddEven, inline: true },
                    { name: '📏 Low / High', value: stats.lowHigh, inline: true },
                    { name: '📦 Dozens', value: stats.dozens, inline: true },
                    { name: '🏛️ Columns', value: stats.columns, inline: true },
                    { name: '\u200b', value: '\u200b', inline: true },
                    { name: '🔥 Hot Numbers', value: stats.hot, inline: true },
                    { name: '🧊 Cold Numbers', value: stats.cold, inline: true },
                    { name: '\u200b', value: '\u200b', inline: true },
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

            clearInterval(timerInterval);
            if (!activeRouletteServers.has(guildId)) break;

            betButton.components[0].setDisabled(true);

            // ===============================================
            // Generate Winner EARLY for Dashboard Sync
            // ===============================================
            const winningNumber = Math.floor(Math.random() * 37);
            const state = liveRouletteState.get(guildId);
            if (state) {
                state.status = 'spinning';
                state.winningNumber = winningNumber;
            }

            const spinningEmbed = new EmbedBuilder()
                .setTitle('🎰 ROULETTE SPINNING... 🎰')
                .setColor('#f1c40f')
                .setDescription(`**NO MORE BETS!**\n\nThe Dealer is spinning the wheel...\nTotal Bets Placed: **${currentBets.length}**`);

            await gameMessage.edit({ embeds: [spinningEmbed], components: [betButton] });
            
            // Wait 8 seconds (Dashboard spins visually during this time)
            await new Promise(resolve => setTimeout(resolve, 8000));

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
