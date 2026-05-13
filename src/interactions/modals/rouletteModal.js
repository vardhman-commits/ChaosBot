import { EmbedBuilder } from 'discord.js';
import { getBalance, updateBalance } from '../../services/economyService.js';
import { logger } from '../../utils/logger.js';

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

export default {
    customIdPrefix: 'roulette_modal_',
    
    async execute(interaction) {
        const betType = interaction.customId.replace('roulette_modal_', '');
        const amountStr = interaction.fields.getTextInputValue('betAmount');
        const betAmount = parseInt(amountStr, 10);
        
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        if (isNaN(betAmount) || betAmount <= 0) {
            return interaction.reply({ content: '❌ Please enter a valid number greater than 0.', ephemeral: true });
        }

        const balance = await getBalance(guildId, userId);
        
        // French bets require specific unit multipliers
        let requiredTotal = betAmount;
        if (betType === 'voisins') requiredTotal = betAmount * 9;
        if (betType === 'tiers') requiredTotal = betAmount * 6;
        if (betType === 'orphelins') requiredTotal = betAmount * 5;

        if (balance.wallet < requiredTotal) {
            return interaction.reply({ content: `❌ You don't have enough coins! This bet requires \`🪙 ${requiredTotal}\`. You have \`🪙 ${balance.wallet}\`.`, ephemeral: true });
        }

        // Take the money
        await updateBalance(guildId, userId, -requiredTotal, 'wallet');

        // Spin the wheel!
        const resultNumber = Math.floor(Math.random() * 37);
        let resultColor = '🟢 Green';
        if (RED_NUMBERS.includes(resultNumber)) resultColor = '🔴 Red';
        if (BLACK_NUMBERS.includes(resultNumber)) resultColor = '⚫ Black';

        let won = false;
        let winMultiplier = 0;

        // --- Winning Logic ---
        if (!isNaN(parseInt(betType)) && parseInt(betType) === resultNumber) { won = true; winMultiplier = 36; }
        if (betType === 'red' && RED_NUMBERS.includes(resultNumber)) { won = true; winMultiplier = 2; }
        if (betType === 'black' && BLACK_NUMBERS.includes(resultNumber)) { won = true; winMultiplier = 2; }
        if (betType === 'even' && resultNumber !== 0 && resultNumber % 2 === 0) { won = true; winMultiplier = 2; }
        if (betType === 'odd' && resultNumber % 2 !== 0) { won = true; winMultiplier = 2; }
        if (betType === 'low' && resultNumber >= 1 && resultNumber <= 18) { won = true; winMultiplier = 2; }
        if (betType === 'high' && resultNumber >= 19 && resultNumber <= 36) { won = true; winMultiplier = 2; }
        if (betType === 'dozen1' && resultNumber >= 1 && resultNumber <= 12) { won = true; winMultiplier = 3; }
        if (betType === 'dozen2' && resultNumber >= 13 && resultNumber <= 24) { won = true; winMultiplier = 3; }
        if (betType === 'dozen3' && resultNumber >= 25 && resultNumber <= 36) { won = true; winMultiplier = 3; }
        if (betType === 'col1' && resultNumber !== 0 && resultNumber % 3 === 1) { won = true; winMultiplier = 3; }
        if (betType === 'col2' && resultNumber !== 0 && resultNumber % 3 === 2) { won = true; winMultiplier = 3; }
        if (betType === 'col3' && resultNumber !== 0 && resultNumber % 3 === 0) { won = true; winMultiplier = 3; }

        const voisins = [22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25];
        const tiers = [27,13,36,11,30,8,23,10,5,24,16,33];
        const orphelins = [1,20,14,31,9,17,34,6];

        if (betType === 'voisins' && voisins.includes(resultNumber)) {
            won = true;
            if ([0,2,3].includes(resultNumber)) winMultiplier = 24 / 9; 
            else winMultiplier = 18 / 9; 
        }
        if (betType === 'tiers' && tiers.includes(resultNumber)) { won = true; winMultiplier = 18 / 6; }
        if (betType === 'orphelins' && orphelins.includes(resultNumber)) {
            won = true;
            if (resultNumber === 1) winMultiplier = 36 / 5; 
            else winMultiplier = 18 / 5; 
        }

        // --- Execute the Animation Sequence ---
        await interaction.deferUpdate(); // Acknowledge modal submission

        const spinEmbed = new EmbedBuilder()
            .setTitle('🎰 Spinning the Wheel...')
            .setDescription(`**${interaction.user.username}** bet **🪙 ${requiredTotal}** on \`${betType.toUpperCase()}\`.\n\nThe wheel is spinning... 🎲`)
            .setColor('#FFA500')
            .setImage('https://i.imgur.com/3Qyq43r.gif'); // Your awesome spinning GIF

        await interaction.message.edit({ embeds: [spinEmbed], components: [] });

        // Wait 3 seconds for suspense!
        await new Promise(resolve => setTimeout(resolve, 3000));

        let payoutAmount = 0;
        let resultMsg = `You bet **🪙 ${requiredTotal}** on \`${betType.toUpperCase()}\`.\n\n`;
        
        if (won) {
            payoutAmount = Math.floor(requiredTotal * winMultiplier);
            await updateBalance(guildId, userId, payoutAmount, 'wallet');
            resultMsg += `🎉 **YOU WON!** You received **🪙 ${payoutAmount}**!`;
        } else {
            resultMsg += `💸 **You lost!** The house takes your **🪙 ${requiredTotal}**.`;
        }

        const newBalance = await getBalance(guildId, userId);

        const resultEmbed = new EmbedBuilder()
            .setTitle('🎰 Roulette Result')
            .setColor(won ? '#00ff00' : '#ff0000')
            .setDescription(`The ball landed on...\n\n# ${resultColor} ${resultNumber}\n\n${resultMsg}`)
            .setImage('https://i.imgur.com/qU3wO5A.png') // Your awesome final static board image
            .setFooter({ text: `New Wallet Balance: 🪙 ${newBalance.wallet}` });

        await interaction.message.edit({ embeds: [resultEmbed] });
    }
};
