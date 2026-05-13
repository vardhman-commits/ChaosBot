import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { db } from '../../utils/database.js';

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

// Global Memory 
const activeRouletteServers = new Set();
const globalSpinHistory = new Map();
const userBetHistory = new Map();

export const liveRouletteState = new Map(); 

// --- LIVE TABLE ANALYTICS ENGINE ---
function getTableStats(data) {
    if (!data || data.length === 0) {
        return {
            breakdown: "No data yet.", oddEven: "N/A", lowHigh: "N/A", dozens: "N/A", columns: "N/A",
            hot: "N/A", cold: "N/A", historyString: "*No spins recorded yet. The table is fresh!*",
            hotRaw: [1, 2, 3, 4], coldRaw: [36, 35, 34, 33]
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
    
    const allNums = Array.from({length:37}, (_,i) => i);
    const coldRaw = allNums.map(n => [n, freq[n]||0]).sort((a,b) => a[1]-b[1]).slice(0,4).map(x => parseInt(x[0]));
    
    const hot = hotRaw.map(n => `**${n}**`).join(', ') || "N/A";
    const cold = coldRaw.map(n => `**${n}**`).join(', ') || "N/A";

    const historyString = data.map(num => {
        if (num === 0) return '🟢0';
        return RED_NUMBERS.includes(num) ? `🔴${num}` : `⚫${num}`;
    }).join(' ');

    return { breakdown, oddEven, lowHigh, dozens, columns, hot, cold, historyString, hotRaw, coldRaw };
}

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
                        runRouletteLoop(channel, client, guildId);
                    }
                } catch (e) {}
            }
        }
    } catch (error) {}
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
                    .addChoices({ name: 'Last 100 Spins', value: 100 }, { name: 'Last 200 Spins', value: 200 }, { name: 'Last 500 Spins', value: 500 })
            )
        )
        .addSubcommand(sub => sub.setName('history').setDescription('View your personal betting history (up to the last 50 spins)'))
        .addSubcommand(sub => sub.setName('restart').setDescription('ADMIN ONLY: Reset the table spin history to 0.'))
        .addSubcommand(sub => sub.setName('reset').setDescription('ADMIN ONLY: Wipe the spin history AND all player bet histories.')),
        
    category: 'Economy',

    async execute(interaction, config, client) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (sub === 'restart' || sub === 'reset') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ **Access Denied.**', ephemeral: true });

            globalSpinHistory.set(guildId, []);
            await updateGuildConfig(client, guildId, { rouletteSpinHistory: [] });
            
            if (sub === 'restart') return interaction.reply({ content: '✅ **Table Restarted!** The global spin history has been wiped clean.', ephemeral: true });

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

        if (sub === 'setchannel') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ **Access Denied.**', ephemeral: true });

            const channel = interaction.options.getChannel('channel');
            if (!channel) {
                await updateGuildConfig(client, guildId, { rouletteChannel: null });
                activeRouletteServers.delete(guildId);
                liveRouletteState.delete(guildId);
                return interaction.reply({ content: '🛑 **Roulette Disabled.**', ephemeral: true });
            }

            await updateGuildConfig(client, guildId, { rouletteChannel: channel.id });
            if (activeRouletteServers.has(guildId)) { activeRouletteServers.delete(guildId); await new Promise(resolve => setTimeout(resolve, 1000)); }

            activeRouletteServers.add(guildId);
            if (!globalSpinHistory.has(guildId)) globalSpinHistory.set(guildId, (await getGuildConfig(client, guildId)).rouletteSpinHistory || []);

            await interaction.reply({ content: `✅ **24/7 Roulette Dealer Activated in <#${channel.id}>!**`, ephemeral: true });
            runRouletteLoop(channel, client, guildId);
        }

        if (sub === 'stats') {
            await interaction.deferReply({ ephemeral: true }).catch(() => null);
            const serverHistory = globalSpinHistory.get(guildId);
            if (!serverHistory || serverHistory.length === 0) return InteractionHelper.safeEditReply(interaction, { content: '❌ No spins recorded yet!' });

            const stats = getTableStats(serverHistory.slice(-interaction.options.getInteger('spins')));
            const embed = new EmbedBuilder()
                .setTitle(`📊 Roulette Analytics`)
                .setColor('#3498db')
                .setDescription(`**Spin Log:**\n\n${stats.historyString}`)
                .addFields(
                    { name: '🎨 Colors', value: stats.breakdown, inline: true }, { name: '⚖️ Odd / Even', value: stats.oddEven, inline: true },
                    { name: '📏 Low / High', value: stats.lowHigh, inline: true }, { name: '📦 Dozens', value: stats.dozens, inline: true },
                    { name: '🏛️ Columns', value: stats.columns, inline: true }, { name: '\u200B', value: '\u200B', inline: true }, 
                    { name: '🔥 Hot Numbers', value: stats.hot, inline: true }, { name: '🧊 Cold Numbers', value: stats.cold, inline: true }
                );
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        if (sub === 'history') {
            const userHistoryKey = `${guildId}_${interaction.user.id}`;
            let history = userBetHistory.get(userHistoryKey);

            if (!history) {
                history = (await getEconomyData(client, guildId, interaction.user.id)).rouletteHistory || [];
                userBetHistory.set(userHistoryKey, history);
            }

            if (history.length === 0) return interaction.reply({ content: '❌ You have no bets yet!', ephemeral: true });

            const embed = new EmbedBuilder().setTitle(`🎰 Bet History (${interaction.user.username})`).setColor('#f1c40f');
            let desc = '';
            history.forEach((h, i) => {
                const outcome = h.won ? `✅ **WON $${h.payout.toLocaleString()}**` : `❌ **LOST**`;
                const numStr = h.winningNumber === 0 ? '🟢0' : (RED_NUMBERS.includes(h.winningNumber) ? `🔴${h.winningNumber}` : `⚫${h.winningNumber}`);
                desc += `\`${i+1}.\` Bet **$${h.cost.toLocaleString()}** on **${h.type.toUpperCase()}** | Landed: ${numStr} | ${outcome}\n`;
            });
            embed.setDescription(desc.substring(0, 4000));
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};

async function runRouletteLoop(channel, client, guildId) {
    try {
        const msgs = await channel.messages.fetch({ limit: 15 });
        const oldGameMsgs = msgs.filter(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('ROULETTE'));
        for (const msg of oldGameMsgs.values()) await msg.delete().catch(() => null);
    } catch(e) {}

    while (activeRouletteServers.has(guildId)) {
        try {
            const currentConfig = await getGuildConfig(client, guildId);
            if (currentConfig.rouletteChannel !== channel.id) { activeRouletteServers.delete(guildId); break; }

            let currentBets = [];
            let spinHistory = globalSpinHistory.get(guildId) || [];
            const stats = getTableStats(spinHistory.slice(-100));

            // Grab the actual hot and cold numbers
            const hN = stats.hotRaw && stats.hotRaw.length >= 4 ? stats.hotRaw : [1, 2, 3, 4];
            const cN = stats.coldRaw && stats.coldRaw.length >= 4 ? stats.coldRaw : [36, 35, 34, 33];

            let timeLeft = 60;
            liveRouletteState.set(guildId, { status: 'betting', timeRemaining: timeLeft, winningNumber: null, history: spinHistory });
            const timerInterval = setInterval(() => { timeLeft--; const state = liveRouletteState.get(guildId); if (state) state.timeRemaining = timeLeft; }, 1000);

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
                .setDescription(`**Betting is OPEN!** You have **1 Minute** to place your bets.\nUse the quick buttons below or click "Custom Bet"!`)
                .addFields(
                    // RESTORED FULL STATS AND PAYOUTS GUIDE!
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
                    { name: '🔢 Specific Number (0-36)', value: 'Payout: **35:1**', inline: true },
                    { name: '🌟 Advanced Bets Guide', value: 'You can type combinations via Custom Bet!\n`voisins`, `tiers`, `orphelins`\n`nb <num> <dist>` (e.g. `nb 0 2`)\n`split 5,8`\n`corner 1,2,4,5`\n`sixline 1,2,3,4,5,6`', inline: false }
                )
                .setFooter({ text: `The Dealer is waiting for bets... • Total Server Spins: ${spinHistory.length}` });

            // Exactly 25 Buttons (Discord Limit = 5 ActionRows x 5 Buttons)
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('place_custom_bet').setLabel('✏️ Custom Bet').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('qbet_red').setLabel('🔴 Red').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('qbet_black').setLabel('⚫ Black').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('qbet_even').setLabel('Even').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('qbet_odd').setLabel('Odd').setStyle(ButtonStyle.Primary)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('qbet_1-18').setLabel('1-18').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('qbet_19-36').setLabel('19-36').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('qbet_1-12').setLabel('1st 12').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('qbet_13-24').setLabel('2nd 12').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('qbet_25-36').setLabel('3rd 12').setStyle(ButtonStyle.Secondary)
            );

            const row3 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('qbet_col1').setLabel('Col 1').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('qbet_col2').setLabel('Col 2').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('qbet_col3').setLabel('Col 3').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('qbet_voisins').setLabel('Voisins').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('qbet_tiers').setLabel('Tiers').setStyle(ButtonStyle.Primary)
            );

            const row4 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('qbet_orphelins').setLabel('Orphelins').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('qbet_num_0').setLabel('🟢 0').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`qbet_num_${hN[0]}_h1`).setLabel(`🔥 ${hN[0]}`).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`qbet_num_${hN[1]}_h2`).setLabel(`🔥 ${hN[1]}`).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`qbet_num_${hN[2]}_h3`).setLabel(`🔥 ${hN[2]}`).setStyle(ButtonStyle.Danger)
            );

            const row5 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`qbet_num_${hN[3]}_h4`).setLabel(`🔥 ${hN[3]}`).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`qbet_num_${cN[0]}_c1`).setLabel(`🧊 ${cN[0]}`).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`qbet_num_${cN[1]}_c2`).setLabel(`🧊 ${cN[1]}`).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`qbet_num_${cN[2]}_c3`).setLabel(`🧊 ${cN[2]}`).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`qbet_num_${cN[3]}_c4`).setLabel(`🧊 ${cN[3]}`).setStyle(ButtonStyle.Primary)
            );

            const gameMessage = await channel.send({ embeds: [betEmbed], components: [row1, row2, row3, row4, row5] });
            const collector = gameMessage.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

            collector.on('collect', async (i) => {
                try {
                    let rawTypeToProcess = '';

                    if (i.customId === 'place_custom_bet') {
                        const modal = new ModalBuilder().setCustomId(`bet_custom_${i.id}`).setTitle('Custom Roulette Bet');
                        const typeInput = new TextInputBuilder().setCustomId('bet_type').setLabel("Bet type (e.g. split 5,8, nb 0 2)").setStyle(TextInputStyle.Short).setRequired(true);
                        const amountInput = new TextInputBuilder().setCustomId('bet_amount').setLabel("Chip Amount (e.g. 500)").setStyle(TextInputStyle.Short).setRequired(true);
                        modal.addComponents(new ActionRowBuilder().addComponents(typeInput), new ActionRowBuilder().addComponents(amountInput));
                        
                        await i.showModal(modal);
                        const modalSubmit = await i.awaitModalSubmit({ filter: mi => mi.customId === `bet_custom_${i.id}`, time: 45000 });
                        
                        await modalSubmit.deferReply({ ephemeral: true });
                        rawTypeToProcess = modalSubmit.fields.getTextInputValue('bet_type').toLowerCase().trim();
                        await processBetLogic(modalSubmit, rawTypeToProcess, parseInt(modalSubmit.fields.getTextInputValue('bet_amount')), i.user);
                    } 
                    else if (i.customId.startsWith('qbet_')) {
                        const parts = i.customId.split('_');
                        let betLabel = parts[1];
                        if (betLabel === 'num') betLabel = parts[2]; 
                        
                        rawTypeToProcess = betLabel;

                        const modal = new ModalBuilder().setCustomId(`bet_quick_${i.id}`).setTitle(`Quick Bet: ${betLabel.toUpperCase()}`);
                        const amountInput = new TextInputBuilder().setCustomId('bet_amount').setLabel("Chip Amount (e.g. 500)").setStyle(TextInputStyle.Short).setRequired(true);
                        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
                        
                        await i.showModal(modal);
                        const modalSubmit = await i.awaitModalSubmit({ filter: mi => mi.customId === `bet_quick_${i.id}`, time: 45000 });
                        
                        await modalSubmit.deferReply({ ephemeral: true });
                        await processBetLogic(modalSubmit, rawTypeToProcess, parseInt(modalSubmit.fields.getTextInputValue('bet_amount')), i.user);
                    }
                } catch (err) {
                }
            });

            async function processBetLogic(modalSubmit, type, cost, user) {
                if (isNaN(cost) || cost <= 0) return modalSubmit.editReply({ content: '❌ Invalid chip amount!' });

                let parsedBet = null;
                let isAdvanced = false;
                let advancedNums = [];
                let multiplier = 0;

                const baseValid = ['red', 'black', 'even', 'odd', '1-18', '19-36', '1-12', '13-24', '25-36', 'col1', 'col2', 'col3'];
                const typeNoSpace = type.replace(/\s/g, '');

                if (baseValid.includes(typeNoSpace)) {
                    parsedBet = typeNoSpace;
                } else if (!isNaN(typeNoSpace) && parseInt(typeNoSpace) >= 0 && parseInt(typeNoSpace) <= 36) {
                    parsedBet = parseInt(typeNoSpace).toString();
                } else if (type === 'voisins') {
                    parsedBet = 'voisins'; cost = cost * 9; isAdvanced = true; advancedNums = [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25]; multiplier = 36;
                } else if (type === 'tiers') {
                    parsedBet = 'tiers'; cost = cost * 6; isAdvanced = true; advancedNums = [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33]; multiplier = 36;
                } else if (type === 'orphelins') {
                    parsedBet = 'orphelins'; cost = cost * 5; isAdvanced = true; advancedNums = [1, 20, 14, 31, 9, 17, 34, 6]; multiplier = 36;
                } else if (type.startsWith('nb') || type.startsWith('neighbour')) {
                    const parts = type.match(/[0-9]+/g);
                    if (parts && parts.length === 2) {
                        const target = parseInt(parts[0]); const dist = parseInt(parts[1]);
                        if (target >= 0 && target <= 36 && dist >= 1 && dist <= 5) {
                            const idx = WHEEL_ORDER.indexOf(target);
                            for(let k = -dist; k <= dist; k++) { let x = (idx + k) % 37; if(x < 0) x += 37; advancedNums.push(WHEEL_ORDER[x]); }
                            parsedBet = `nb-${target}-${dist}`; cost = cost * advancedNums.length; isAdvanced = true; multiplier = 36;
                        }
                    }
                } else if (type.startsWith('split')) {
                    const parts = type.match(/[0-9]+/g);
                    if (parts && parts.length === 2) { parsedBet = `split-${parts.join('-')}`; isAdvanced = true; advancedNums = parts.map(Number); multiplier = 18; }
                } else if (type.startsWith('corner')) {
                    const parts = type.match(/[0-9]+/g);
                    if (parts && parts.length === 4) { parsedBet = `corner-${parts.join('-')}`; isAdvanced = true; advancedNums = parts.map(Number); multiplier = 9; }
                } else if (type.startsWith('sixline')) {
                    const parts = type.match(/[0-9]+/g);
                    if (parts && parts.length === 6) { parsedBet = `sixline-${parts.join('-')}`; isAdvanced = true; advancedNums = parts.map(Number); multiplier = 6; }
                }

                if (!parsedBet) return modalSubmit.editReply({ content: "❌ Invalid bet! Check formatting." });

                const userData = await getEconomyData(client, guildId, user.id);
                if ((userData.wallet || 0) < cost) return modalSubmit.editReply({ content: `❌ Not enough cash! Your balance: **$${(userData.wallet || 0).toLocaleString()}** | Bet cost: **$${cost.toLocaleString()}**` });

                await EconomyService.removeMoney(client, guildId, user.id, cost, `Roulette Bet: ${parsedBet}`);
                
                currentBets.push({ userId: user.id, userTag: user.tag, type: parsedBet, cost: cost, chipSize: (isAdvanced ? cost/(multiplier===18?2:(multiplier===9?4:(multiplier===6?6:advancedNums.length))) : cost), isAdvanced: isAdvanced, advancedNums: advancedNums, multiplier: multiplier });

                await modalSubmit.editReply({ content: `✅ Bet Accepted! **$${cost.toLocaleString()}** deducted for **${parsedBet.toUpperCase()}**.` });
            }

            await new Promise(resolve => setTimeout(resolve, 60000));
            collector.stop();
            clearInterval(timerInterval);
            if (!activeRouletteServers.has(guildId)) break;

            const disabledRow1 = ActionRowBuilder.from(row1).components.map(b => ButtonBuilder.from(b).setDisabled(true));
            const disabledRow2 = ActionRowBuilder.from(row2).components.map(b => ButtonBuilder.from(b).setDisabled(true));
            const disabledRow3 = ActionRowBuilder.from(row3).components.map(b => ButtonBuilder.from(b).setDisabled(true));
            const disabledRow4 = ActionRowBuilder.from(row4).components.map(b => ButtonBuilder.from(b).setDisabled(true));
            const disabledRow5 = ActionRowBuilder.from(row5).components.map(b => ButtonBuilder.from(b).setDisabled(true));

            const winningNumber = Math.floor(Math.random() * 37);
            const state = liveRouletteState.get(guildId);
            if (state) { state.status = 'spinning'; state.winningNumber = winningNumber; }

            const spinningEmbed = new EmbedBuilder()
                .setTitle('🎰 ROULETTE SPINNING... 🎰')
                .setColor('#f1c40f')
                .setDescription(`**NO MORE BETS!**\n\nThe Dealer is spinning the wheel...\nTotal Bets Placed: **${currentBets.length}**`);

            await gameMessage.edit({ embeds: [spinningEmbed], components: [new ActionRowBuilder().addComponents(disabledRow1), new ActionRowBuilder().addComponents(disabledRow2), new ActionRowBuilder().addComponents(disabledRow3), new ActionRowBuilder().addComponents(disabledRow4), new ActionRowBuilder().addComponents(disabledRow5)] });
            
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
                    if (bet.advancedNums.includes(winningNumber)) { won = true; payout = bet.chipSize * bet.multiplier; }
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
                if (!userHist) { const uData = await getEconomyData(client, guildId, bet.userId); userHist = uData.rouletteHistory || []; }

                userHist.unshift({ type: bet.type.toUpperCase(), cost: bet.cost, won: won, payout: payout, winningNumber: winningNumber, timestamp: Date.now() });
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
