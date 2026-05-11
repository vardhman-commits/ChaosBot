import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData } from '../../utils/economy.js';

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = [
    { name: '2', weight: 2 }, { name: '3', weight: 3 }, { name: '4', weight: 4 },
    { name: '5', weight: 5 }, { name: '6', weight: 6 }, { name: '7', weight: 7 },
    { name: '8', weight: 8 }, { name: '9', weight: 9 }, { name: '10', weight: 10 },
    { name: 'J', weight: 11 }, { name: 'Q', weight: 12 }, { name: 'K', weight: 13 },
    { name: 'A', weight: 14 }
];

const ALL_CARDS = [];
SUITS.forEach(suit => VALUES.forEach(val => ALL_CARDS.push({ ...val, suit })));

// FIX 1: Reduced to 4 Bots for a balanced 5-player table
const BOT_NAMES = ['Bot Raju', 'Bot Farhan', 'Bot Chatur', 'Bot Simran'];

function createDeck() {
    return [...ALL_CARDS].sort(() => Math.random() - 0.5);
}

function fCard(card, hidden = false) {
    if (hidden || !card) return `[❓]`;
    return `[${card.suit}${card.name}]`;
}

function getHandScore(c1, c2, c3) {
    let cards = [c1, c2, c3].sort((a, b) => b.weight - a.weight);
    let isFlush = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
    let isSeq = false;

    if (cards[0].weight - cards[1].weight === 1 && cards[1].weight - cards[2].weight === 1) isSeq = true;
    if (cards[0].weight === 14 && cards[1].weight === 3 && cards[2].weight === 2) {
        isSeq = true;
        cards = [cards[1], cards[2], cards[0]]; 
    }

    let isPair = cards[0].weight === cards[1].weight || cards[1].weight === cards[2].weight || cards[0].weight === cards[2].weight;
    let isTrail = cards[0].weight === cards[1].weight && cards[1].weight === cards[2].weight;

    if (isTrail) return { name: 'Trail (Set)', score: 600000 + cards[0].weight };
    if (isSeq && isFlush) return { name: 'Pure Sequence', score: 500000 + cards[0].weight };
    if (isSeq) return { name: 'Sequence', score: 400000 + cards[0].weight };
    if (isFlush) return { name: 'Color (Flush)', score: 300000 + cards[0].weight * 100 + cards[1].weight * 10 + cards[2].weight };
    if (isPair) {
        let pairWt = cards[0].weight === cards[1].weight ? cards[0].weight : cards[2].weight;
        let kicker = cards[0].weight === cards[1].weight ? cards[2].weight : cards[0].weight;
        return { name: 'Pair', score: 200000 + pairWt * 100 + kicker };
    }
    return { name: 'High Card', score: 100000 + cards[0].weight * 100 + cards[1].weight * 10 + cards[2].weight };
}

function getBestScore(hand, revealedJokerWeights) {
    let wildCount = 0;
    let fixedCards = [];

    hand.forEach(c => {
        if (revealedJokerWeights.includes(c.weight)) wildCount++;
        else fixedCards.push(c);
    });

    if (wildCount === 0) return getHandScore(hand[0], hand[1], hand[2]);

    let maxScore = -1;
    let bestName = '';

    function fillWilds(currentHand, wildsLeft) {
        if (wildsLeft === 0) {
            let res = getHandScore(currentHand[0], currentHand[1], currentHand[2]);
            if (res.score > maxScore) { maxScore = res.score; bestName = res.name; }
            return;
        }
        for (let card of ALL_CARDS) {
            fillWilds([...currentHand, card], wildsLeft - 1);
        }
    }

    fillWilds(fixedCards, wildCount);
    return { name: `${bestName} (✨Joker)`, score: maxScore };
}

