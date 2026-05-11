export const shopItems = [
    // --- BANKING UPGRADES ---
    {
        id: 'extra_work',
        name: 'Extra Work Shift',
        price: 5000,
        description: 'Allows 1 extra use of the `/work` command.',
        type: 'consumable',
        maxQuantity: 5,
        cooldown: 86400000,
        effect: { type: 'command_boost', command: 'work', uses: 1 }
    },
    {
        id: 'bank_upgrade_1',
        name: 'Bank Upgrade I',
        price: 15000,
        description: 'Increases bank capacity and allows more funds to be deposited.',
        type: 'upgrade',
        maxLevel: 5,
        effect: { type: 'bank_capacity', multiplier: 1.5 }
    },
    {
        id: 'bank_note',
        name: '📜 Bank Note',
        price: 25000,
        description: 'Increases bank capacity by 10,000. Can be purchased multiple times.',
        type: 'tool',
        durability: null,
        effect: { type: 'bank_capacity', increase: 10000 }
    },

    // --- GRINDING TOOLS ---
    {
        id: 'laptop',
        name: '💻 Laptop',
        price: 15000,
        description: 'Allows remote work. Gives a 1.5x multiplier to `/work` earnings!',
        type: 'tool',
        durability: 200,
        effect: { type: 'work_yield', multiplier: 1.5 }
    },
    {
        id: 'fishing_rod',
        name: '🎣 Fishing Rod',
        price: 5000,
        description: 'Required to catch actual fish instead of muddy boots in `/fish`.',
        type: 'tool',
        durability: 100,
        effect: { type: 'fishing_yield', multiplier: 1.0 }
    },
    {
        id: 'pickaxe',
        name: '⛏️ Pickaxe',
        price: 7500,
        description: 'Required to mine effectively. Grants a 1.2x multiplier to `/mine`.',
        type: 'tool',
        durability: 100,
        effect: { type: 'mining_yield', multiplier: 1.2 }
    },
    {
        id: 'diamond_pickaxe',
        name: '💎 Diamond Pickaxe',
        price: 50000,
        description: 'The ultimate mining tool! Grants a 2.0x multiplier to `/mine`.',
        type: 'tool',
        durability: 100,
        effect: { type: 'mining_yield', multiplier: 2.0 }
    },

    // --- PREMIUM VIP ROLES ---
    {
        id: 'vip_bronze',
        name: '🥉 Bronze VIP Role',
        price: 50000,
        description: 'A starter premium role granting a 5% daily bonus.',
        type: 'role',
        roleId: null, 
        effect: { type: 'daily_bonus', multiplier: 1.05 }
    },
    {
        id: 'vip_silver',
        name: '🥈 Silver VIP Role',
        price: 150000,
        description: 'A shiny premium role granting a 10% daily bonus.',
        type: 'role',
        roleId: null,
        effect: { type: 'daily_bonus', multiplier: 1.10 }
    },
    {
        id: 'vip_gold',
        name: '🥇 Gold VIP Role',
        price: 350000,
        description: 'A prestigious role granting a 15% daily bonus.',
        type: 'role',
        roleId: null,
        effect: { type: 'daily_bonus', multiplier: 1.15 }
    },
    {
        id: 'vip_diamond',
        name: '💎 Diamond VIP Role',
        price: 750000,
        description: 'An elite role granting a 20% daily bonus.',
        type: 'role',
        roleId: null,
        effect: { type: 'daily_bonus', multiplier: 1.20 }
    },
    {
        id: 'vip_whale',
        name: '🐳 Chaos Whale Role',
        price: 2000000,
        description: 'The ultimate flex. Grants an insane 30% daily bonus.',
        type: 'role',
        roleId: null,
        effect: { type: 'daily_bonus', multiplier: 1.30 }
    }
];

export function getItemById(itemId) {
    return shopItems.find(item => item.id === itemId);
}

export function getItemsByType(type) {
    return shopItems.filter(item => item.type === type);
}

export function getItemPrice(itemId) {
    const item = getItemById(itemId);
    return item ? item.price : 0;
}

export function validatePurchase(itemId, userData) {
    const item = getItemById(itemId);
    if (!item) return { valid: false, reason: 'Item not found' };

    const inventory = userData.inventory || {};
    const upgrades = userData.upgrades || {};

    if (item.type === 'consumable' && item.maxQuantity) {
        const currentQuantity = inventory[itemId] || 0;
        if (currentQuantity >= item.maxQuantity) {
            return { valid: false, reason: `You can only have a maximum of ${item.maxQuantity} ${item.name}s` };
        }
    }

    if (item.type === 'upgrade' && item.maxLevel) {
        if (upgrades[itemId]) {
            return { valid: false, reason: `You've already purchased ${item.name}` };
        }
    }

    // Bank Note can be stacked, but other tools cannot
    if (item.type === 'tool') {
        const currentQuantity = inventory[itemId] || 0;
        if (itemId !== 'bank_note' && currentQuantity > 0) {
            return { valid: false, reason: `You already have a ${item.name}` };
        }
    }

    if (item.type === 'role' && item.roleId) {
        if (userData.roles?.includes(item.roleId)) {
            return { valid: false, reason: `You already have the ${item.name} role` };
        }
    }

    return { valid: true };
}
