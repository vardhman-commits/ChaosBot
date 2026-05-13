import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, PermissionFlagsBits, StringSelectMenuBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

// Global Memory 
const activeRouletteServers = new Set();
const globalSpinHistory = new Map();
const userBetHistory = new Map();

// The dashboard reads this map to sync the UI!
export const liveRouletteState = new Map(); 

// --- LIVE TABLE ANALYTICS ENGINE ---
function getTableStats(data) {
    if (!data || data.length === 0) {
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
    const hotRaw = sorted.slice(0, 4).map(x => parseInt(x[0]));
    const coldRaw = allNums().map(n => [n, freq[n]||0]).sort((a,b) => a[1]-b[1]).slice(0,4).map(x => parseInt(x[0]));
    
    const hot = hotRaw.map(n => `**${n}**`).join(', ') || "N/A";
    const cold = coldRaw.map(n => `**${n}**`).join(', ') || "N/A";

    const historyString = data.map(num => {
        if (num === 0) return '🟢0';
        return RED_NUMBERS.includes(num) ? `🔴${num}` : `⚫${num}`;
    }).join(' ');

    return { breakdown, oddEven, lowHigh, dozens, columns, hot, cold, historyString, hotRaw, coldRaw };
}

function allNums() {
    return Array.from({length:37}, (_,i) => i);
}

// --- BOOT PROCESS: WAKE UP THE DEALERS ---
export async function startPersistentRoulettes(client) {
    try {
        for (const guild of client.guilds.cache.values()) {
            const guildId = guild.id;
            const config = await getGuildConfig(client, guildId);
            const channelId = config.rouletteChannel;

            if (channelId && !activeRouletteServers.has(guildId)) {
                try {
                    const channel = await client.channels.fetch(channelId);
                    if (channel) {
                        activeRouletteServers.add(guildId);
                        
                        const savedHistory = config.rouletteSpinHistory || [];
                        globalSpinHistory.set(guildId, savedHistory);
                        
                        logger.info(`Starting persistent 24/7 Roulette in guild ${guildId} with ${savedHistory.length} loaded spins.`);
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
        
        .addSubcommand(sub =>
            sub.setName('setchannel')
            .setDescription('ADMIN ONLY: Set the channel for the 24/7 Automated Roulette dealer.')
            .addChannelOption(option => 
                option.setName('channel')
                .setDescription('The channel to run Roulette in (Leave blank to disable)')
                .setRequired(false)
            )
        )
        
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
        )
        
        .addSubcommand(sub =>
            sub.setName('history')
            .setDescription('View your personal betting history (up to the last 50 spins)')
        )

        .addSubcommand(sub =>
            sub.setName('restart')
            .setDescription('ADMIN ONLY: Reset the table spin history to 0.')
        )

        .addSubcommand(sub =>
            sub.setName('reset')
            .setDescription('ADMIN ONLY: Wipe the spin history AND all player bet histories.')
        ),
        
    category: 'Economy',

    async execute(interaction, config, client) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        // ==========================================
        //         ADMIN: RESTART & RESET COMMANDS
        // ==========================================
        if (sub === 'restart' || sub === 'reset') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ **Access Denied.** You must be a server Administrator.', ephemeral: true });
            }

            globalSpinHistory.set(guildId, []);
            await updateGuildConfig(client, guildId, { rouletteSpinHistory: [] });
            
            if (sub === 'restart') {
                return interaction.reply({ content: '✅ **Table Restarted!** The global spin history has been wiped clean.', ephemeral: true });
            }

            if (sub === 'reset') {
                for (const [key, _] of userBetHistory.entries()) {
                    const [gId, uId] = key.split('_');
                    if (gId === guildId) {
                        const userData = await getEconomyData(client, guildId, uId);
                        userData.rouletteHistory = [];
                        await setEconomyData(client, guildId, uId, userData);
                        userBetHistory.delete(key); 
                    }
                }
                return interaction.reply({ content: '🔥 **Full Reset Complete!** Table spin history AND all recorded player bet histories have been destroyed.', ephemeral: true });
            }
        }

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
            if (!globalSpinHistory.has(guildId)) {
                const cfg = await getGuildConfig(client, guildId);
                globalSpinHistory.set(guildId, cfg.rouletteSpinHistory || []);
            }

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
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        // ==========================================
        //         PLAYER: PERSONAL BET HISTORY
        // ==========================================
        if (sub === 'history') {
            const userHistoryKey = `${guildId}_${interaction.user.id}`;
            let history = userBetHistory.get(userHistoryKey);

            if (!history) {
                const userData = await getEconomyData(client, guildId, interaction.user.id);
                history = userData.rouletteHistory || [];
                userBetHistory.set(userHistoryKey, history);
            }

            if (history.length === 0) {
                return interaction.reply({ content: '❌ You have no recorded roulette bets in this server yet!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle(`🎰 Roulette Bet History (${interaction.user.username})`)
                .setColor('#f1c40f')
                .setFooter({ text: 'Showing up to last 50 bets' });

            let desc = '';
            history.forEach((h, i) => {
                const outcome = h.won ? `✅ **WON $${h.payout.toLocaleString()}**` : `❌ **LOST**`;
                const numStr = h.winningNumber === 0 ? '🟢0' : (RED_NUMBERS.includes(h.winningNumber) ? `🔴${h.winningNumber}` : `⚫${h.winningNumber}`);
                const date = new Date(h.timestamp).toLocaleTimeString();
                
                let displayType = h.type.toUpperCase();
                if(h.type.startsWith('split-')) displayType = `SPLIT (${h.type.split('-').slice(1).join(',')})`;
                if(h.type.startsWith('corner-')) displayType = `CORNER (${h.type.split('-').slice(1).join(',')})`;
                if(h.type.startsWith('sixline-')) displayType = `SIX LINE (${h.type.split('-').slice(1).join(',')})`;
                if(h.type.startsWith('nb-')) displayType = `NEIGHBOURS (${h.type.split('-')[1]} ±${h.type.split('-')[2]})`;

                desc += `\`${i+1}.\` [${date}] Bet **$${h.cost.toLocaleString()}** on **${displayType}** | Landed: ${numStr} | ${outcome}\n`;
            });

            if (desc.length > 4000) {
                desc = desc.substring(0, 4000) + '...\n\n*(Truncated due to Discord character limits)*';
            }

            embed.setDescription(desc);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};

// ==========================================
//      AUTOMATED ROULETTE ENGINE LOOP
// ==========================================
async function runRouletteLoop(channel, client, guildId) {

    try {
        const msgs = await channel.messages.fetch({ limit: 15 });
        const oldGameMsgs = msgs.filter(m => m.author.id === client.user.id && m.embeds[0] && m.embeds[0].title && m.embeds[0].title.includes('ROULETTE'));
        for (const msg of oldGameMsgs.values()) {
            await msg.delete().catch(() => null);
        }
    } catch(e) {}

    while (activeRouletteServers.has(guildId)) {
        try {
            const currentConfig = await getGuildConfig(client, guildId);
            if (currentConfig.rouletteChannel !== channel.id) {
                activeRouletteServers.delete(guildId);
                break;
            }

            let currentBets = [];
            let spinHistory = globalSpinHistory.get(guildId) || [];
            
            const stats = getTableStats(spinHistory.slice(-100));

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
                    { name: 'Roulette Board', value: tableArt, inline: false }
                )
                .setFooter({ text: `The Dealer is waiting for bets... • Total Server Spins: ${spinHistory.length}` });

            const betButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('place_bet').setLabel('💰 Place Your Bet').setStyle(ButtonStyle.Success)
            );

            const gameMessage = await channel.send({ embeds: [betEmbed], components: [betButton] });
            const collector = gameMessage.createMessageComponentCollector({ time: 60000 });

            // THIS IS WHERE WE FIX THE RESPOND ERROR!
            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.customId === 'place_bet') {
                    
                    const hotNumbers = stats.hotRaw && stats.hotRaw.length > 0 ? stats.hotRaw : [1, 2, 3, 4];
                    const coldNumbers = stats.coldRaw && stats.coldRaw.length > 0 ? stats.coldRaw : [36, 35, 34, 33];

                    const row1 = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`r_out_${buttonInteraction.id}`)
                            .setPlaceholder('🔴 Outside Bets (1:1 Payout)')
                            .addOptions([
                                { label: 'Red', value: 'red', emoji: '🔴' },
                                { label: 'Black', value: 'black', emoji: '⚫' },
                                { label: 'Even', value: 'even', emoji: '🔢' },
                                { label: 'Odd', value: 'odd', emoji: '🔡' },
                                { label: 'Low (1-18)', value: '1-18', emoji: '📉' },
                                { label: 'High (19-36)', value: '19-36', emoji: '📈' }
                            ])
                    );

                    const row2 = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`r_doz_${buttonInteraction.id}`)
                            .setPlaceholder('📊 Dozens & Columns (2:1 Payout)')
                            .addOptions([
                                { label: '1st Dozen (1-12)', value: '1-12' },
                                { label: '2nd Dozen (13-24)', value: '13-24' },
                                { label: '3rd Dozen (25-36)', value: '25-36' },
                                { label: '1st Column', value: 'col1' },
                                { label: '2nd Column', value: 'col2' },
                                { label: '3rd Column', value: 'col3' }
                            ])
                    );

                    const row3 = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`r_num_${buttonInteraction.id}`)
                            .setPlaceholder('🎯 Specific Numbers (35:1 Payout)')
                            .addOptions([
                                { label: 'Zero (0)', value: '0', emoji: '🟢' },
                                ...hotNumbers.map(n => ({ label: `Hot Number: ${n}`, value: `${n}`, emoji: '🔥' })),
                                ...coldNumbers.map(n => ({ label: `Cold Number: ${n}`, value: `${n}`, emoji: '🧊' }))
                            ])
                    );

                    const row4 = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`r_fr_${buttonInteraction.id}`)
                            .setPlaceholder('🥖 French Call Bets')
                            .addOptions([
                                { label: 'Voisins du Zéro', description: '17 numbers near zero. 9x unit cost.', value: 'voisins' },
                                { label: 'Tiers du Cylindre', description: '12 numbers opposite zero. 6x unit cost.', value: 'tiers' },
                                { label: 'Orphelins', description: '8 remaining numbers. 5x unit cost.', value: 'orphelins' }
                            ])
                    );

                    // We use fetchReply: true so we can attach a sub-collector to this exact ephemeral message!
                    const ephemeralResponse = await buttonInteraction.reply({ content: "Please select your bet type from the menus below:", components: [row1, row2, row3, row4], ephemeral: true, fetchReply: true });

                    // Attach the listener directly to the ephemeral dropdowns!
                    const menuCollector = ephemeralResponse.createMessageComponentCollector({ time: 60000 });

                    menuCollector.on('collect', async (menuInteraction) => {
                        const selectedBet = menuInteraction.values[0];
                        
                        const modal = new ModalBuilder()
                            .setCustomId(`bet_amount_modal_${menuInteraction.id}`)
                            .setTitle(`Betting on: ${selectedBet.toUpperCase()}`);

                        const betAmountInput = new TextInputBuilder()
                            .setCustomId('bet_amount')
                            .setLabel("Enter Chip Amount")
                            .setPlaceholder("e.g. 500")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);

                        modal.addComponents(new ActionRowBuilder().addComponents(betAmountInput));
                        await menuInteraction.showModal(modal); // This acknowledges the dropdown click!

                        try {
                            const modalSubmit = await menuInteraction.awaitModalSubmit({ filter: (mi) => mi.customId === `bet_amount_modal_${menuInteraction.id}` && mi.user.id === menuInteraction.user.id, time: 45000 });
                            const rawAmount = parseInt(modalSubmit.fields.getTextInputValue('bet_amount'));

                            if (isNaN(rawAmount) || rawAmount <= 0) return modalSubmit.reply({ content: '❌ Invalid chip amount!', ephemeral: true });

                            const userData = await getEconomyData(client, guildId, menuInteraction.user.id);
                            
                            let type = selectedBet;
                            let parsedBet = null;
                            let cost = rawAmount;
                            let isAdvanced = false;
                            let advancedNums = [];
                            let multiplier = 0;

                            const baseValid = ['red', 'black', 'even', 'odd', '1-18', '19-36', '1-12', '13-24', '25-36', 'col1', 'col2', 'col3'];

                            if (baseValid.includes(type)) {
                                parsedBet = type;
                            } else if (!isNaN(type) && parseInt(type) >= 0 && parseInt(type) <= 36) {
                                parsedBet = parseInt(type).toString();
                            } else if (type === 'voisins') {
                                parsedBet = 'voisins'; cost = rawAmount * 9; isAdvanced = true; advancedNums = [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25]; multiplier = 36;
                            } else if (type === 'tiers') {
                                parsedBet = 'tiers'; cost = rawAmount * 6; isAdvanced = true; advancedNums = [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33]; multiplier = 36;
                            } else if (type === 'orphelins') {
                                parsedBet = 'orphelins'; cost = rawAmount * 5; isAdvanced = true; advancedNums = [1, 20, 14, 31, 9, 17, 34, 6]; multiplier = 36;
                            }

                            if ((userData.wallet || 0) < cost) return modalSubmit.reply({ content: `❌ Not enough cash! Your balance: **$${(userData.wallet || 0).toLocaleString()}** | Bet cost: **$${cost.toLocaleString()}**`, ephemeral: true });

                            await EconomyService.removeMoney(client, guildId, menuInteraction.user.id, cost, `Roulette Bet: ${parsedBet}`);
                            
                            currentBets.push({ 
                                userId: menuInteraction.user.id, 
                                userTag: menuInteraction.user.tag, 
                                type: parsedBet, 
                                cost: cost, 
                                chipSize: rawAmount, 
                                isAdvanced: isAdvanced, 
                                advancedNums: advancedNums, 
                                multiplier: multiplier 
                            });

                            // Tell them they succeeded and wipe out the dropdown menus
                            await modalSubmit.reply({ content: `✅ Bet Accepted! **$${cost.toLocaleString()}** deducted for **${parsedBet.toUpperCase()}**.`, ephemeral: true });
                            await menuInteraction.editReply({ content: '✅ Bet successfully recorded!', components: [] });

                        } catch (err) {
                            logger.error(err);
                        }
                    });
                }
            });

            await new Promise(resolve => setTimeout(resolve, 60000));
            collector.stop();

            clearInterval(timerInterval);
            if (!activeRouletteServers.has(guildId)) break;

            betButton.components[0].setDisabled(true);

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
            
            await new Promise(resolve => setTimeout(resolve, 8000));

            const isRed = RED_NUMBERS.includes(winningNumber);
            const isBlack = winningNumber !== 0 && !isRed;
            const isEven = winningNumber !== 0 && winningNumber % 2 === 0;
            const isOdd = winningNumber !== 0 && winningNumber % 2 !== 0;

            spinHistory.push(winningNumber);
            if (spinHistory.length > 500) spinHistory.shift();
            await updateGuildConfig(client, guildId, { rouletteSpinHistory: spinHistory });

            let colorEmoji = '🟢'; let colorName = 'Green';
            if (isRed) { colorEmoji = '🔴'; colorName = 'Red'; }
            else if (isBlack) { colorEmoji = '⚫'; colorName = 'Black'; }

            let resultsText = `The ball landed on...\n## ${colorEmoji} ${winningNumber} (${colorName})\n\n`;
            let winners = [];

            for (const bet of currentBets) {
                let won = false; let payout = 0;

                if (bet.isAdvanced) {
                    if (bet.advancedNums.includes(winningNumber)) {
                        won = true; payout = bet.chipSize * bet.multiplier;
                    }
                } else {
                    let mult = 0;
                    if (bet.type === 'red' && isRed) { won = true; mult = 2; }
                    else if (bet.type === 'black' && isBlack) { won = true; mult = 2; }
                    else if (bet.type === 'even' && isEven) { won = true; mult = 2; }
                    else if (bet.type === 'odd' && isOdd) { won = true; mult = 2; }
                    else if (bet.type === '1-18' && winningNumber >= 1 && winningNumber <= 18) { won = true; mult = 2; }
                    else if (bet.type === '19-36' && winningNumber >= 19 && winningNumber <= 36) { won = true; mult = 2; }
                    else if (bet.type === '1-12' && winningNumber >= 1 && winningNumber <= 12) { won = true; mult = 3; }
                    else if (bet.type === '13-24' && winningNumber >= 13 && winningNumber <= 24) { won = true; mult = 3; }
                    else if (bet.type === '25-36' && winningNumber >= 25 && winningNumber <= 36) { won = true; mult = 3; }
                    else if (bet.type === 'col1' && winningNumber !== 0 && winningNumber % 3 === 1) { won = true; mult = 3; }
                    else if (bet.type === 'col2' && winningNumber !== 0 && winningNumber % 3 === 2) { won = true; mult = 3; }
                    else if (bet.type === 'col3' && winningNumber !== 0 && winningNumber % 3 === 0) { won = true; mult = 3; }
                    else if (!isNaN(bet.type) && parseInt(bet.type) === winningNumber) { won = true; mult = 36; }
                    
                    if (won) payout = bet.cost * mult;
                }

                if (won) {
                    await EconomyService.addMoney(client, guildId, bet.userId, payout, 'Roulette Winnings');
                    winners.push(`🎉 **${bet.userTag}** won **$${payout.toLocaleString()}** *(Bet: ${bet.type.toUpperCase()})*`);
                }

                const userHistoryKey = `${guildId}_${bet.userId}`;
                let userHist = userBetHistory.get(userHistoryKey);
                
                if (!userHist) {
                    const uData = await getEconomyData(client, guildId, bet.userId);
                    userHist = uData.rouletteHistory || [];
                }

                userHist.unshift({
                    type: bet.type.toUpperCase(),
                    cost: bet.cost,
                    won: won,
                    payout: payout,
                    winningNumber: winningNumber,
                    timestamp: Date.now()
                });
                
                if (userHist.length > 50) userHist.pop();
                userBetHistory.set(userHistoryKey, userHist);

                const saveUData = await getEconomyData(client, guildId, bet.userId);
                saveUData.rouletteHistory = userHist;
                await setEconomyData(client, guildId, bet.userId, saveUData);
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