export default {
    data: new SlashCommandBuilder()
        .setName('teenpatti')
        .setDescription('Play Teen Patti (1v4 Bots) with 2 Jokers!')
        .addIntegerOption(option =>
            option.setName('ante')
                .setDescription('The base starting bet amount')
                .setRequired(true)
                .setMinValue(10)
        ),
    category: 'Economy',

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);
            const initialAnte = interaction.options.getInteger('ante');
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            let isBlind = true;
            let baseBet = initialAnte;

            const userData = await getEconomyData(client, guildId, userId);
            const currentBalance = userData.wallet || 0;
            if (currentBalance < initialAnte * 10) {
                return InteractionHelper.safeEditReply(interaction, { content: `❌ You need at least **$${(initialAnte * 10).toLocaleString()}** to afford the bets.` });
            }

            // FIX 2: Reduced to 2 Middle Jokers
            let deck = createDeck();
            let middleCards = [deck.pop(), deck.pop()];
            let playerHand = [deck.pop(), deck.pop(), deck.pop()];
            
            let bots = BOT_NAMES.map(name => ({
                name,
                hand: [deck.pop(), deck.pop(), deck.pop()],
                active: true
            }));

            let round = 0; // 0=start, 1,2=reveals, 3=showdown
            let totalInvested = 0;
            let pot = 0;

            const initialBuyIn = initialAnte * (1 + bots.length); 
            pot += initialBuyIn;
            totalInvested += initialAnte;
            await EconomyService.removeMoney(client, guildId, userId, initialAnte, 'Teen Patti Ante');

            const getRevealedJokers = (rnd) => middleCards.slice(0, Math.min(rnd, 2)).map(c => c.weight);

            const generateTableEmbed = (rnd, isShowdown = false) => {
                const revealedWeights = getRevealedJokers(rnd);
                const playerEval = (isBlind && !isShowdown) ? { name: 'Blind (Hidden)' } : getBestScore(playerHand, revealedWeights);
                
                const tableStr = `**Middle Cards (2 Jokers):**\n🃏 ` + 
                    middleCards.map((c, i) => fCard(c, i >= rnd)).join(' ┃ ') + `\n\n` +
                    `**Your Hand:**\n👉 ` + playerHand.map(c => fCard(c, isBlind && !isShowdown)).join(' ┃ ') + 
                    `\n*Current Strength: **${playerEval.name}***`;

                const botsStr = bots.map(b => {
                    if (!b.active) return `🔴 ~~${b.name}~~ (Folded)`;
                    if (isShowdown) {
                        const bEval = getBestScore(b.hand, revealedWeights);
                        return `🟢 **${b.name}:** ${b.hand.map(c=>fCard(c)).join(' ')} - *${bEval.name}*`;
                    }
                    return `🟢 **${b.name}** (Playing)`;
                }).join('\n');

                return new EmbedBuilder()
                    .setTitle('🃏 Teen Patti (5 Players) 🃏')
                    .setColor(isShowdown ? '#f1c40f' : (isBlind ? '#9b59b6' : '#3498db'))
                    .setDescription(`**Round ${rnd}/2** | 💰 **POT: $${pot.toLocaleString()}**\n\n${tableStr}\n\n**Opponents:**\n${botsStr}`)
                    .setFooter({ text: `Status: ${isBlind ? 'BLIND (Half Price)' : 'SEEN (Full Price)'} | Invested: $${totalInvested.toLocaleString()}` });
            };

            const buildButtons = (rnd) => {
                let costCall = isBlind ? baseBet : baseBet * 2;
                let costDouble = isBlind ? baseBet * 2 : baseBet * 4;
                
                let labelCall = rnd === 2 ? `Showdown ($${costCall})` : `Call ($${costCall})`;
                let labelDouble = rnd === 2 ? `Double & Showdown ($${costDouble})` : `Double Bet ($${costDouble})`;

                const row = new ActionRowBuilder();
                
                if (isBlind && rnd < 3) {
                    row.addComponents(new ButtonBuilder().setCustomId('tp_see').setLabel('👀 See Cards').setStyle(ButtonStyle.Secondary));
                }
                
                row.addComponents(
                    new ButtonBuilder().setCustomId('tp_call').setLabel(labelCall).setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('tp_double').setLabel(labelDouble).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('tp_fold').setLabel('Fold').setStyle(ButtonStyle.Danger)
                );
                
                return row;
            };

            const msg = await InteractionHelper.safeEditReply(interaction, { 
                embeds: [generateTableEmbed(round)], 
                components: [buildButtons(round)] 
            });

            const replyMsg = await interaction.fetchReply();
            const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

            collector.on('collect', async i => {
                if (i.user.id !== userId) return i.reply({ content: "This isn't your table!", ephemeral: true });

                if (i.customId === 'tp_see') {
                    isBlind = false;
                    await i.update({ embeds: [generateTableEmbed(round)], components: [buildButtons(round)] });
                    return;
                }

                await i.deferUpdate();

                if (i.customId === 'tp_fold') {
                    collector.stop('folded');
                } else if (i.customId === 'tp_call' || i.customId === 'tp_double') {
                    
                    if (i.customId === 'tp_double') {
                        baseBet *= 2; 
                    }

                    let cost = isBlind ? baseBet : baseBet * 2;

                    const checkData = await getEconomyData(client, guildId, userId);
                    if ((checkData.wallet || 0) < cost) {
                        return i.followUp({ content: `❌ You ran out of money and were forced to fold!`, ephemeral: true });
                    }

                    await EconomyService.removeMoney(client, guildId, userId, cost, 'Teen Patti Round Bet');
                    totalInvested += cost;
                    pot += cost;

                    round++;
                    const revealedWeights = getRevealedJokers(round);

                    // FIX 3: Bots are now more easily scared into folding
                    let activeBotsCount = 0;
                    bots.forEach(bot => {
                        if (!bot.active) return;
                        const score = getBestScore(bot.hand, revealedWeights).score;
                        
                        let foldChance = 0;
                        if (score < 200000) foldChance = 0.7; // 70% chance to fold a High Card
                        else if (score < 300000) foldChance = 0.3; // 30% chance to fold a basic Pair

                        if (Math.random() < foldChance) {
                            bot.active = false;
                        } else {
                            pot += (baseBet * 2); 
                            activeBotsCount++;
                        }
                    });

                    if (activeBotsCount === 0) {
                        collector.stop('bots_folded');
                        return;
                    }

                    if (round === 3) {
                        collector.stop('showdown');
                    } else {
                        await i.editReply({ embeds: [generateTableEmbed(round)], components: [buildButtons(round)] });
                    }
                }
            });

            collector.on('end', async (collected, reason) => {
                const finalJokers = getRevealedJokers(2);
                const pEval = getBestScore(playerHand, finalJokers);

                if (reason === 'folded' || reason === 'time') {
                    const embed = generateTableEmbed(round, true).setColor('#e74c3c').setTitle('❌ You Folded!');
                    embed.setDescription(`You folded and lost your **$${totalInvested.toLocaleString()}** investment.\nBots take the pot.`);
                    return interaction.editReply({ embeds: [embed], components: [] });
                }

                if (reason === 'bots_folded') {
                    await EconomyService.addMoney(client, guildId, userId, pot, 'Teen Patti Win (Default)');
                    const embed = generateTableEmbed(round, true).setColor('#2ecc71').setTitle('🎉 All Bots Folded!');
                    embed.setDescription(`Every bot got scared and folded! You win the entire **$${pot.toLocaleString()}** pot!`);
                    return interaction.editReply({ embeds: [embed], components: [] });
                }

                if (reason === 'showdown') {
                    let highestBotScore = -1;
                    let bestBot = null;

                    bots.forEach(b => {
                        if (b.active) {
                            let score = getBestScore(b.hand, finalJokers).score;
                            if (score > highestBotScore) {
                                highestBotScore = score;
                                bestBot = b;
                            }
                        }
                    });

                    const embed = generateTableEmbed(2, true);

                    if (pEval.score > highestBotScore) {
                        await EconomyService.addMoney(client, guildId, userId, pot, 'Teen Patti Win (Showdown)');
                        embed.setColor('#2ecc71').setTitle('🏆 SHOWDOWN: YOU WIN! 🏆');
                        embed.setDescription(`Your **${pEval.name}** beat the bots!\nYou won the massive **$${pot.toLocaleString()}** pot!`);
                    } else {
                        const botEval = getBestScore(bestBot.hand, finalJokers);
                        embed.setColor('#e74c3c').setTitle('💀 SHOWDOWN: YOU LOST! 💀');
                        embed.setDescription(`**${bestBot.name}** had a **${botEval.name}** and beat your hand.\nYou lost your **$${totalInvested.toLocaleString()}** investment.`);
                    }

                    await interaction.editReply({ embeds: [embed], components: [] });
                }
            });

        } catch (error) {
            logger.error('TeenPatti command error:', error);
            await handleInteractionError(interaction, error, { type: 'command', commandName: 'teenpatti' });
        }
    }
};
