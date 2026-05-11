import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
// Import the shared memory map from the setroulette file
import { globalSpinHistory } from './setroulette.js';

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

export default {
    data: new SlashCommandBuilder()
        .setName('roulettestats')
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
        ),
    category: 'Economy',

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction);

        const serverHistory = globalSpinHistory.get(interaction.guildId);
        
        if (!serverHistory || serverHistory.length === 0) {
            return InteractionHelper.safeEditReply(interaction, { content: '❌ There is no active Roulette game, or no spins have been recorded yet!' });
        }

        const requestedSpins = interaction.options.getInteger('spins');
        // Slice the array to grab only the requested amount of recent spins
        const dataToAnalyze = serverHistory.slice(-requestedSpins);
        const actualSpinCount = dataToAnalyze.length;

        // Tally up the data
        let redCount = 0;
        let blackCount = 0;
        let greenCount = 0;
        let evenCount = 0;
        let oddCount = 0;

        // Keep track of which specific numbers hit the most
        const numberFrequency = {};

        for (const num of dataToAnalyze) {
            if (num === 0) greenCount++;
            else if (RED_NUMBERS.includes(num)) redCount++;
            else blackCount++;

            if (num !== 0 && num % 2 === 0) evenCount++;
            else if (num !== 0 && num % 2 !== 0) oddCount++;

            numberFrequency[num] = (numberFrequency[num] || 0) + 1;
        }

        // Calculate percentages
        const redPct = ((redCount / actualSpinCount) * 100).toFixed(1);
        const blackPct = ((blackCount / actualSpinCount) * 100).toFixed(1);
        const greenPct = ((greenCount / actualSpinCount) * 100).toFixed(1);

        // Find "Hot" and "Cold" numbers
        const sortedNumbers = Object.entries(numberFrequency).sort((a, b) => b[1] - a[1]);
        const hotNumbers = sortedNumbers.slice(0, 5).map(([num, count]) => `**${num}** (${count}x)`).join(', ') || 'N/A';
        // Numbers that didn't appear at all, or appeared the least
        const allNumbers = Array.from({length: 37}, (_, i) => i);
        const coldNumbers = allNumbers
            .map(num => [num, numberFrequency[num] || 0])
            .sort((a, b) => a[1] - b[1])
            .slice(0, 5)
            .map(([num, count]) => `**${num}** (${count}x)`).join(', ');

        const embed = new EmbedBuilder()
            .setTitle(`📊 Roulette Analytics (Last ${actualSpinCount} Spins)`)
            .setColor('#3498db')
            .addFields(
                { name: 'Color Breakdown', value: `🔴 **Red:** ${redCount} (${redPct}%)\n⚫ **Black:** ${blackCount} (${blackPct}%)\n🟢 **Green:** ${greenCount} (${greenPct}%)`, inline: true },
                { name: 'Odd / Even', value: `🟡 **Odd:** ${oddCount}\n🔵 **Even:** ${evenCount}`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true }, // Empty field for formatting
                { name: '🔥 Hot Numbers', value: hotNumbers, inline: false },
                { name: '🧊 Cold Numbers', value: coldNumbers, inline: false }
            )
            .setFooter({ text: 'Data resets when the bot restarts.' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
