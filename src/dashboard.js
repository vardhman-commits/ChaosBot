import basicAuth from 'express-basic-auth';
import express from 'express';
import { getEconomyData, setEconomyData } from './utils/economy.js';

export function attachDashboard(app, client) {
    const dashboard = express.Router();

    // 🔒 SECURITY: Change these credentials!
    dashboard.use(basicAuth({
        users: { 'admin': 'supersecretpassword123' }, 
        challenge: true,
        unauthorizedResponse: '❌ Unauthorized Access. Admins only.'
    }));

    dashboard.use(express.urlencoded({ extended: true }));

    // --- HTML TEMPLATE WRAPPER ---
    const renderPage = (title, content) => `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title} | Chaos Control</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Inter', sans-serif; background-color: #0f172a; color: #f8fafc; }
                .glass-card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.05); }
            </style>
        </head>
        <body class="flex h-screen overflow-hidden">
            
            <aside class="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
                <div class="p-6 text-2xl font-bold text-indigo-400 border-b border-slate-800 flex items-center gap-3">
                    <i class="fa-solid fa-dice-d20"></i> ChaosBot
                </div>
                <nav class="flex-1 p-4 space-y-2">
                    <a href="/admin" class="flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 transition-all hover:bg-indigo-500">
                        <i class="fa-solid fa-chart-pie"></i> Dashboard
                    </a>
                    <a href="/admin#lookup" class="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
                        <i class="fa-solid fa-users"></i> Player Lookup
                    </a>
                </nav>
            </aside>

            <main class="flex-1 overflow-y-auto p-8 relative">
                <div class="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-indigo-900/20 to-transparent pointer-events-none"></div>
                <div class="max-w-6xl mx-auto relative z-10">
                    <header class="flex justify-between items-center mb-10">
                        <div>
                            <h1 class="text-3xl font-bold text-white tracking-tight">Welcome back, Admin.</h1>
                            <p class="text-slate-400 mt-1">Here is what's happening with your bot today.</p>
                        </div>
                        <div class="flex items-center gap-3 bg-slate-800 px-4 py-2 rounded-full border border-slate-700">
                            <div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                            <span class="text-sm font-medium text-slate-300">System Online</span>
                        </div>
                    </header>
                    ${content}
                </div>
            </main>
        </body>
        </html>
    `;

    // 🏠 MAIN DASHBOARD PAGE
    dashboard.get('/', (req, res) => {
        const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

        const content = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <div class="glass-card rounded-2xl p-6 transition-transform hover:-translate-y-1">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-sm font-medium text-slate-400 mb-1">Total Servers</p>
                            <h3 class="text-3xl font-bold text-white">${client.guilds.cache.size}</h3>
                        </div>
                        <div class="p-3 bg-blue-500/10 rounded-lg text-blue-400"><i class="fa-solid fa-server text-xl"></i></div>
                    </div>
                </div>
                
                <div class="glass-card rounded-2xl p-6 transition-transform hover:-translate-y-1">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-sm font-medium text-slate-400 mb-1">Total Users</p>
                            <h3 class="text-3xl font-bold text-white">${totalUsers.toLocaleString()}</h3>
                        </div>
                        <div class="p-3 bg-emerald-500/10 rounded-lg text-emerald-400"><i class="fa-solid fa-users text-xl"></i></div>
                    </div>
                </div>

                <div class="glass-card rounded-2xl p-6 transition-transform hover:-translate-y-1">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-sm font-medium text-slate-400 mb-1">Latency (Ping)</p>
                            <h3 class="text-3xl font-bold text-white">${client.ws.ping} <span class="text-lg text-slate-500">ms</span></h3>
                        </div>
                        <div class="p-3 bg-amber-500/10 rounded-lg text-amber-400"><i class="fa-solid fa-bolt text-xl"></i></div>
                    </div>
                </div>

                <div class="glass-card rounded-2xl p-6 transition-transform hover:-translate-y-1">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-sm font-medium text-slate-400 mb-1">RAM Usage</p>
                            <h3 class="text-3xl font-bold text-white">${ramUsage} <span class="text-lg text-slate-500">MB</span></h3>
                        </div>
                        <div class="p-3 bg-rose-500/10 rounded-lg text-rose-400"><i class="fa-solid fa-memory text-xl"></i></div>
                    </div>
                </div>
            </div>

            <div id="lookup" class="glass-card rounded-2xl p-8 border-l-4 border-l-indigo-500">
                <h2 class="text-xl font-bold text-white mb-2"><i class="fa-solid fa-magnifying-glass mr-2 text-indigo-400"></i> Player Economy Lookup</h2>
                <p class="text-slate-400 mb-6">Enter a player's Discord ID to view and manage their casino finances.</p>
                
                <form action="/admin/user" method="GET" class="flex flex-col md:flex-row gap-4">
                    <div class="flex-1">
                        <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Discord User ID</label>
                        <input type="text" name="userId" required class="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                    </div>
                    <div class="flex-1">
                        <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Discord Server ID</label>
                        <input type="text" name="guildId" required class="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                    </div>
                    <div class="flex items-end">
                        <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-8 rounded-lg shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2">
                            Search <i class="fa-solid fa-arrow-right"></i>
                        </button>
                    </div>
                </form>
            </div>
        `;
        res.send(renderPage('Overview', content));
    });

    // 🔍 USER PROFILE & BANKER CONTROLS
    dashboard.get('/user', async (req, res) => {
        const { userId, guildId, success, msg } = req.query;
        
        try {
            const userData = await getEconomyData(client, guildId, userId);
            const user = await client.users.fetch(userId).catch(() => null);
            const username = user ? user.username : 'Unknown User';
            const avatarUrl = user ? user.displayAvatarURL({ extension: 'png', size: 128 }) : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const wallet = userData.wallet || 0;
            const bank = userData.bank || 0;

            let alertHtml = '';
            if (success === 'true') {
                alertHtml = `<div class="bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg mb-6 flex items-center gap-3"><i class="fa-solid fa-circle-check"></i> ${msg}</div>`;
            }

            const content = `
                <a href="/admin" class="text-slate-400 hover:text-white transition-colors flex items-center gap-2 mb-6 w-fit">
                    <i class="fa-solid fa-arrow-left"></i> Back to Dashboard
                </a>
                ${alertHtml}
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div class="glass-card rounded-2xl p-8 flex flex-col items-center text-center">
                        <img src="${avatarUrl}" class="w-32 h-32 rounded-full border-4 border-slate-700 shadow-xl mb-4">
                        <h2 class="text-2xl font-bold text-white">${username}</h2>
                        <p class="text-slate-400 font-mono text-sm mb-6">${userId}</p>
                        
                        <div class="w-full bg-slate-900 rounded-lg p-4 border border-slate-800 space-y-3">
                            <div class="flex justify-between items-center"><span class="text-slate-400">👛 Wallet</span><span class="text-white font-bold">$${wallet.toLocaleString()}</span></div>
                            <div class="flex justify-between items-center"><span class="text-slate-400">🏛️ Bank</span><span class="text-white font-bold">$${bank.toLocaleString()}</span></div>
                            <div class="h-px bg-slate-800 w-full my-2"></div>
                            <div class="flex justify-between items-center"><span class="text-indigo-400 font-bold">💎 Net Worth</span><span class="text-indigo-400 font-bold">$${(wallet + bank).toLocaleString()}</span></div>
                        </div>
                    </div>

                    <div class="lg:col-span-2 glass-card rounded-2xl p-8 border-t-4 border-t-rose-500">
                        <h2 class="text-xl font-bold text-white mb-2"><i class="fa-solid fa-building-columns mr-2 text-rose-400"></i> Web Banker Controls</h2>
                        <p class="text-slate-400 mb-8">Directly modify this user's database. Changes apply instantly to Discord.</p>

                        <form action="/admin/edit-balance" method="POST" class="space-y-6">
                            <input type="hidden" name="userId" value="${userId}">
                            <input type="hidden" name="guildId" value="${guildId}">

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Action</label>
                                    <select name="action" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-rose-500">
                                        <option value="add">➕ Add</option>
                                        <option value="remove">➖ Remove</option>
                                        <option value="set">✏️ Set Exact</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Account</label>
                                    <select name="account" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-rose-500">
                                        <option value="wallet">👛 Wallet</option>
                                        <option value="bank">🏛️ Bank</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Amount ($)</label>
                                    <input type="number" name="amount" min="0" required class="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-rose-500">
                                </div>
                            </div>
                            
                            <div class="flex justify-end pt-4 border-t border-slate-800">
                                <button type="submit" class="bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-8 rounded-lg transition-all flex items-center gap-2">
                                    <i class="fa-solid fa-triangle-exclamation"></i> Execute Override
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            res.send(renderPage(`Data: ${username}`, content));
        } catch (error) {
            res.send(renderPage('Error', `<div class="bg-rose-500/20 border border-rose-500/50 p-6 rounded-xl text-center"><h2 class="text-xl font-bold text-white mb-2">Lookup Failed</h2><p class="text-rose-200 mb-6">Could not find data. Verify IDs are correct.</p><a href="/admin" class="bg-slate-800 hover:bg-slate-700 py-2 px-6 rounded-lg text-white">Go Back</a></div>`));
        }
    });

    // ⚡ POST ROUTE
    dashboard.post('/edit-balance', async (req, res) => {
        const { userId, guildId, action, account, amount } = req.body;
        const numAmount = parseInt(amount);

        try {
            const userData = await getEconomyData(client, guildId, userId);
            let oldBalance = userData[account] || 0;

            if (action === 'add') userData[account] = oldBalance + numAmount;
            else if (action === 'remove') userData[account] = Math.max(0, oldBalance - numAmount);
            else if (action === 'set') userData[account] = numAmount;

            await setEconomyData(client, guildId, userId, userData);
            const msg = encodeURIComponent(`Successfully ${action}ed $${numAmount.toLocaleString()} ${action === 'add' ? 'to' : action === 'remove' ? 'from' : 'in'} their ${account}!`);
            res.redirect(`/admin/user?userId=${userId}&guildId=${guildId}&success=true&msg=${msg}`);
        } catch (error) {
            res.send("Error updating database.");
        }
    });

    // Attach the locked dashboard Router to the main Express app at /admin
    app.use('/admin', dashboard);
}
