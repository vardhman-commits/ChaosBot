import basicAuth from 'express-basic-auth';
import express from 'express';
import { getEconomyData, setEconomyData } from './utils/economy.js';
import { getGuildConfig, updateGuildConfig } from './services/guildConfig.js';
import { logger } from './utils/logger.js';
import { db } from './utils/database.js';

export function attachDashboard(app, client) {
    const dashboard = express.Router();

    // 🔒 SECURITY
    dashboard.use(basicAuth({
        users: { 'admin': 'supersecretpassword123' }, 
        challenge: true,
        unauthorizedResponse: '❌ Unauthorized Access. Admins only.'
    }));

    dashboard.use(express.urlencoded({ extended: true }));
    dashboard.use(express.json());

    // --- FRONTEND SPA TEMPLATE ---
    const renderPage = (client, guild, config) => {
        const textChannels = guild.channels.cache.filter(c => c.type === 0).sort((a,b) => a.position - b.position).map(c => ({ id: c.id, label: `# ${c.name}` }));
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).sort((a,b) => a.position - b.position).map(c => ({ id: c.id, label: `🔊 ${c.name}` }));
        const categories = guild.channels.cache.filter(c => c.type === 4).sort((a,b) => a.position - b.position).map(c => ({ id: c.id, label: `📁 ${c.name}` }));
        const roles = guild.roles.cache.sort((a,b) => b.position - a.position).map(r => ({ id: r.id, label: `@ ${r.name}` }));

        const buildSelect = (name, optionsList, selectedId, placeholder) => {
            let html = `<select name="${name}" class="w-full bg-[#09090b]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-fuchsia-500 transition-all cursor-pointer">`;
            html += `<option value="" class="bg-[#09090b] text-gray-500">-- Select ${placeholder} --</option>`;
            optionsList.forEach(opt => {
                const isSelected = String(opt.id) === String(selectedId) ? 'selected' : '';
                html += `<option value="${opt.id}" class="bg-[#09090b] text-white" ${isSelected}>${opt.label}</option>`;
            });
            return html + `</select>`;
        };

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chaos Control OS | Dashboard</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700;900&display=swap" rel="stylesheet">
            <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
            <style>
                body { font-family: 'Outfit', sans-serif; background-color: #030303; color: #e2e8f0; }
                .glass-card { background: linear-gradient(145deg, rgba(20,20,25,0.9) 0%, rgba(10,10,15,0.9) 100%); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4); }
                .gradient-text { background: linear-gradient(to right, #a855f7, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: #030303; }
                ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
                .tab-content { display: none; animation: fadeIn 0.3s ease-in-out; }
                .tab-content.active { display: block; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                input, select { background-color: #09090b !important; }
            </style>
        </head>
        <body class="flex h-screen overflow-hidden selection:bg-fuchsia-500 selection:text-white">
            
            <aside class="w-72 bg-[#050505] border-r border-white/5 flex flex-col z-20 relative shadow-2xl">
                <div class="p-8 border-b border-white/5 flex flex-col items-center justify-center relative z-10">
                    <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-blue-600 flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.4)] mb-4">
                        <i class="fa-solid fa-bolt text-3xl text-white"></i>
                    </div>
                    <h1 class="text-2xl font-black tracking-widest text-white uppercase">CHAOS<span class="text-fuchsia-500">OS</span></h1>
                    <p class="text-xs text-gray-500 mt-1 uppercase tracking-widest">Enterprise Edition</p>
                </div>
                
                <nav class="flex-1 p-4 space-y-1 relative z-10 overflow-y-auto" id="nav-links">
                    <p class="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3 mt-2">Core Systems</p>
                    <button onclick="switchTab('overview')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20" data-target="overview"><i class="fa-solid fa-chart-pie w-5 text-center"></i> System Overview</button>
                    <button onclick="switchTab('settings')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="settings"><i class="fa-solid fa-gear w-5 text-center"></i> Server Settings</button>
                    
                    <p class="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3 mt-6">Management</p>
                    <button onclick="switchTab('moderation')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="moderation"><i class="fa-solid fa-gavel w-5 text-center text-rose-400"></i> Moderation</button>
                    <button onclick="switchTab('economy')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="economy"><i class="fa-solid fa-vault w-5 text-center text-yellow-400"></i> Economy Banker</button>
                    
                    <p class="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3 mt-6">Features</p>
                    <button onclick="switchTab('engagement')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="engagement"><i class="fa-solid fa-users-rays w-5 text-center text-emerald-400"></i> Engagement (Giveaways/Levels)</button>
                    <button onclick="switchTab('utilities')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="utilities"><i class="fa-solid fa-toolbox w-5 text-center text-blue-400"></i> Utilities (Tickets/JTC)</button>
                    
                    <p class="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3 mt-6">Help</p>
                    <button onclick="switchTab('guide')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="guide"><i class="fa-solid fa-book w-5 text-center text-teal-400"></i> Bot Guide & Docs</button>
                </nav>
            </aside>

            <main class="flex-1 overflow-y-auto relative p-10 bg-[#030303]">
                <div class="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-fuchsia-900/10 blur-[150px] rounded-full pointer-events-none"></div>
                
                <div class="max-w-[1400px] mx-auto relative z-10">
                    <header class="flex justify-between items-end mb-10 border-b border-white/5 pb-6">
                        <div>
                            <h2 class="text-4xl font-black text-white mb-2 tracking-tight" id="page-title">Command Center</h2>
                            <p class="text-gray-400 text-lg" id="page-desc">System status and live analytics.</p>
                        </div>
                        <div class="text-right flex gap-6">
                            <div>
                                <p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Guild ID</p>
                                <p class="text-sm font-bold text-white">${guild.id}</p>
                            </div>
                            <div>
                                <p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Gateway Ping</p>
                                <div class="bg-white/5 px-4 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                                    <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                    <p class="text-lg font-black text-white">${client.ws.ping}ms</p>
                                </div>
                            </div>
                        </div>
                    </header>

                    <input type="hidden" id="globalGuildId" value="${guild.id}">
                    
                    <div id="tab-overview" class="tab-content active">
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            <div class="glass-card rounded-2xl p-6 border-t-2 border-t-fuchsia-500">
                                <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Total Members</p>
                                <h3 class="text-4xl font-black text-white">${guild.memberCount.toLocaleString()}</h3>
                            </div>
                            <div class="glass-card rounded-2xl p-6 border-t-2 border-t-blue-500">
                                <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Channels</p>
                                <h3 class="text-4xl font-black text-white">${guild.channels.cache.size}</h3>
                            </div>
                            <div class="glass-card rounded-2xl p-6 border-t-2 border-t-emerald-500">
                                <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Roles</p>
                                <h3 class="text-4xl font-black text-white">${guild.roles.cache.size}</h3>
                            </div>
                            <div class="glass-card rounded-2xl p-6 border-t-2 border-t-yellow-500">
                                <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Uptime</p>
                                <h3 class="text-4xl font-black text-white">${(client.uptime / 3600000).toFixed(1)}<span class="text-lg text-gray-500 font-medium">h</span></h3>
                            </div>
                        </div>
                        <div class="glass-card rounded-3xl p-8 border border-white/5">
                            <h3 class="text-xl font-bold text-white mb-4"><i class="fa-solid fa-server mr-2 text-fuchsia-500"></i> Live Database Connection</h3>
                            <p class="text-gray-400">The dashboard is fully connected to the PostgreSQL instance. Use the tabs on the left to configure modules, edit economy balances, manage giveaways, and moderate users.</p>
                        </div>
                    </div>

                    <div id="tab-settings" class="tab-content">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div class="glass-card rounded-3xl p-8 border border-white/5 flex flex-col">
                                <h3 class="text-2xl font-bold text-white mb-2"><i class="fa-solid fa-shield-halved text-emerald-500 mr-2"></i> Security & Verification</h3>
                                <p class="text-gray-400 text-sm mb-6">Manage server entry and staff roles.</p>
                                <form class="config-form space-y-4 flex-grow">
                                    <input type="hidden" name="guildId" value="${guild.id}">
                                    <div><label class="text-xs font-bold text-gray-500 uppercase">Verified Role</label> ${buildSelect('verification_roleId', roles, config.verification?.roleId, 'Verified Role')}</div>
                                    <div><label class="text-xs font-bold text-gray-500 uppercase">Verification Channel</label> ${buildSelect('verification_channelId', textChannels, config.verification?.channelId, 'Verify Channel')}</div>
                                    <div class="grid grid-cols-2 gap-4">
                                        <div><label class="text-xs font-bold text-gray-500 uppercase">Admin Role</label> ${buildSelect('adminRole', roles, config.adminRole, 'Admin Role')}</div>
                                        <div><label class="text-xs font-bold text-gray-500 uppercase">Mod Role</label> ${buildSelect('modRole', roles, config.modRole, 'Mod Role')}</div>
                                    </div>
                                    <button type="submit" class="w-full bg-white/10 hover:bg-emerald-500/20 text-white font-bold py-3 rounded-xl mt-4 border border-white/10 transition-all">Save Security Config</button>
                                </form>
                            </div>

                            <div class="glass-card rounded-3xl p-8 border border-white/5 flex flex-col">
                                <h3 class="text-2xl font-bold text-white mb-2"><i class="fa-solid fa-door-open text-blue-500 mr-2"></i> Infrastructure</h3>
                                <p class="text-gray-400 text-sm mb-6">Manage logs, welcomes, and auto-roles.</p>
                                <form class="config-form space-y-4 flex-grow">
                                    <input type="hidden" name="guildId" value="${guild.id}">
                                    <div><label class="text-xs font-bold text-gray-500 uppercase">Audit Log Channel</label> ${buildSelect('logChannelId', textChannels, config.logChannelId, 'Audit Logs')}</div>
                                    <div><label class="text-xs font-bold text-gray-500 uppercase">Welcome Channel</label> ${buildSelect('welcomeChannel', textChannels, config.welcomeChannel, 'Welcome Logs')}</div>
                                    <div><label class="text-xs font-bold text-gray-500 uppercase">Auto-Assign Role</label> ${buildSelect('autoRole', roles, config.autoRole, 'Auto Role')}</div>
                                    <button type="submit" class="w-full bg-white/10 hover:bg-blue-500/20 text-white font-bold py-3 rounded-xl mt-4 border border-white/10 transition-all">Save Infrastructure</button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div id="tab-moderation" class="tab-content">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div class="glass-card rounded-3xl p-8 border-t-4 border-t-rose-500">
                                <h2 class="text-2xl font-black text-white mb-6"><i class="fa-solid fa-gavel text-rose-500 mr-2"></i> Execute Moderation</h2>
                                <form id="modActionForm" class="space-y-4">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Target User ID</label>
                                        <input type="text" id="modUserId" required class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white">
                                    </div>
                                    <div class="grid grid-cols-2 gap-4">
                                        <div>
                                            <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Action</label>
                                            <select id="modActionType" class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white">
                                                <option value="kick">Kick</option>
                                                <option value="ban">Ban</option>
                                                <option value="timeout">Timeout</option>
                                                <option value="warn">Warn</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Duration (If Timeout)</label>
                                            <input type="text" id="modDuration" placeholder="e.g. 1h, 1d" class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white">
                                        </div>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Reason</label>
                                        <input type="text" id="modReason" class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white">
                                    </div>
                                    <button type="submit" class="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl shadow-[0_0_20px_rgba(225,29,72,0.3)] transition-all">Strike with Hammer</button>
                                </form>
                            </div>

                            <div class="space-y-8">
                                <div class="glass-card rounded-3xl p-8 border border-white/5">
                                    <h3 class="text-xl font-bold text-white mb-4">🔇 Mute System Setup</h3>
                                    <form class="config-form flex flex-col gap-4">
                                        <input type="hidden" name="guildId" value="${guild.id}">
                                        ${buildSelect('muteRole', roles, config.muteRole, 'Mute Role')}
                                        <button type="submit" class="bg-white/10 py-3 rounded-xl text-white font-bold hover:bg-white/20 border border-white/10">Save Role</button>
                                    </form>
                                </div>
                                <div class="glass-card rounded-3xl p-8 border border-white/5">
                                    <h3 class="text-xl font-bold text-white mb-4">📝 User Notes (Read-Only)</h3>
                                    <div class="flex gap-4">
                                        <input type="text" id="lookupNotesId" placeholder="User ID" class="flex-1 bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white">
                                        <button type="button" onclick="Swal.fire('Info', 'User notes feature connects directly to Discord commands. Use <b>/usernotes view</b> in the server.', 'info')" class="bg-blue-600 px-6 rounded-xl text-white font-bold hover:bg-blue-500">Lookup</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-economy" class="tab-content">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div class="glass-card rounded-3xl p-8 border-t-4 border-t-yellow-500">
                                <h2 class="text-2xl font-black text-white mb-6"><i class="fa-solid fa-vault text-yellow-500 mr-2"></i> Central Reserve</h2>
                                <form id="bankerForm" class="space-y-4">
                                    <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Target User ID</label><input type="text" id="bankUserId" required class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                                    <div class="grid grid-cols-2 gap-4">
                                        <div>
                                            <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Action</label>
                                            <select id="bankAction" class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white"><option value="add">Add</option><option value="remove">Remove</option><option value="set">Set Exact</option></select>
                                        </div>
                                        <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Amount</label><input type="number" id="bankAmount" required class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                                    </div>
                                    <button type="submit" class="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-black py-3 rounded-xl shadow-[0_0_20px_rgba(202,138,4,0.3)] transition-all">Override Balance</button>
                                </form>
                            </div>

                            <div class="space-y-6">
                                <div class="glass-card rounded-3xl p-8 border border-white/5">
                                    <h3 class="text-xl font-bold text-white mb-4"><i class="fa-solid fa-dharmachakra text-green-500 mr-2"></i> 24/7 Roulette Dealer</h3>
                                    <form class="config-form flex gap-4">
                                        <input type="hidden" name="guildId" value="${guild.id}">
                                        <div class="flex-1">${buildSelect('rouletteChannel', textChannels, config.rouletteChannel, 'Roulette Channel')}</div>
                                        <button type="submit" class="bg-green-600 px-6 rounded-xl text-white font-bold hover:bg-green-500">Save</button>
                                    </form>
                                </div>
                                <div class="glass-card rounded-3xl p-8 border border-red-500/30 bg-red-500/5">
                                    <h3 class="text-xl font-bold text-red-500 mb-2"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Reset Economy (/reseteco)</h3>
                                    <form id="wipeForm" class="flex gap-4 mt-4">
                                        <input type="text" id="wipeUserId" required placeholder="User ID to Wipe" class="flex-1 bg-[#09090b] border border-red-500/50 rounded-xl px-4 py-3 text-white">
                                        <button type="submit" class="bg-red-600 px-6 rounded-xl text-white font-bold hover:bg-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)]">WIPE</button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-engagement" class="tab-content">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div class="glass-card rounded-3xl p-8 border border-white/5">
                                <h3 class="text-2xl font-bold text-white mb-4"><i class="fa-solid fa-gift text-pink-500 mr-2"></i> Giveaway Manager</h3>
                                <form class="config-form mb-6">
                                    <input type="hidden" name="guildId" value="${guild.id}">
                                    <label class="text-xs font-bold text-gray-500 uppercase mb-2 block">Manager Role</label>
                                    <div class="flex gap-4">
                                        <div class="flex-1">${buildSelect('giveawayManagerRoleId', roles, config.giveawayManagerRoleId, 'Manager Role')}</div>
                                        <button type="submit" class="bg-white/10 px-6 rounded-xl text-white font-bold hover:bg-white/20 border border-white/10">Save</button>
                                    </div>
                                </form>
                                <div class="border-t border-white/10 pt-6">
                                    <h4 class="text-sm font-bold text-gray-400 mb-4 uppercase">Live Actions</h4>
                                    <button onclick="fetchGiveaways()" class="w-full bg-pink-600/20 text-pink-400 border border-pink-500/30 py-3 rounded-xl hover:bg-pink-600/30 transition-all font-bold mb-3">View & Manage Active Giveaways</button>
                                    <button onclick="Swal.fire('Info', 'Please use <b>/gcreate</b> in the discord channel you want the giveaway to start in!', 'info')" class="w-full bg-white/5 border border-white/10 text-white py-3 rounded-xl hover:bg-white/10 transition-all">Start New Giveaway</button>
                                </div>
                            </div>

                            <div class="space-y-6">
                                <div class="glass-card rounded-3xl p-8 border border-white/5">
                                    <div class="flex justify-between items-center mb-4">
                                        <h3 class="text-xl font-bold text-white"><i class="fa-solid fa-cake-candles text-teal-500 mr-2"></i> Birthdays</h3>
                                        <button onclick="fetchBirthdays()" class="text-xs bg-teal-500/20 text-teal-400 px-3 py-1 rounded-lg">View List</button>
                                    </div>
                                    <form class="config-form flex gap-4">
                                        <input type="hidden" name="guildId" value="${guild.id}">
                                        <div class="flex-1">${buildSelect('birthdayChannelId', textChannels, config.birthdayChannelId, 'Announcement Channel')}</div>
                                        <button type="submit" class="bg-white/10 px-6 rounded-xl text-white font-bold hover:bg-white/20 border border-white/10">Save</button>
                                    </form>
                                </div>

                                <div class="glass-card rounded-3xl p-8 border border-white/5">
                                    <h3 class="text-xl font-bold text-white mb-4"><i class="fa-solid fa-arrow-up-right-dots text-blue-500 mr-2"></i> Leveling System</h3>
                                    <p class="text-sm text-gray-400 mb-4">Users gain XP automatically. Roles can be assigned at specific levels using the bot's <b>/levelrole</b> command.</p>
                                    <div class="flex gap-4">
                                        <button onclick="Swal.fire('Info', 'To configure reaction roles, please use <b>/reactroles</b> in discord!', 'info')" class="flex-1 bg-white/10 text-white py-3 rounded-xl border border-white/10 hover:bg-white/20">Reaction Roles</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-utilities" class="tab-content">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="glass-card rounded-3xl p-8 border-t-2 border-t-fuchsia-500 flex flex-col">
                                <h3 class="text-xl font-bold text-white mb-2"><i class="fa-solid fa-ticket text-fuchsia-500 mr-2"></i> Ticketing</h3>
                                <p class="text-xs text-gray-400 mb-6">Manage logging channels and panels.</p>
                                <form class="config-form space-y-4 flex-grow">
                                    <input type="hidden" name="guildId" value="${guild.id}">
                                    <div><label class="text-[10px] text-gray-500 uppercase">Lifecycle Logs</label>${buildSelect('ticketLogging_lifecycleChannelId', textChannels, config.ticketLogging?.lifecycleChannelId, 'Log Channel')}</div>
                                    <div><label class="text-[10px] text-gray-500 uppercase">Transcripts</label>${buildSelect('ticketLogging_transcriptChannelId', textChannels, config.ticketLogging?.transcriptChannelId, 'Transcript Channel')}</div>
                                    <button type="submit" class="w-full bg-white/10 py-2 rounded-lg text-white text-sm font-bold border border-white/10">Save</button>
                                </form>
                                <button onclick="Swal.fire('Deploy', 'To deploy the interactive panel, type <b>/ticket setup</b> inside the channel where you want it.', 'info')" class="w-full mt-4 bg-fuchsia-600 hover:bg-fuchsia-500 text-white py-2 rounded-lg text-sm font-bold shadow-[0_0_15px_rgba(192,38,211,0.3)]">Deploy Panel to Channel</button>
                            </div>

                            <div class="space-y-6 flex flex-col">
                                <div class="glass-card rounded-3xl p-6 border-t-2 border-t-indigo-500">
                                    <h3 class="text-xl font-bold text-white mb-2"><i class="fa-solid fa-microphone text-indigo-500 mr-2"></i> Join to Create</h3>
                                    <form class="config-form space-y-4">
                                        <input type="hidden" name="guildId" value="${guild.id}">
                                        <div><label class="text-[10px] text-gray-500 uppercase">Master Voice Channel</label>${buildSelect('joinToCreateChannelId', voiceChannels, config.joinToCreateChannelId, 'Master Voice Channel')}</div>
                                        <button type="submit" class="w-full bg-white/10 py-2 rounded-lg text-white text-sm font-bold border border-white/10">Save</button>
                                    </form>
                                    <button onclick="fetchJTCStatus()" class="w-full mt-4 border border-indigo-500/50 text-indigo-400 py-2 rounded-lg text-sm font-bold bg-indigo-500/10 hover:bg-indigo-500/20">View Active Sessions</button>
                                </div>
                                <div class="glass-card rounded-3xl p-6 border border-white/5">
                                    <h3 class="text-lg font-bold text-white mb-3"><i class="fa-solid fa-clipboard-user text-violet-500 mr-2"></i> App Admin</h3>
                                    <form class="config-form flex flex-col gap-3">
                                        <input type="hidden" name="guildId" value="${guild.id}">
                                        ${buildSelect('appAdminChannelId', textChannels, config.appAdminChannelId, 'App Review Channel')}
                                        <button type="submit" class="bg-white/10 py-2 rounded-lg text-white text-sm font-bold border border-white/10">Save</button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-guide" class="tab-content">
                        <div class="grid grid-cols-1 gap-8">
                            <div class="glass-card rounded-3xl p-8 border-t-4 border-t-teal-500">
                                <h2 class="text-2xl font-black text-white mb-6"><i class="fa-solid fa-book-open text-teal-500 mr-2"></i> Operations Guide & Commands</h2>
                                
                                <div class="space-y-6">
                                    <div class="bg-black/40 p-6 rounded-2xl border border-white/5">
                                        <h3 class="text-xl font-bold text-rose-400 mb-2">🛡️ Moderation System</h3>
                                        <p class="text-gray-400 text-sm mb-4">Use these commands to manage server security.</p>
                                        <ul class="text-sm text-gray-300 space-y-2 list-disc list-inside">
                                            <li><b>/ban, /kick, /timeout, /warn</b>: Standard punishment commands for rule-breakers.</li>
                                            <li><b>/massban, /masskick</b>: Handle large raids efficiently.</li>
                                            <li><b>/mute apply/remove/setrole</b>: Manage mutes using the designated Mute role in Server Settings.</li>
                                            <li><b>/purge [amount]</b>: Clear large amounts of messages in a channel.</li>
                                            <li><b>/cases, /warnings</b>: Review a user's infraction history.</li>
                                            <li><b>/lock, /unlock</b>: Prevent users from speaking during emergencies.</li>
                                            <li><b>/usernotes add/remove/view</b>: Add private staff notes to user profiles.</li>
                                        </ul>
                                    </div>

                                    <div class="bg-black/40 p-6 rounded-2xl border border-white/5">
                                        <h3 class="text-xl font-bold text-yellow-400 mb-2">💰 Virtual Economy & Bank</h3>
                                        <p class="text-gray-400 text-sm mb-4">A rich virtual economy system with jobs, banks, and casinos.</p>
                                        <ul class="text-sm text-gray-300 space-y-2 list-disc list-inside">
                                            <li><b>/work, /daily, /crime, /scavenge, /fish, /mine</b>: Main earning commands.</li>
                                            <li><b>/bank deposit/withdraw/transfer/view</b>: Secure money from robbers.</li>
                                            <li><b>/shop browse/buy</b>: Purchase items and roles from the store.</li>
                                            <li><b>/roulette, /blackjack, /slots, /scratchcard, /teenpatti, /highcard</b>: Active casino games.</li>
                                            <li><b>/eleaderboard</b>: View the richest players on the server.</li>
                                            <li><b>/reseteco, /banker</b>: Admin-only commands to override or wipe user balances (Available in Dashboard).</li>
                                        </ul>
                                    </div>

                                    <div class="bg-black/40 p-6 rounded-2xl border border-white/5">
                                        <h3 class="text-xl font-bold text-fuchsia-400 mb-2">🎫 Utilities & Support</h3>
                                        <p class="text-gray-400 text-sm mb-4">Essential tools to run your community workflows.</p>
                                        <ul class="text-sm text-gray-300 space-y-2 list-disc list-inside">
                                            <li><b>/ticket setup</b>: Run this inside a channel to spawn an interactive Ticket Panel.</li>
                                            <li><b>/claim, /close, /priority</b>: Staff commands to manage open tickets.</li>
                                            <li><b>/app-admin</b>: Create and review staff applications.</li>
                                            <li><b>/jointocreate setup</b>: Set up a master voice channel. When users join, they get their own temporary VC.</li>
                                            <li><b>/verification setup</b>: Create a manual or auto-verification gate for new members.</li>
                                        </ul>
                                    </div>

                                    <div class="bg-black/40 p-6 rounded-2xl border border-white/5">
                                        <h3 class="text-xl font-bold text-emerald-400 mb-2">🎁 Community Engagement</h3>
                                        <p class="text-gray-400 text-sm mb-4">Keep your server active with levels, birthdays, and giveaways.</p>
                                        <ul class="text-sm text-gray-300 space-y-2 list-disc list-inside">
                                            <li><b>/gcreate, /gend, /greroll, /gdelete</b>: Full giveaway management for your server.</li>
                                            <li><b>/level setup, /levelrole, /rank, /leaderboard</b>: Setup XP tracking and auto-role rewards.</li>
                                            <li><b>/birthday set/list/next</b>: Allow users to set their birthdays for auto-announcements.</li>
                                            <li><b>/reactroles setup</b>: Build interactive panels where users click emojis to get roles.</li>
                                            <li><b>/welcome setup, /goodbye setup</b>: Configure professional join/leave messages.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </main>

            <script>
                const currentGuildId = document.getElementById('globalGuildId').value;

                function switchTab(tabId) {
                    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                    document.getElementById('tab-' + tabId).classList.add('active');
                    
                    document.querySelectorAll('.nav-btn').forEach(btn => {
                        btn.classList.remove('bg-fuchsia-500/10', 'text-fuchsia-400', 'border-fuchsia-500/20');
                        btn.classList.add('text-gray-400', 'border-transparent');
                    });
                    const activeBtn = document.querySelector(\`.nav-btn[data-target="\${tabId}"]\`);
                    activeBtn.classList.remove('text-gray-400', 'border-transparent');
                    activeBtn.classList.add('bg-fuchsia-500/10', 'text-fuchsia-400', 'border-fuchsia-500/20');

                    const titles = {
                        'overview': { t: 'Command Center', d: 'System status and live analytics.' },
                        'settings': { t: 'Server Settings', d: 'Configure base roles, verification, and logging.' },
                        'moderation': { t: 'Security & Moderation', d: 'Manage punishments, timeouts, and security roles.' },
                        'economy': { t: 'Economy Banker', d: 'Manage player balances, wipe accounts, and set casinos.' },
                        'engagement': { t: 'Community Engagement', d: 'Manage Giveaways, Birthdays, and Leveling systems.' },
                        'utilities': { t: 'System Utilities', d: 'Manage Tickets, Applications, and Voice.' },
                        'guide': { t: 'Bot Documentation', d: 'Learn how to use all the bot modules and commands.' }
                    };
                    document.getElementById('page-title').innerText = titles[tabId].t;
                    document.getElementById('page-desc').innerText = titles[tabId].d;
                }

                // ================= API CALLS & FORMS =================

                // Universal Config Saver
                document.querySelectorAll('.config-form').forEach(form => {
                    form.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const formData = new FormData(form);
                        const data = Object.fromEntries(formData.entries());
                        const btn = form.querySelector('button[type="submit"]');
                        const originalText = btn.innerHTML;
                        
                        btn.innerHTML = 'Saving...'; btn.disabled = true;
                        
                        try {
                            const response = await fetch('/admin/api/config/update', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
                            });
                            if(response.ok) Swal.fire({ title: 'Config Saved!', icon: 'success', background: '#09090b', color: '#fff', timer: 1500, showConfirmButton: false });
                            else throw new Error('Save failed');
                        } catch(err) { Swal.fire({ title: 'Error', text: 'Failed to update database.', icon: 'error', background: '#09090b', color: '#fff' }); }
                        finally { btn.innerHTML = originalText; btn.disabled = false; }
                    });
                });

                // Banker Form
                document.getElementById('bankerForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const userId = document.getElementById('bankUserId').value;
                    const action = document.getElementById('bankAction').value;
                    const amount = document.getElementById('bankAmount').value;
                    try {
                        const response = await fetch('/admin/api/economy/edit', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId, guildId: currentGuildId, action, amount }) });
                        if(response.ok) Swal.fire({title: 'Success', text: 'Balance updated.', icon: 'success', background: '#09090b', color: '#fff'});
                    } catch(e) { Swal.fire({title: 'Error', text: 'Failed to update balance.', icon: 'error', background: '#09090b', color: '#fff'}); }
                });

                // Wipe Economy Data
                document.getElementById('wipeForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const userId = document.getElementById('wipeUserId').value;
                    const confirm = await Swal.fire({ title: 'Are you sure?', text: "Permanently delete their economy data?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', background: '#09090b', color: '#fff' });
                    if (confirm.isConfirmed) {
                        try {
                            await fetch('/admin/api/economy/wipe', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId, guildId: currentGuildId }) });
                            Swal.fire({ title: 'Annihilated!', icon: 'success', background: '#09090b', color: '#fff' });
                            document.getElementById('wipeUserId').value = ''; 
                        } catch(e) {}
                    }
                });

                // Moderation Form
                document.getElementById('modActionForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const data = {
                        guildId: currentGuildId,
                        userId: document.getElementById('modUserId').value,
                        action: document.getElementById('modActionType').value,
                        duration: document.getElementById('modDuration').value,
                        reason: document.getElementById('modReason').value || "No reason provided via dashboard."
                    };
                    
                    const response = await fetch('/admin/api/moderation/execute', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
                    const resData = await response.json();
                    
                    if(response.ok) Swal.fire({title: 'Action Successful', text: resData.message, icon: 'success', background: '#09090b', color: '#fff'});
                    else Swal.fire({title: 'Action Failed', text: resData.message || 'Bot lacks permissions or user not found.', icon: 'error', background: '#09090b', color: '#fff'});
                });

                // Fetch Utilities (Birthdays, Giveaways, etc)
                async function fetchBirthdays() {
                    const res = await fetch(\`/admin/api/data/birthdays?guildId=\${currentGuildId}\`);
                    const data = await res.json();
                    if(data.length === 0) return Swal.fire({title: 'No Birthdays', text: 'No users have set their birthday.', icon: 'info', background: '#09090b', color: '#fff'});
                    let html = '<ul class="text-left text-sm space-y-2 max-h-60 overflow-y-auto">';
                    data.forEach(b => html += \`<li class="bg-[#050505] p-3 rounded border border-white/10">User ID: <span class="text-fuchsia-400">\${b.user_id}</span> | Date: \${b.birth_month}/\${b.birth_day}</li>\`);
                    html += '</ul>';
                    Swal.fire({title: '🎂 Upcoming Birthdays', html, background: '#09090b', color: '#fff'});
                }

                async function fetchGiveaways() {
                    const res = await fetch(\`/admin/api/data/giveaways?guildId=\${currentGuildId}\`);
                    const data = await res.json();
                    if(data.length === 0) return Swal.fire({title: 'No Giveaways', text: 'There are no active giveaways running right now.', icon: 'info', background: '#09090b', color: '#fff'});
                    let html = '<ul class="text-left text-sm space-y-2 max-h-60 overflow-y-auto">';
                    data.forEach(g => html += \`<li class="bg-[#050505] p-3 rounded border border-white/10 flex justify-between items-center">
                        <span>Prize: <span class="text-pink-400 font-bold">\${g.prize}</span></span>
                        <button onclick="endGiveaway('\${g.message_id}')" class="bg-red-600/20 text-red-500 border border-red-500/50 px-3 py-1 rounded hover:bg-red-600/40">End Now</button>
                    </li>\`);
                    html += '</ul>';
                    Swal.fire({title: '🎁 Active Giveaways', html, background: '#09090b', color: '#fff', showConfirmButton: false});
                }

                async function endGiveaway(messageId) {
                    await fetch('/admin/api/data/giveaways/end', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ messageId, guildId: currentGuildId }) });
                    Swal.fire({title: 'Ended', text: 'Giveaway processing in Discord...', icon: 'success', background: '#09090b', color: '#fff'});
                }

                async function fetchJTCStatus() {
                    const res = await fetch(\`/admin/api/data/jtc?guildId=\${currentGuildId}\`);
                    const data = await res.json();
                    if(data.length === 0) return Swal.fire({title: 'No Active Sessions', text: 'There are no active temporary voice channels right now.', icon: 'info', background: '#09090b', color: '#fff'});
                    let html = '<ul class="text-left text-sm space-y-2 max-h-60 overflow-y-auto">';
                    data.forEach(c => html += \`<li class="bg-[#050505] p-3 rounded border border-white/10 flex justify-between items-center">
                        <div>
                            <span class="text-indigo-400 font-bold">\${c.name}</span><br>
                            <span class="text-xs text-gray-500">ID: \${c.channelId}</span>
                        </div>
                        <span class="bg-white/10 px-3 py-1 rounded-lg text-xs">\${c.members} members</span>
                    </li>\`);
                    html += '</ul>';
                    Swal.fire({title: '🎙️ Active JTC Sessions', html, background: '#09090b', color: '#fff'});
                }

            </script>
        </body>
        </html>
        `;
    };

    // 🏠 MAIN DASHBOARD ROUTE
    dashboard.get('/', async (req, res) => {
        const guild = client.guilds.cache.first();
        if (!guild) return res.send("<h1 style='color:white'>Bot is not in any servers! Invite it first.</h1>");
        const config = await getGuildConfig(client, guild.id);
        res.send(renderPage(client, guild, config));
    });

    // ⚡ API: Universal Config Saver (Handles Nested Data Automatically)
    dashboard.post('/api/config/update', async (req, res) => {
        try {
            const { guildId, ...settings } = req.body;
            if(!guildId) throw new Error("No guild specified");
            const currentConfig = await getGuildConfig(client, guildId) || {};
            let updates = {};

            for (const [key, value] of Object.entries(settings)) {
                const cleanVal = value === "" ? null : value;
                if (key.includes('_')) {
                    const [parent, child] = key.split('_');
                    if (!updates[parent]) updates[parent] = { ...(currentConfig[parent] || {}) }; 
                    updates[parent][child] = cleanVal;
                } else { updates[key] = cleanVal; }
            }
            await updateGuildConfig(client, guildId, updates);
            res.sendStatus(200);
        } catch (error) { res.status(500).send("Error updating configuration."); }
    });

    // ⚡ API: Economy Banker Override
    dashboard.post('/api/economy/edit', async (req, res) => {
        const { userId, guildId, action, amount } = req.body;
        const numAmount = parseInt(amount);
        try {
            const userData = await getEconomyData(client, guildId, userId);
            let oldBalance = userData.wallet || 0;
            if (action === 'add') userData.wallet = oldBalance + numAmount;
            else if (action === 'remove') userData.wallet = Math.max(0, oldBalance - numAmount);
            else if (action === 'set') userData.wallet = numAmount;
            await setEconomyData(client, guildId, userId, userData);
            res.sendStatus(200);
        } catch (error) { res.status(500).send("Error"); }
    });

    // ⚡ API: Danger Zone - Wipe Economy Data
    dashboard.post('/api/economy/wipe', async (req, res) => {
        const { userId, guildId } = req.body;
        try {
            await setEconomyData(client, guildId, userId, { wallet: 0, bank: 0, bankLevel: 0, xp: 0, level: 1, inventory: {} });
            res.sendStatus(200);
        } catch (error) { res.status(500).send("Error"); }
    });

    // ⚡ API: Moderation Actions (Ban/Kick/Timeout)
    dashboard.post('/api/moderation/execute', async (req, res) => {
        const { guildId, userId, action, reason, duration } = req.body;
        try {
            const guild = client.guilds.cache.get(guildId);
            const member = await guild.members.fetch(userId);
            
            if (action === 'kick') { await member.kick(reason); }
            else if (action === 'ban') { await member.ban({ reason }); }
            else if (action === 'timeout') { await member.timeout(60 * 60 * 1000, reason); } 
            
            res.status(200).json({ message: `Successfully executed ${action} on ${member.user.tag}` });
        } catch (error) {
            res.status(400).json({ message: "Action failed. Check hierarchy permissions or if the user is in the server." });
        }
    });

    // ⚡ API: Fetch Data Lists (Birthdays, Giveaways, JTC)
    dashboard.get('/api/data/birthdays', async (req, res) => {
        try {
            const result = await db.query('SELECT user_id, birth_month, birth_day FROM birthdays WHERE guild_id = $1 ORDER BY birth_month, birth_day LIMIT 50', [req.query.guildId]);
            res.json(result.rows);
        } catch (e) { res.json([]); }
    });

    dashboard.get('/api/data/giveaways', async (req, res) => {
        try {
            const result = await db.query('SELECT message_id, prize FROM giveaways WHERE guild_id = $1 AND ended = false', [req.query.guildId]);
            res.json(result.rows);
        } catch (e) { res.json([]); }
    });

    // ⚡ API: End Giveaway Early
    dashboard.post('/api/data/giveaways/end', async (req, res) => {
        const { messageId, guildId } = req.body;
        try {
            await db.query('UPDATE giveaways SET end_time = $1 WHERE message_id = $2', [Date.now(), messageId]);
            res.sendStatus(200);
        } catch (e) { res.sendStatus(500); }
    });

    // ⚡ API: Fetch JTC Channels from Memory & Guild Cache
    dashboard.get('/api/data/jtc', async (req, res) => {
        try {
            const guildId = req.query.guildId;
            const guild = client.guilds.cache.get(guildId);
            const config = await getGuildConfig(client, guildId);
            
            if (!guild || !config.joinToCreateChannelId) return res.json([]);

            const masterChannel = guild.channels.cache.get(config.joinToCreateChannelId);
            if (!masterChannel) return res.json([]);

            // Dynamically scan for private JTC Voice Channels
            // Criteria: Voice channels that share the exact same Parent Category as the Master Channel,
            // but are NOT the master channel themselves.
            const activeSessions = [];
            guild.channels.cache.forEach(c => {
                if (c.type === 2 && c.parentId === masterChannel.parentId && c.id !== masterChannel.id) {
                    activeSessions.push({
                        channelId: c.id,
                        name: c.name,
                        members: c.members.size
                    });
                }
            });

            res.json(activeSessions);
        } catch (e) { 
            res.json([]); 
        }
    });

    app.use('/admin', dashboard);
}
