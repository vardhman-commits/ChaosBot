import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, createError, ErrorTypes } from '../../utils/errorHandler.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';

const SCRATCH_COOLDOWN = 10 * 60 * 1000; // 10 minutes

// 15% Total Win Chance
const PAYOUTS = [
    { symbol: '💎', multiplier: 100, chance: 0.001 }, // 0.1% chance
    { symbol: '🔔', multiplier: 50, chance: 0.009 },  // 0.9% chance
    { symbol: '🍀', multiplier: 20, chance: 0.040 },  // 4.0% chance
    { symbol: '💵', multiplier: 10, chance: 0.100 }   // 10.0% chance
];

// Filler symbols for losing cards
const FILLER_SYMBOLS = ['🍒', '🍋', '🍉', '🍇', '💩', '💀', '🎲', '🎱'];

function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
}

export default {
    data: new SlashCommandBuilder()
        .setName('scratchcard')
        .setDescription('Buy a scratch card! Click the hidden boxes to reveal your prize. (High Risk!)')
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('How much to pay for the scratch card ticket')
                .setRequired(true)
                .setMinValue(10)
        ),
    category: 'Economy',

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);
            const betAmount = interaction.options.getInteger('bet');
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            // 1. Fetch User Data & Check Cooldown
            const userData = await getEconomyData(client, guildId, userId);
            const lastScratch = userData.lastScratch || 0;

            if (now < lastScratch + SCRATCH_COOLDOWN) {
                const remaining = lastScratch + SCRATCH_COOLDOWN - now;
                const minutes = Math.floor(remaining / (1000 * 60));
                const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

                return InteractionHelper.safeEditReply(interaction, { 
                    content: `⏳ **Take a breather!** The convenience store is printing more scratch cards. Try again in **${minutes}m ${seconds}s**.` 
                });
            }

            // 2. Balance Check
            const currentBalance = userData.wallet || 0;
            if (currentBalance < betAmount) {
                return InteractionHelper.safeEditReply(interaction, { 
                    content: `❌ You only have **$${currentBalance.toLocaleString()}**, which isn't enough to buy a **$${betAmount.toLocaleString()}** ticket.` 
                });
            }

            // 3. Deduct Bet & Set Cooldown
            await EconomyService.removeMoney(client, guildId, userId, betAmount, 'Scratch Card Ticket');
            userData.lastScratch = now;
            await setEconomyData(client, guildId, userId, userData);

            // 4. Determine Outcome (Math logic)
            const roll = Math.random();
            let winSymbol = null;
            let multiplier = 0;
            let cumulativeChance = 0;

            for (const prize of PAYOUTS) {
                cumulativeChance += prize.chance;
                if (roll <= cumulativeChance) {
                    winSymbol = prize.symbol;
                    multiplier = prize.multiplier;
                    break;
                }
            }

            // 5. Generate the 3x3 Grid
            let gridSymbols = [];

            if (winSymbol) {
                // Guaranteed 3 winning symbols
                gridSymbols.push(winSymbol, winSymbol, winSymbol);
                // Fill the other 6 with random fillers (making sure none appear 3 times)
                while (gridSymbols.length < 9) {
                    const randomFiller = FILLER_SYMBOLS[Math.floor(Math.random() * FILLER_SYMBOLS.length)];
                    const count = gridSymbols.filter(s => s === randomFiller).length;
                    if (count < 2) gridSymbols.push(randomFiller);
                }
            } else {
                // Losing ticket: Ensure NO symbol appears 3 times
                while (gridSymbols.length < 9) {
                    const randomFiller = [...PAYOUTS.map(p=>p.symbol), ...FILLER_SYMBOLS][Math.floor(Math.random() * (PAYOUTS.length + FILLER_SYMBOLS.length))];
                    const count = gridSymbols.filter(s => s === randomFiller).length;
                    if (count < 2) gridSymbols.push(randomFiller);
                }
            }

            gridSymbols = shuffle(gridSymbols);

            // Format into Discord Spoilers
            const gridDisplay = `
|| 🛑 || || 🛑 || || 🛑 ||
|| ${gridSymbols[0]} || || ${gridSymbols[1]} || || ${gridSymbols[2]} ||
|| ${gridSymbols[3]} || || ${gridSymbols[4]} || || ${gridSymbols[5]} ||
|| ${gridSymbols[6]} || || ${gridSymbols[7]} || || ${gridSymbols[8]} ||
|| 🛑 || || 🛑 || || 🛑 ||
            `;

            // 6. Process Payout Silently
            let winnings = 0;
            if (multiplier > 0) {
                winnings = betAmount * multiplier;
                await EconomyService.addMoney(client, guildId, userId, winnings, 'Scratch Card Winnings');
            }

            // 7. Render UI
            const embed = new EmbedBuilder()
                .setTitle('🎫 Chaos Scratch Card')
                .setColor('#9b59b6')
                .setDescription(`Ticket Price: **$${betAmount.toLocaleString()}**\n\n**Click the gray boxes to scratch!** Find 3 matching symbols anywhere on the board to win.\n${gridDisplay}\n\n*Note: If this card is a winner, your money has already been deposited into your wallet automatically!*`)
                .addFields({
                    name: '🏆 Prize Legend',
                    value: '💎 3x = **100x**\n🔔 3x = **50x**\n🍀 3x = **20x**\n💵 3x = **10x**'
                })
                .setFooter({ text: `${interaction.user.username}'s Ticket • Next ticket available in 10 minutes` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        } catch (error) {
            logger.error('ScratchCard error:', error);
            await handleInteractionError(interaction, error, { type: 'command', commandName: 'scratchcard' });
        }
    }
};
