import basicAuth from 'express-basic-auth';
import express from 'express';
import { getEconomyData, setEconomyData } from './utils/economy.js';
import { getGuildConfig, updateGuildConfig } from './services/guildConfig.js';
import { db } from './utils/database.js';
import { WarningService } from './services/warningService.js';
import { startPersistentRoulettes, liveRouletteState } from './commands/Economy/roulette.js';

export function attachDashboard(app, client) {
    const dashboard = express.Router();

    dashboard.use(basicAuth({ users: { 'admin': 'supersecretpassword123' }, challenge: true }));
    dashboard.use(express.urlencoded({ extended: true }));
    dashboard.use(express.json());

    const renderPage = (client, guild, config) => {
        const textChannels = guild.channels.cache.filter(c => c.type === 0).sort((a,b) => a.position - b.position).map(c => ({ id: c.id, label: `# ${c.name}` }));
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).sort((a,b) => a.position - b.position).map(c => ({ id: c.id, label: `🔊 ${c.name}` }));
        
        // FIXED: Re-added the categories variable!
        const categories = guild.channels.cache.filter(c => c.type === 4).sort((a,b) => a.position - b.position).map(c => ({ id: c.id, label: `📁 ${c.name}` }));
        
        const roles = guild.roles.cache.sort((a,b) => b.position - a.position).map(r => ({ id: r.id, label: `@ ${r.name}` }));

        const buildSelect = (name, optionsList, selectedId, placeholder) => {
            let html = `<select name="${name}" class="w-full bg-[#09090b]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-fuchsia-500 transition-all cursor-pointer">`;
            html += `<option value="" class="bg-[#09090b] text-gray-500">-- Select ${placeholder} --</option>`;
            optionsList.forEach(opt => { html += `<option value="${opt.id}" class="bg-[#09090b] text-white" ${String(opt.id) === String(selectedId) ? 'selected' : ''}>${opt.label}</option>`; });
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
                ::-webkit-scrollbar { width: 6px; height: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
                .tab-content { display: none; animation: fadeIn 0.3s ease-in-out; } .tab-content.active { display: block; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                input, select { background-color: #09090b !important; }

                /* Casino Board Styles */
                .roulette-board { display: grid; grid-template-columns: repeat(14, 1fr); gap: 4px; padding: 10px; background-color: #0b4d2a; border-radius: 12px; border: 4px solid #3a200f; box-shadow: inset 0 0 20px rgba(0,0,0,0.8); }
                .r-cell { position: relative; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer; user-select: none; height: 50px; font-size: 1.1rem; transition: opacity 0.2s; z-index: 1; }
                .r-cell:hover { opacity: 0.7; border-color: white; z-index: 10; }
                .r-zero { grid-row: 1 / span 3; background-color: #27ae60; font-size: 1.5rem; }
                .r-red { background-color: #c0392b; } .r-black { background-color: #1a1a1a; } .r-green { background-color: #27ae60; } .r-transparent { background: transparent; pointer-events: none; }
                
                /* Advanced Betting Hitboxes */
                .hb-v { position: absolute; top: -6px; left: 10%; width: 80%; height: 8px; z-index: 20; background: rgba(255,255,255,0.0); transition: 0.2s; }
                .hb-h { position: absolute; top: 10%; right: -6px; width: 8px; height: 80%; z-index: 20; background: rgba(255,255,255,0.0); transition: 0.2s; }
                .hb-c { position: absolute; top: -6px; right: -6px; width: 12px; height: 12px; z-index: 25; background: rgba(255,255,255,0.0); transition: 0.2s; border-radius: 50%; }
                .hb-sl { position: absolute; bottom: -6px; right: -6px; width: 12px; height: 12px; z-index: 25; background: rgba(255,255,255,0.0); transition: 0.2s; border-radius: 50%; }
                .hb-v:hover, .hb-h:hover, .hb-c:hover, .hb-sl:hover { background: rgba(241, 196, 15, 0.8); box-shadow: 0 0 5px #f1c40f; cursor: pointer; }

                /* Chips */
                .chip-token { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 900; color: white; border: 2px dashed rgba(255,255,255,0.7); box-shadow: 2px 2px 6px rgba(0,0,0,0.8); pointer-events: none; text-shadow: 1px 1px 0 #000; z-index: 30; }
                .val-10 { background: #3498db; } .val-100 { background: #9b59b6; } .val-1k { background: #e67e22; } .val-10k { background: #e74c3c; } .val-100k { background: #f1c40f; color: black; text-shadow: none;}

                .selector-chip { width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; border: 3px dashed rgba(255,255,255,0.4); cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.4); }
                .selector-chip.active { transform: scale(1.15) translateY(-5px); border-color: white; box-shadow: 0 10px 20px rgba(0,0,0,0.6); z-index: 10; }
                
                /* Wheel Spin Animation CSS */
                .wheel-box { width: 140px; height: 140px; border-radius: 50%; border: 6px solid #1a1a1a; background: radial-gradient(circle, #111 0%, #000 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 30px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,0,0,0.9); position: relative; overflow: hidden; transition: all 0.3s ease; flex-shrink: 0; }
                .wheel-number { font-size: 4rem; font-weight: 900; text-shadow: 0 4px 15px rgba(0,0,0,0.8); z-index: 10; font-variant-numeric: tabular-nums; transition: transform 0.05s ease; }
                .spinning-glow { box-shadow: 0 0 50px #f1c40f, inset 0 0 30px #e74c3c; border-color: #f1c40f; animation: spinGlow 0.5s linear infinite; }
                @keyframes spinGlow { 0% { filter: hue-rotate(0deg); transform: scale(1.05); } 100% { filter: hue-rotate(360deg); transform: scale(1.05); } }

                .win-highlight { animation: pulseWin 0.8s infinite alternate !important; border-color: #f1c40f !important; z-index: 20; color: #f1c40f !important; }
                @keyframes pulseWin { 0% { box-shadow: 0 0 10px #f1c40f, inset 0 0 10px #f1c40f; } 100% { box-shadow: 0 0 30px #f1c40f, inset 0 0 20px #f1c40f; } }
            </style>
        </head>
        <body class="flex h-screen overflow-hidden">
            <aside class="w-72 bg-[#050505] border-r border-white/5 flex flex-col z-20 relative shadow-2xl">
                <div class="p-8 border-b border-white/5 flex flex-col items-center justify-center relative z-10">
                    <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-blue-600 flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.4)] mb-4"><i class="fa-solid fa-bolt text-3xl text-white"></i></div>
                    <h1 class="text-2xl font-black tracking-widest text-white uppercase">CHAOS<span class="text-fuchsia-500">OS</span></h1>
                </div>
                <nav class="flex-1 p-4 space-y-1 relative z-10 overflow-y-auto" id="nav-links">
                    <p class="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3 mt-2">Core Systems</p>
                    <button onclick="switchTab('overview')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20" data-target="overview"><i class="fa-solid fa-chart-pie w-5 text-center"></i> Overview</button>
                    <button onclick="switchTab('settings')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="settings"><i class="fa-solid fa-gear w-5 text-center"></i> Settings</button>
                    <p class="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3 mt-6">Management</p>
                    <button onclick="switchTab('moderation')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="moderation"><i class="fa-solid fa-gavel w-5 text-center text-rose-400"></i> Moderation</button>
                    <button onclick="switchTab('economy')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="economy"><i class="fa-solid fa-vault w-5 text-center text-yellow-400"></i> Economy Banker</button>
                    <p class="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3 mt-6">Features</p>
                    <button onclick="switchTab('casino')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="casino"><i class="fa-solid fa-dice w-5 text-center text-green-400"></i> Live Casino</button>
                    <button onclick="switchTab('engagement')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="engagement"><i class="fa-solid fa-users-rays w-5 text-center text-emerald-400"></i> Engagement</button>
                    <button onclick="switchTab('utilities')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="utilities"><i class="fa-solid fa-toolbox w-5 text-center text-blue-400"></i> Utilities</button>
                    <p class="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3 mt-6">Help</p>
                    <button onclick="switchTab('guide')" class="nav-btn w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-white/5" data-target="guide"><i class="fa-solid fa-book w-5 text-center text-teal-400"></i> Bot Guide</button>
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
                            <div><p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Guild ID</p><p class="text-sm font-bold text-white">${guild.id}</p></div>
                        </div>
                    </header>

                    <input type="hidden" id="globalGuildId" value="${guild.id}">
                    
                    <div id="tab-overview" class="tab-content active">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div class="glass-card rounded-2xl p-6 border-t-2 border-t-fuchsia-500 flex flex-col">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="text-xl font-black text-white">Server Info</h3>
                                    <i class="fa-solid fa-server text-fuchsia-500 text-2xl"></i>
                                </div>
                                <p class="text-gray-400 text-sm mb-2"><strong class="text-white">Name:</strong> ${guild.name}</p>
                                <p class="text-gray-400 text-sm mb-2"><strong class="text-white">Created:</strong> ${guild.createdAt.toDateString()}</p>
                                <p class="text-gray-400 text-sm mb-2"><strong class="text-white">Boosts:</strong> ${guild.premiumSubscriptionCount || 0} (Tier ${guild.premiumTier})</p>
                                <p class="text-gray-400 text-sm"><strong class="text-white">Total Roles:</strong> ${guild.roles.cache.size}</p>
                            </div>
                            <div class="glass-card rounded-2xl p-6 border-t-2 border-t-blue-500 flex flex-col">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="text-xl font-black text-white">Community</h3>
                                    <i class="fa-solid fa-users text-blue-500 text-2xl"></i>
                                </div>
                                <p class="text-gray-400 text-sm mb-2"><strong class="text-white">Total Members:</strong> ${guild.memberCount.toLocaleString()}</p>
                                <p class="text-gray-400 text-sm mb-2"><strong class="text-white">Text Channels:</strong> ${textChannels.length}</p>
                                <p class="text-gray-400 text-sm mb-2"><strong class="text-white">Voice Channels:</strong> ${voiceChannels.length}</p>
                                <p class="text-gray-400 text-sm"><strong class="text-white">Categories:</strong> ${categories.length}</p>
                            </div>
                            <div class="glass-card rounded-2xl p-6 border-t-2 border-t-emerald-500 flex flex-col">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="text-xl font-black text-white">Bot Status</h3>
                                    <i class="fa-solid fa-robot text-emerald-500 text-2xl"></i>
                                </div>
                                <p class="text-gray-400 text-sm mb-2"><strong class="text-white">Latency (Ping):</strong> ${client.ws.ping}ms</p>
                                <p class="text-gray-400 text-sm mb-2"><strong class="text-white">System Uptime:</strong> ${(client.uptime / 3600000).toFixed(2)} hours</p>
                                <p class="text-gray-400 text-sm mb-2"><strong class="text-white">Database Link:</strong> <span class="text-emerald-400">Connected</span></p>
                                <p class="text-gray-400 text-sm"><strong class="text-white">Bot Username:</strong> ${client.user.tag}</p>
                            </div>
                        </div>
                    </div>

                    <div id="tab-casino" class="tab-content">
                        <div class="glass-card rounded-3xl p-8 border-t-4 border-t-green-500 relative">
                            
                            <div class="flex justify-between items-start mb-6">
                                <div>
                                    <h2 class="text-3xl font-black text-white mb-2 tracking-tight">Live Discord Casino</h2>
                                    <p class="text-gray-400 max-w-lg mb-2">Synchronized with your server's 24/7 Dealer. Filter stats and place bets using your <span class="bg-red-600 text-white text-xs px-2 py-1 rounded ml-1">DEMO BALANCE</span>.</p>
                                    <p class="text-sm font-bold mt-2" id="casinoStatus"><span class="text-gray-500"><i class="fa-solid fa-spinner fa-spin"></i> Connecting to Discord...</span></p>
                                </div>
                                <div class="bg-[#09090b] px-6 py-4 rounded-2xl border border-green-500/30 flex flex-col items-end gap-2 shadow-xl">
                                    <div class="text-right">
                                        <p class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Demo Balance</p>
                                        <p class="text-3xl font-black text-green-400" id="demoBalanceDisplay">$100,000</p>
                                    </div>
                                    <button onclick="resetDemoBalance()" class="text-xs text-gray-400 hover:text-white transition-all"><i class="fa-solid fa-rotate-right"></i> Reset to $100k</button>
                                </div>
                            </div>

                            <div class="bg-[#09090b] rounded-2xl border border-white/5 p-4 mb-6 shadow-xl">
                                <div class="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                                    <h4 class="text-sm font-bold text-gray-400 uppercase tracking-widest"><i class="fa-solid fa-chart-simple text-blue-500 mr-2"></i> Table Analytics</h4>
                                    <select id="spinCountFilter" class="bg-black text-white text-xs border border-white/10 rounded px-2 py-1 outline-none font-bold">
                                        <option value="100">Last 100 Spins</option>
                                        <option value="200">Last 200 Spins</option>
                                        <option value="500">Last 500 Spins</option>
                                    </select>
                                </div>
                                <div class="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs font-bold mb-4">
                                    <div class="bg-black/50 p-3 rounded-xl border border-white/5">
                                        <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Colors</p>
                                        <p id="statColors">N/A</p>
                                    </div>
                                    <div class="bg-black/50 p-3 rounded-xl border border-white/5">
                                        <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Odd / Even</p>
                                        <p id="statOddEven">N/A</p>
                                    </div>
                                    <div class="bg-black/50 p-3 rounded-xl border border-white/5">
                                        <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Low / High</p>
                                        <p id="statLowHigh">N/A</p>
                                    </div>
                                    <div class="bg-black/50 p-3 rounded-xl border border-white/5">
                                        <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Dozens (1st/2nd/3rd)</p>
                                        <p id="statDozens">N/A</p>
                                    </div>
                                    <div class="bg-black/50 p-3 rounded-xl border border-white/5">
                                        <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Columns (2:1)</p>
                                        <p id="statCols">N/A</p>
                                    </div>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-bold">
                                    <div class="bg-black/50 p-3 rounded-xl border border-white/5">
                                        <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">🔥 Hot Numbers</p>
                                        <p id="statHot" class="text-red-400 text-sm">N/A</p>
                                    </div>
                                    <div class="bg-black/50 p-3 rounded-xl border border-white/5">
                                        <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">🧊 Cold Numbers</p>
                                        <p id="statCold" class="text-blue-400 text-sm">N/A</p>
                                    </div>
                                    <div class="bg-black/50 p-3 rounded-xl border border-white/5 overflow-hidden flex flex-col justify-center cursor-pointer hover:bg-white/10 transition-colors" onclick="showAllOutcomes()" title="Click to view all spins">
                                        <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1 flex justify-between items-center">
                                            <span>📜 Recent Outcomes</span>
                                            <i class="fa-solid fa-expand text-[10px] text-blue-500"></i>
                                        </p>
                                        <p id="statHistory" class="text-sm whitespace-nowrap overflow-x-auto pb-1">N/A</p>
                                    </div>
                                </div>
                            </div>

                            <div class="flex gap-8 mb-6">
                                <div class="flex-1 flex justify-center items-center py-4 bg-[#09090b] rounded-2xl border border-white/5 shadow-inner">
                                    <div class="wheel-box" id="wheelBox"><div id="wheelNumber" class="wheel-number text-green-500">0</div></div>
                                </div>
                                <div class="w-80 bg-[#09090b] rounded-2xl border border-white/5 p-4 flex flex-col h-56 shadow-inner">
                                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 border-b border-white/5 pb-2">Your Bet History</h4>
                                    <div id="demoHistoryList" class="overflow-y-auto flex-1 space-y-2 text-xs font-bold pr-1">
                                        <p class="text-gray-600 italic">Place a bet to record history...</p>
                                    </div>
                                </div>
                            </div>

                            <div class="flex flex-wrap items-center gap-3 mb-4">
                                <p class="text-sm font-bold text-gray-400 uppercase tracking-widest">Chip:</p>
                                <div class="selector-chip val-10 text-white" onclick="selectChip(10, this)">10</div>
                                <div class="selector-chip val-100 text-white active" onclick="selectChip(100, this)">100</div>
                                <div class="selector-chip val-1k text-white" onclick="selectChip(1000, this)">1k</div>
                                <div class="selector-chip val-10k text-white" onclick="selectChip(10000, this)">10k</div>
                                <div class="selector-chip val-100k" onclick="selectChip(100000, this)">100k</div>
                                <div class="flex-grow"></div>
                                <button onclick="repeatBet()" class="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-5 py-2 rounded-xl text-xs font-bold hover:bg-blue-500/40 transition-all">Repeat</button>
                                <button onclick="doubleBet()" class="bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30 px-5 py-2 rounded-xl text-xs font-bold hover:bg-fuchsia-500/40 transition-all">Double</button>
                                <button onclick="clearBets()" class="bg-red-500/20 text-red-400 border border-red-500/30 px-5 py-2 rounded-xl text-xs font-bold hover:bg-red-500/40 transition-all">Clear All</button>
                            </div>

                            <div class="relative">
                                <div class="roulette-board" id="rBoard"></div>
                                <div id="boardOverlay" class="absolute inset-0 z-50 hidden flex-col items-center justify-center rounded-xl bg-black/80 backdrop-blur-md p-4 text-center pointer-events-auto">
                                    <p class="text-2xl md:text-3xl font-black text-white tracking-widest drop-shadow-[0_4px_4px_rgba(0,0,0,1)] bg-black/70 px-8 py-3 rounded-2xl border border-white/20 mb-2 shadow-2xl" id="boardOverlayText">DEALER OFFLINE</p>
                                    <p class="text-xs md:text-sm text-gray-300 bg-black/70 px-4 py-1 rounded-lg border border-white/10" id="boardOverlaySub">Start the 24/7 Dealer in the Economy Banker tab to play.</p>
                                </div>
                            </div>

                            <div class="mt-6 relative">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div class="bg-black/50 p-4 rounded-xl border border-white/5 flex flex-col justify-center">
                                        <h4 class="text-sm font-bold text-blue-400 uppercase tracking-widest mb-3"><i class="fa-solid fa-earth-europe mr-1"></i> French Call Bets</h4>
                                        <div class="flex gap-2 mb-3">
                                            <button data-bet="voisins" onclick="placeCallBet('voisins')" class="flex-1 bg-blue-600/20 text-blue-400 border border-blue-500/50 py-2 rounded-lg hover:bg-blue-600/40 text-[11px] font-bold transition-all">Voisins</button>
                                            <button data-bet="tiers" onclick="placeCallBet('tiers')" class="flex-1 bg-blue-600/20 text-blue-400 border border-blue-500/50 py-2 rounded-lg hover:bg-blue-600/40 text-[11px] font-bold transition-all">Tiers</button>
                                            <button data-bet="orphelins" onclick="placeCallBet('orphelins')" class="flex-1 bg-blue-600/20 text-blue-400 border border-blue-500/50 py-2 rounded-lg hover:bg-blue-600/40 text-[11px] font-bold transition-all">Orphelins</button>
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <input type="number" id="nbTarget" placeholder="Num" class="w-16 bg-[#09090b] border border-white/10 rounded px-2 py-2 text-white text-xs font-bold text-center">
                                            <div class="flex-1 flex flex-col">
                                                <div class="flex justify-between text-[10px] text-gray-500 font-bold mb-1">
                                                    <span>1</span><span>Neighbours: <span id="nbCount" class="text-white">2</span></span><span>5</span>
                                                </div>
                                                <input type="range" id="nbSlider" min="1" max="5" value="2" class="w-full accent-blue-500" oninput="document.getElementById('nbCount').innerText=this.value">
                                            </div>
                                            <button onclick="placeNeighbourBet()" class="bg-teal-600/20 text-teal-400 border border-teal-500/50 px-4 py-2 rounded-lg hover:bg-teal-600/40 text-xs font-bold transition-all">Add</button>
                                        </div>
                                    </div>
                                    <div class="bg-black/50 p-4 rounded-xl border border-white/5 flex flex-col justify-center">
                                        <h4 class="text-sm font-bold text-orange-400 uppercase tracking-widest mb-2"><i class="fa-solid fa-puzzle-piece mr-1"></i> Split & Corner Bets</h4>
                                        <p class="text-xs text-gray-400 leading-relaxed">
                                            Simply <span class="text-white font-bold">hover over the grid lines and borders</span> between the numbers on the board above. Click directly on the intersections to instantly drop <b>Splits</b>, <b>Corners</b>, and <b>Six Line</b> chips exactly like a real casino!
                                        </p>
                                    </div>
                                </div>
                                <div id="advOverlay" class="absolute inset-0 z-50 hidden flex-col items-center justify-center rounded-xl bg-black/80 backdrop-blur-md p-4 text-center pointer-events-auto">
                                    <p class="text-xl font-black text-white tracking-widest drop-shadow-[0_4px_4px_rgba(0,0,0,1)] bg-black/70 px-6 py-2 rounded-2xl border border-white/20 shadow-2xl" id="advOverlayText">DEALER OFFLINE</p>
                                </div>
                            </div>
                            
                            <div id="advancedBetsList" class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2"></div>
                        </div>
                    </div>

                    <div id="tab-settings" class="tab-content">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div class="glass-card rounded-3xl p-8 border border-white/5 flex flex-col">
                                <h3 class="text-2xl font-bold text-white mb-2"><i class="fa-solid fa-user-shield text-emerald-500 mr-2"></i> Server Roles</h3>
                                <form class="config-form space-y-4 flex-grow mt-4">
                                    <input type="hidden" name="guildId" value="${guild.id}">
                                    <div><label class="text-xs font-bold text-gray-500 uppercase">Admin Role</label> ${buildSelect('adminRole', roles, config.adminRole, 'Admin Role')}</div>
                                    <div><label class="text-xs font-bold text-gray-500 uppercase">Mod Role</label> ${buildSelect('modRole', roles, config.modRole, 'Mod Role')}</div>
                                    <button type="submit" class="w-full bg-white/10 hover:bg-emerald-500/20 text-white font-bold py-3 rounded-xl mt-4 border border-white/10 transition-all">Save Config</button>
                                </form>
                            </div>
                            <div class="glass-card rounded-3xl p-8 border border-white/5 flex flex-col">
                                <h3 class="text-2xl font-bold text-white mb-2"><i class="fa-solid fa-door-open text-blue-500 mr-2"></i> Infrastructure</h3>
                                <form class="config-form space-y-4 flex-grow mt-4">
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
                                    <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Target User ID</label><input type="text" id="modUserId" required class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                                    <div class="grid grid-cols-2 gap-4">
                                        <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Action</label><select id="modActionType" class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white"><option value="warn">Warn</option><option value="mute">Mute</option><option value="timeout">Timeout</option><option value="kick">Kick</option><option value="ban">Ban</option></select></div>
                                        <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Duration</label><input type="text" id="modDuration" placeholder="e.g. 1h, 1d" class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                                    </div>
                                    <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Reason</label><input type="text" id="modReason" class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                                    <button type="submit" class="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl transition-all">Strike with Hammer</button>
                                </form>
                            </div>
                            <div class="space-y-8">
                                <div class="glass-card rounded-3xl p-8 border border-white/5">
                                    <h3 class="text-xl font-bold text-white mb-4">🔇 Mute Setup</h3>
                                    <form class="config-form flex flex-col gap-4">
                                        <input type="hidden" name="guildId" value="${guild.id}">
                                        ${buildSelect('muteRole', roles, config.muteRole, 'Mute Role')}
                                        <button type="submit" class="bg-white/10 py-3 rounded-xl text-white font-bold hover:bg-white/20 border border-white/10">Save Role</button>
                                    </form>
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
                                        <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Action</label><select id="bankAction" class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white"><option value="add">Add</option><option value="remove">Remove</option><option value="set">Set Exact</option></select></div>
                                        <div><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Amount</label><input type="number" id="bankAmount" required class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                                    </div>
                                    <button type="submit" class="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-black py-3 rounded-xl transition-all">Override Balance</button>
                                </form>
                            </div>
                            <div class="space-y-6">
                                <div class="glass-card rounded-3xl p-8 border border-white/5">
                                    <h3 class="text-xl font-bold text-white mb-4"><i class="fa-solid fa-dharmachakra text-green-500 mr-2"></i> 24/7 Roulette Dealer</h3>
                                    <form class="config-form flex gap-4">
                                        <input type="hidden" name="guildId" value="${guild.id}"><input type="hidden" name="_action" value="start_roulette">
                                        <div class="flex-1">${buildSelect('rouletteChannel', textChannels, config.rouletteChannel, 'Roulette Channel')}</div>
                                        <button type="submit" class="bg-green-600 px-6 rounded-xl text-white font-bold hover:bg-green-500">Save & Restart</button>
                                    </form>
                                </div>
                                <div class="glass-card rounded-3xl p-8 border border-red-500/30 bg-red-500/5">
                                    <h3 class="text-xl font-bold text-red-500 mb-2"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Reset Economy</h3>
                                    <form id="wipeForm" class="flex gap-4 mt-4">
                                        <input type="text" id="wipeUserId" required placeholder="User ID to Wipe" class="flex-1 bg-[#09090b] border border-red-500/50 rounded-xl px-4 py-3 text-white">
                                        <button type="submit" class="bg-red-600 px-6 rounded-xl text-white font-bold hover:bg-red-500">WIPE</button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-engagement" class="tab-content">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div class="glass-card rounded-3xl p-8 border border-white/5">
                                <h3 class="text-2xl font-bold text-white mb-4"><i class="fa-solid fa-gift text-pink-500 mr-2"></i> Giveaway Manager</h3>
                                <form class="config-form mb-6"><input type="hidden" name="guildId" value="${guild.id}"><label class="text-xs font-bold text-gray-500 uppercase mb-2 block">Manager Role</label><div class="flex gap-4"><div class="flex-1">${buildSelect('giveawayManagerRoleId', roles, config.giveawayManagerRoleId, 'Manager Role')}</div><button type="submit" class="bg-white/10 px-6 rounded-xl text-white font-bold hover:bg-white/20">Save</button></div></form>
                                <div class="border-t border-white/10 pt-6">
                                    <button onclick="fetchGiveaways()" class="w-full bg-pink-600/20 text-pink-400 border border-pink-500/30 py-3 rounded-xl hover:bg-pink-600/30 font-bold mb-3">View Active Giveaways</button>
                                </div>
                            </div>
                            <div class="space-y-6">
                                <div class="glass-card rounded-3xl p-8 border border-white/5">
                                    <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold text-white"><i class="fa-solid fa-cake-candles text-teal-500 mr-2"></i> Birthdays</h3><button onclick="fetchBirthdays()" class="text-xs bg-teal-500/20 text-teal-400 px-3 py-1 rounded-lg hover:bg-teal-500/30">View List</button></div>
                                    <form class="config-form flex gap-4"><input type="hidden" name="guildId" value="${guild.id}"><div class="flex-1">${buildSelect('birthdayChannelId', textChannels, config.birthdayChannelId, 'Announcement Channel')}</div><button type="submit" class="bg-white/10 px-6 rounded-xl text-white font-bold hover:bg-white/20">Save</button></form>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-utilities" class="tab-content">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="glass-card rounded-3xl p-8 border-t-2 border-t-fuchsia-500 flex flex-col">
                                <h3 class="text-xl font-bold text-white mb-2"><i class="fa-solid fa-ticket text-fuchsia-500 mr-2"></i> Ticketing</h3>
                                <form class="config-form space-y-4 flex-grow"><input type="hidden" name="guildId" value="${guild.id}"><div><label class="text-[10px] text-gray-500 uppercase">Lifecycle Logs</label>${buildSelect('ticketLogging_lifecycleChannelId', textChannels, config.ticketLogging?.lifecycleChannelId, 'Log Channel')}</div><div><label class="text-[10px] text-gray-500 uppercase">Transcripts</label>${buildSelect('ticketLogging_transcriptChannelId', textChannels, config.ticketLogging?.transcriptChannelId, 'Transcript Channel')}</div><button type="submit" class="w-full bg-white/10 py-2 rounded-lg text-white text-sm font-bold">Save</button></form>
                            </div>
                            <div class="space-y-6 flex flex-col">
                                <div class="glass-card rounded-3xl p-6 border-t-2 border-t-indigo-500">
                                    <h3 class="text-xl font-bold text-white mb-2"><i class="fa-solid fa-microphone text-indigo-500 mr-2"></i> Join to Create</h3>
                                    <form class="config-form space-y-4"><input type="hidden" name="guildId" value="${guild.id}"><div><label class="text-[10px] text-gray-500 uppercase">Master Voice Channel</label>${buildSelect('joinToCreateChannelId', voiceChannels, config.joinToCreateChannelId, 'Master Voice Channel')}</div><button type="submit" class="w-full bg-white/10 py-2 rounded-lg text-white text-sm font-bold border border-white/10">Save</button></form>
                                    <button onclick="fetchJTCStatus()" class="w-full mt-4 border border-indigo-500/50 text-indigo-400 py-2 rounded-lg text-sm font-bold bg-indigo-500/10 hover:bg-indigo-500/20 transition-all">View Active Sessions</button>
                                </div>
                                <div class="glass-card rounded-3xl p-6 border border-white/5">
                                    <h3 class="text-lg font-bold text-white mb-3"><i class="fa-solid fa-clipboard-user text-violet-500 mr-2"></i> App Admin</h3>
                                    <form class="config-form flex flex-col gap-3"><input type="hidden" name="guildId" value="${guild.id}">${buildSelect('appAdminChannelId', textChannels, config.appAdminChannelId, 'App Review Channel')}<button type="submit" class="bg-white/10 py-2 rounded-lg text-white text-sm font-bold border border-white/10">Save</button></form>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-guide" class="tab-content">
                        <div class="glass-card rounded-3xl p-8 border-t-4 border-t-teal-500">
                            <h2 class="text-2xl font-black text-white mb-6"><i class="fa-solid fa-book-open text-teal-500 mr-2"></i> Operations Guide & Commands</h2>
                            <div class="space-y-6">
                                <div class="bg-black/40 p-6 rounded-2xl border border-white/5"><h3 class="text-xl font-bold text-rose-400 mb-2">🛡️ Moderation System</h3><ul class="text-sm text-gray-300 space-y-2 list-disc list-inside"><li><b>/ban, /kick, /timeout, /warn</b>: Standard punishment commands for rule-breakers.</li><li><b>/massban, /masskick</b>: Handle large raids efficiently.</li><li><b>/mute apply/remove/setrole</b>: Manage mutes using the designated Mute role in Server Settings.</li><li><b>/purge [amount]</b>: Clear large amounts of messages in a channel.</li><li><b>/cases, /warnings</b>: Review a user's infraction history.</li><li><b>/lock, /unlock</b>: Prevent users from speaking during emergencies.</li><li><b>/usernotes add/remove/view</b>: Add private staff notes to user profiles.</li></ul></div>
                                <div class="bg-black/40 p-6 rounded-2xl border border-white/5"><h3 class="text-xl font-bold text-yellow-400 mb-2">💰 Virtual Economy & Bank</h3><ul class="text-sm text-gray-300 space-y-2 list-disc list-inside"><li><b>/work, /daily, /crime, /scavenge, /fish, /mine</b>: Main earning commands.</li><li><b>/bank deposit/withdraw/transfer/view</b>: Secure money from robbers.</li><li><b>/shop browse/buy</b>: Purchase items and roles from the store.</li><li><b>/roulette, /blackjack, /slots, /scratchcard, /teenpatti, /highcard</b>: Active casino games.</li><li><b>/eleaderboard</b>: View the richest players on the server.</li><li><b>/reseteco, /banker</b>: Admin-only commands to override or wipe user balances (Available in Dashboard).</li></ul></div>
                                <div class="bg-black/40 p-6 rounded-2xl border border-white/5"><h3 class="text-xl font-bold text-fuchsia-400 mb-2">🎫 Utilities & Support</h3><ul class="text-sm text-gray-300 space-y-2 list-disc list-inside"><li><b>/ticket setup</b>: Run this inside a channel to spawn an interactive Ticket Panel.</li><li><b>/claim, /close, /priority</b>: Staff commands to manage open tickets.</li><li><b>/app-admin</b>: Create and review staff applications.</li><li><b>/jointocreate setup</b>: Set up a master voice channel. When users join, they get their own temporary VC.</li></ul></div>
                                <div class="bg-black/40 p-6 rounded-2xl border border-white/5"><h3 class="text-xl font-bold text-emerald-400 mb-2">🎁 Community Engagement</h3><ul class="text-sm text-gray-300 space-y-2 list-disc list-inside"><li><b>/gcreate, /gend, /greroll, /gdelete</b>: Full giveaway management for your server.</li><li><b>/level setup, /levelrole, /rank, /leaderboard</b>: Setup XP tracking and auto-role rewards.</li><li><b>/birthday set/list/next</b>: Allow users to set their birthdays for auto-announcements.</li><li><b>/reactroles setup</b>: Build interactive panels where users click emojis to get roles.</li><li><b>/welcome setup, /goodbye setup</b>: Configure professional join/leave messages.</li></ul></div>
                            </div>
                        </div>
                    </div>

                </div>
            </main>

            <script>
                const currentGuildId = document.getElementById('globalGuildId').value;
                const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
                const wheelOrder = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

                let casinoSyncLoop = null; let currentCasinoPhase = 'loading'; let demoBalance = 100000; let selectedChip = 100; 
                let activeBets = {}; 
                let lastBets = {};
                let demoHistoryLog = [];
                let currentCasinoHistory = [];

                // --- TAB NAVIGATION ---
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

                    if(tabId === 'casino') startCasinoSync();
                    else if(casinoSyncLoop) { clearInterval(casinoSyncLoop); casinoSyncLoop = null; }
                }

                // --- POPUP LOGIC ---
                function showAllOutcomes() {
                    if (!currentCasinoHistory || currentCasinoHistory.length === 0) return Swal.fire({title: 'No Data', text: 'No spins recorded yet.', icon: 'info', background: '#09090b', color: '#fff'});
                    
                    let html = '<div class="grid grid-cols-10 gap-2 max-h-60 overflow-y-auto p-2">';
                    currentCasinoHistory.forEach(n => {
                        let colorClass = n === 0 ? 'bg-green-600' : (redNumbers.includes(n) ? 'bg-red-600' : 'bg-gray-800');
                        html += \`<div class="\${colorClass} text-white font-bold py-1 rounded shadow text-sm border border-white/20 text-center">\${n}</div>\`;
                    });
                    html += '</div>';

                    Swal.fire({
                        title: \`Recent \${currentCasinoHistory.length} Outcomes\`,
                        html: html,
                        background: '#09090b',
                        color: '#fff',
                        width: '600px',
                        showConfirmButton: false,
                        showCloseButton: true
                    });
                }

                function showBetDetails(idx) {
                    const h = demoHistoryLog[idx];
                    if(!h) return;
                    
                    let colorClass = h.color === 'green' ? 'text-green-400' : (h.color === 'red' ? 'text-red-500' : 'text-gray-400');
                    let profitText = h.profit > 0 ? \`<span class="text-green-400">+$out\${h.profit.toLocaleString()}</span>\` : (h.profit < 0 ? \`<span class="text-red-400">-$out\${Math.abs(h.profit).toLocaleString()}</span>\` : \`<span class="text-gray-500">$0</span>\`);
                    profitText = profitText.replace('out', '');

                    let html = \`
                    <div class="text-left space-y-4">
                        <div class="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
                            <div>
                                <p class="text-xs text-gray-500 uppercase tracking-widest font-bold">Winning Number</p>
                                <p class="text-4xl font-black \${colorClass}">\${h.num}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-xs text-gray-500 uppercase tracking-widest font-bold">Net Profit</p>
                                <p class="text-2xl font-black">\${profitText}</p>
                            </div>
                        </div>
                        <div>
                            <p class="text-xs text-gray-500 uppercase tracking-widest font-bold mb-2">Total Bet: $\${h.bet.toLocaleString()}</p>
                            <div class="bg-black/50 p-3 rounded-lg border border-white/5 text-sm text-gray-300 leading-relaxed max-h-40 overflow-y-auto">
                                \${h.betsDesc}
                            </div>
                        </div>
                    </div>
                    \`;

                    Swal.fire({
                        title: 'Round Summary',
                        html: html,
                        background: '#09090b',
                        color: '#fff',
                        showConfirmButton: false,
                        showCloseButton: true
                    });
                }

                // --- CASINO LOGIC ---
                if(localStorage.getItem('chaosDemoBalance')) demoBalance = parseInt(localStorage.getItem('chaosDemoBalance'));
                function updateDemoUI() { document.getElementById('demoBalanceDisplay').innerText = '$' + demoBalance.toLocaleString(); localStorage.setItem('chaosDemoBalance', demoBalance); }
                updateDemoUI();
                function resetDemoBalance() { demoBalance = 100000; clearBets(); demoHistoryLog=[]; renderDemoHistory(); updateDemoUI(); }
                function selectChip(val, el) { if(currentCasinoPhase === 'spinning') return; selectedChip = val; document.querySelectorAll('.selector-chip').forEach(c => c.classList.remove('active')); el.classList.add('active'); }
                
                function clearBets() { 
                    if(currentCasinoPhase === 'spinning') return;
                    demoBalance += Object.values(activeBets).reduce((acc, val) => acc + val, 0); 
                    activeBets = {}; 
                    renderAllChips(); 
                }

                function renderAllChips() {
                    document.querySelectorAll('.r-chip').forEach(el => el.remove());
                    for(const [type, amt] of Object.entries(activeBets)) {
                        let el = document.querySelector(\`[data-bet="\${type}"]\`);
                        if(el) {
                            let chipColor = 'val-10'; if (amt >= 100) chipColor = 'val-100'; if (amt >= 1000) chipColor = 'val-1k'; if (amt >= 10000) chipColor = 'val-10k'; if (amt >= 100000) chipColor = 'val-100k';
                            let chipEl = document.createElement('div'); chipEl.className = \`chip-token \${chipColor} r-chip\`; 
                            chipEl.dataset.amt = amt; chipEl.innerText = amt >= 1000 ? (amt/1000)+'k' : amt;
                            chipEl.style.marginTop = \`-\${el.querySelectorAll('.r-chip').length * 3}px\`; 
                            el.appendChild(chipEl);
                        }
                    }
                    renderAdvancedBets();
                    updateDemoUI();
                }

                function doubleBet() {
                    if(currentCasinoPhase === 'spinning') return;
                    let cost = Object.values(activeBets).reduce((a,b)=>a+b, 0);
                    if(cost === 0) return;
                    if(demoBalance < cost) return Swal.fire({title: 'Broke!', text: 'Not enough demo cash.', icon: 'error', background: '#09090b', color: '#fff'});
                    demoBalance -= cost;
                    for(let k in activeBets) activeBets[k] *= 2;
                    renderAllChips();
                }

                function repeatBet() {
                    if(currentCasinoPhase === 'spinning') return;
                    if(Object.keys(lastBets).length === 0) return Swal.fire({title: 'No previous bet!', icon: 'info', background: '#09090b', color: '#fff'});
                    let cost = Object.values(lastBets).reduce((a,b)=>a+b, 0);
                    if(demoBalance < cost) return Swal.fire({title: 'Broke!', text: 'Not enough demo cash.', icon: 'error', background: '#09090b', color: '#fff'});
                    
                    demoBalance += Object.values(activeBets).reduce((a,b)=>a+b, 0); 
                    demoBalance -= cost;
                    activeBets = {...lastBets};
                    renderAllChips();
                }

                function renderAdvancedBets() {
                    let el = document.getElementById('advancedBetsList');
                    let html = '';
                    for(const [k, v] of Object.entries(activeBets)) {
                        if(['red', 'black', 'even', 'odd', '1-18', '19-36', '1-12', '13-24', '25-36', 'col1', 'col2', 'col3', 'voisins', 'tiers', 'orphelins'].includes(k) || !isNaN(k)) continue; 
                        let label = k;
                        if(k.startsWith('neighbour-')) label = \`Neighbours (\${k.split('-')[1]} ±\${k.split('-')[2]})\`;
                        if(k.startsWith('split-')) label = \`Split (\${k.split('-').slice(1).join(',')})\`;
                        if(k.startsWith('corner-')) label = \`Corner (\${k.split('-').slice(1).join(',')})\`;
                        if(k.startsWith('sixline-')) label = \`Six Line (\${k.split('-').slice(1).join(',')})\`;

                        html += \`<div class="bg-white/5 px-3 py-1.5 rounded-lg text-[11px] border border-white/10 flex justify-between">
                            <span class="text-gray-300 font-bold">\${label}</span> <span class="text-green-400 font-black">$\${v.toLocaleString()}</span>
                        </div>\`;
                    }
                    el.innerHTML = html;
                }

                function placeBet(type) {
                    if(currentCasinoPhase === 'spinning') return;
                    if (demoBalance < selectedChip) return Swal.fire({title: 'Broke!', text: 'Not enough demo cash.', icon: 'error', background: '#09090b', color: '#fff'});
                    demoBalance -= selectedChip; activeBets[type] = (activeBets[type] || 0) + selectedChip; 
                    renderAllChips();
                }

                function placeCallBet(type) {
                    if(currentCasinoPhase === 'spinning') return;
                    let nums = [];
                    if (type === 'voisins') nums = [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25];
                    if (type === 'tiers') nums = [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33];
                    if (type === 'orphelins') nums = [1, 20, 14, 31, 9, 17, 34, 6];

                    let cost = nums.length * selectedChip;
                    if (demoBalance < cost) return Swal.fire('Broke!', 'Not enough demo cash for this call bet.', 'error');
                    demoBalance -= cost;
                    nums.forEach(n => { activeBets[n.toString()] = (activeBets[n.toString()] || 0) + selectedChip; });
                    activeBets[type] = (activeBets[type] || 0) + cost; // track parent for highlight
                    renderAllChips();
                }

                function placeNeighbourBet() {
                    if(currentCasinoPhase === 'spinning') return;
                    let target = parseInt(document.getElementById('nbTarget').value);
                    let dist = parseInt(document.getElementById('nbSlider').value);
                    if (isNaN(target) || target < 0 || target > 36) return Swal.fire({title:'Invalid', text:'Enter a valid target number (0-36).', icon:'error', background:'#09090b', color:'#fff'});
                    
                    let idx = wheelOrder.indexOf(target); let nums = [];
                    for(let k = -dist; k <= dist; k++) { let i = (idx + k) % 37; if(i < 0) i += 37; nums.push(wheelOrder[i]); }
                    
                    let cost = nums.length * selectedChip;
                    if (demoBalance < cost) return Swal.fire({title: 'Broke!', text: 'Not enough demo cash.', icon: 'error', background: '#09090b', color: '#fff'});
                    demoBalance -= cost;
                    nums.forEach(n => { activeBets[n.toString()] = (activeBets[n.toString()] || 0) + selectedChip; });
                    let betKey = 'neighbour-' + target + '-' + dist;
                    activeBets[betKey] = (activeBets[betKey] || 0) + cost; // track parent for highlight
                    renderAllChips();
                }

                function getHitboxes(i) {
                    let html = '';
                    if (i % 3 !== 0) html += \`<div class="hb-v" data-bet="split-\${i}-\${i+1}" onclick="event.stopPropagation(); placeBet('split-\${i}-\${i+1}')" title="Split \${i},\${i+1}"></div>\`;
                    if (i <= 33) html += \`<div class="hb-h" data-bet="split-\${i}-\${i+3}" onclick="event.stopPropagation(); placeBet('split-\${i}-\${i+3}')" title="Split \${i},\${i+3}"></div>\`;
                    if (i % 3 !== 0 && i <= 33) html += \`<div class="hb-c" data-bet="corner-\${i}-\${i+1}-\${i+3}-\${i+4}" onclick="event.stopPropagation(); placeBet('corner-\${i}-\${i+1}-\${i+3}-\${i+4}')" title="Corner \${i},\${i+1},\${i+3},\${i+4}"></div>\`;
                    if (i % 3 === 1 && i <= 33) html += \`<div class="hb-sl" data-bet="sixline-\${i}-\${i+1}-\${i+2}-\${i+3}-\${i+4}-\${i+5}" onclick="event.stopPropagation(); placeBet('sixline-\${i}-\${i+1}-\${i+2}-\${i+3}-\${i+4}-\${i+5}')" title="Six Line \${i}-\${i+5}"></div>\`;
                    if (i <= 3) html += \`<div class="hb-h" style="left: -6px; right: auto;" data-bet="split-0-\${i}" onclick="event.stopPropagation(); placeBet('split-0-\${i}')" title="Split 0,\${i}"></div>\`;
                    if (i === 1) html += \`<div class="hb-c" style="top: -6px; left: -6px; right: auto;" data-bet="corner-0-1-2-3" onclick="event.stopPropagation(); placeBet('corner-0-1-2-3')" title="Corner 0,1,2,3"></div>\`;
                    return html;
                }

                function generateBoard() {
                    const boardEl = document.getElementById('rBoard');
                    if (!boardEl) return;
                    let boardHtml = \`<div class="r-cell r-zero" data-bet="0" onclick="placeBet('0')">0</div>\`;
                    for(let i=3; i<=36; i+=3) boardHtml += \`<div class="r-cell \${redNumbers.includes(i) ? 'r-red' : 'r-black'}" data-bet="\${i}" onclick="placeBet('\${i}')">\${i}\${getHitboxes(i)}</div>\`; 
                    boardHtml += \`<div class="r-cell" style="grid-column: 14; grid-row: 1" data-bet="col3" onclick="placeBet('col3')">2:1</div>\`;
                    for(let i=2; i<=35; i+=3) boardHtml += \`<div class="r-cell \${redNumbers.includes(i) ? 'r-red' : 'r-black'}" data-bet="\${i}" onclick="placeBet('\${i}')">\${i}\${getHitboxes(i)}</div>\`; 
                    boardHtml += \`<div class="r-cell" style="grid-column: 14; grid-row: 2" data-bet="col2" onclick="placeBet('col2')">2:1</div>\`;
                    for(let i=1; i<=34; i+=3) boardHtml += \`<div class="r-cell \${redNumbers.includes(i) ? 'r-red' : 'r-black'}" data-bet="\${i}" onclick="placeBet('\${i}')">\${i}\${getHitboxes(i)}</div>\`; 
                    boardHtml += \`<div class="r-cell" style="grid-column: 14; grid-row: 3" data-bet="col1" onclick="placeBet('col1')">2:1</div>\`;
                    boardHtml += \`<div class="r-cell r-transparent" style="grid-column: 1"></div><div class="r-cell" style="grid-column: span 4" data-bet="1-12" onclick="placeBet('1-12')">1st 12</div><div class="r-cell" style="grid-column: span 4" data-bet="13-24" onclick="placeBet('13-24')">2nd 12</div><div class="r-cell" style="grid-column: span 4" data-bet="25-36" onclick="placeBet('25-36')">3rd 12</div>\`;
                    boardHtml += \`<div class="r-cell r-transparent" style="grid-column: 1"></div><div class="r-cell" style="grid-column: span 2" data-bet="1-18" onclick="placeBet('1-18')">1-18</div><div class="r-cell" style="grid-column: span 2" data-bet="even" onclick="placeBet('even')">EVEN</div><div class="r-cell r-red" style="grid-column: span 2" data-bet="red" onclick="placeBet('red')">RED</div><div class="r-cell r-black" style="grid-column: span 2" data-bet="black" onclick="placeBet('black')">BLACK</div><div class="r-cell" style="grid-column: span 2" data-bet="odd" onclick="placeBet('odd')">ODD</div><div class="r-cell" style="grid-column: span 2" data-bet="19-36" onclick="placeBet('19-36')">19-36</div>\`;
                    boardEl.innerHTML += boardHtml;
                }
                generateBoard();

                function renderDemoHistory() {
                    const list = document.getElementById('demoHistoryList');
                    if(demoHistoryLog.length === 0) { list.innerHTML = '<p class="text-gray-600 italic">Place a bet to record history...</p>'; return; }
                    let htm = '';
                    demoHistoryLog.forEach((h, idx) => {
                        let colorClass = h.color === 'green' ? 'bg-green-600' : (h.color === 'red' ? 'bg-red-600' : 'bg-gray-800');
                        let profitText = h.profit > 0 ? \`<span class="text-green-400">+$out\${h.profit.toLocaleString()}</span>\` : (h.profit < 0 ? \`<span class="text-red-400">-$out\${Math.abs(h.profit).toLocaleString()}</span>\` : \`<span class="text-gray-500">$0</span>\`);
                        profitText = profitText.replace('out', ''); // string literal hack
                        
                        htm += \`<div class="bg-black/50 p-2 rounded border border-white/5 mb-2 cursor-pointer hover:bg-white/10 transition-colors" onclick="showBetDetails(\${idx})">
                            <div class="flex justify-between items-center mb-1">
                                <div class="flex items-center gap-2">
                                    <span class="\${colorClass} text-white w-6 h-6 flex items-center justify-center rounded-full text-[10px] shadow">\${h.num}</span>
                                    <span class="text-gray-400 font-bold">Total Bet: $\${h.bet.toLocaleString()}</span>
                                </div>
                                \${profitText}
                            </div>
                            <div class="text-[9px] text-gray-500 truncate" title="\${h.betsDesc}">
                                Played: \${h.betsDesc}
                            </div>
                        </div>\`;
                    });
                    list.innerHTML = htm;
                }

                function startCasinoSync() {
                    if(casinoSyncLoop) clearInterval(casinoSyncLoop);
                    casinoSyncLoop = setInterval(async () => {
                        if(!document.getElementById('tab-casino').classList.contains('active')) return;
                        try {
                            const res = await fetch(\`/admin/api/casino/live?guildId=\${currentGuildId}\`); const data = await res.json();
                            
                            const boardOverlay = document.getElementById('boardOverlay');
                            const advOverlay = document.getElementById('advOverlay');
                            
                            if (!data.active) { 
                                boardOverlay.classList.remove('hidden', 'bg-black/40', 'backdrop-blur-sm');
                                boardOverlay.classList.add('flex', 'bg-black/80', 'backdrop-blur-md');
                                advOverlay.classList.remove('hidden', 'bg-black/40', 'backdrop-blur-sm');
                                advOverlay.classList.add('flex', 'bg-black/80', 'backdrop-blur-md');
                                document.getElementById('boardOverlayText').innerText = 'DEALER OFFLINE'; 
                                document.getElementById('advOverlayText').innerText = 'DEALER OFFLINE';
                                document.getElementById('boardOverlaySub').style.display = 'block';
                                return; 
                            }
                            
                            // FILTER & STATS CALCULATION
                            const filterCount = parseInt(document.getElementById('spinCountFilter').value) || 100;
                            const history = data.history.slice(-filterCount);
                            currentCasinoHistory = history; 
                            
                            if (history && history.length > 0) {
                                let r=0, b=0, g=0, odd=0, even=0, low=0, high=0, d1=0, d2=0, d3=0, c1=0, c2=0, c3=0; let freq = {};
                                history.forEach(n => { 
                                    if(n===0) g++; else if(redNumbers.includes(n)) r++; else b++; 
                                    if(n!==0 && n%2===0) even++; else if(n!==0 && n%2!==0) odd++;
                                    if(n>=1 && n<=18) low++; else if(n>=19 && n<=36) high++;
                                    if(n>=1 && n<=12) d1++; else if(n>=13 && n<=24) d2++; else if(n>=25 && n<=36) d3++;
                                    if(n!==0 && n%3===1) c1++; else if(n!==0 && n%3===2) c2++; else if(n!==0 && n%3===0) c3++;
                                    freq[n] = (freq[n] || 0) + 1; 
                                });
                                const t = history.length; const pct = (v) => ((v/t)*100).toFixed(1)+'%';
                                
                                document.getElementById('statColors').innerHTML = \`<span class="text-red-500">🔴 \${pct(r)}</span> &nbsp; <span class="text-gray-400">⚫ \${pct(b)}</span> &nbsp; <span class="text-green-500">🟢 \${pct(g)}</span>\`;
                                document.getElementById('statOddEven').innerHTML = \`<span class="text-yellow-400">Odd: \${pct(odd)}</span> &nbsp; <span class="text-blue-400">Even: \${pct(even)}</span>\`;
                                document.getElementById('statLowHigh').innerHTML = \`<span class="text-gray-300">1-18: \${pct(low)}</span> &nbsp; <span class="text-gray-300">19-36: \${pct(high)}</span>\`;
                                document.getElementById('statDozens').innerHTML = \`<span class="text-fuchsia-400">1st: \${pct(d1)}</span> &nbsp; <span class="text-fuchsia-400">2nd: \${pct(d2)}</span> &nbsp; <span class="text-fuchsia-400">3rd: \${pct(d3)}</span>\`;
                                document.getElementById('statCols').innerHTML = \`<span class="text-orange-400">C1: \${pct(c1)}</span> &nbsp; <span class="text-orange-400">C2: \${pct(c2)}</span> &nbsp; <span class="text-orange-400">C3: \${pct(c3)}</span>\`;
                                
                                const sorted = Object.entries(freq).sort((x,y)=>y[1]-x[1]);
                                document.getElementById('statHot').innerText = sorted.slice(0,5).map(x=>x[0]).join(', ') || 'N/A';
                                const allNums = Array.from({length:37}, (_,i)=>i);
                                document.getElementById('statCold').innerText = allNums.map(n=>[n, freq[n]||0]).sort((x,y)=>x[1]-y[1]).slice(0,5).map(x=>x[0]).join(', ');
                                
                                document.getElementById('statHistory').innerHTML = history.slice(-15).map(n => \`<span class="\${n === 0 ? 'text-green-400' : (redNumbers.includes(n) ? 'text-red-500' : 'text-gray-500')}">\${n}</span>\`).join(' &nbsp; ');
                            } else {
                                document.getElementById('statColors').innerHTML = '<span class="text-gray-500">Waiting for spins...</span>';
                            }

                            if (data.status === 'betting') {
                                if (currentCasinoPhase !== 'betting') { 
                                    currentCasinoPhase = 'betting'; 
                                    document.querySelectorAll('.win-highlight').forEach(el => el.classList.remove('win-highlight'));
                                    document.getElementById('wheelNumber').style.transform = 'scale(1)'; 
                                    boardOverlay.classList.remove('flex'); boardOverlay.classList.add('hidden'); 
                                    advOverlay.classList.remove('flex'); advOverlay.classList.add('hidden'); 
                                }
                                document.getElementById('casinoStatus').innerHTML = \`<span class="text-green-500 font-black"><i class="fa-regular fa-clock"></i> LIVE BETS OPEN (\${data.timeRemaining}s)</span>\`;
                            } 
                            else if (data.status === 'spinning' && currentCasinoPhase !== 'spinning') {
                                currentCasinoPhase = 'spinning'; 
                                lastBets = {...activeBets}; 
                                document.getElementById('casinoStatus').innerHTML = '<span class="text-yellow-500 font-black">WHEEL IS SPINNING!</span>'; 
                                
                                boardOverlay.classList.remove('hidden', 'bg-black/80', 'backdrop-blur-md');
                                boardOverlay.classList.add('flex', 'bg-black/40', 'backdrop-blur-sm');
                                advOverlay.classList.remove('hidden', 'bg-black/80', 'backdrop-blur-md');
                                advOverlay.classList.add('flex', 'bg-black/40', 'backdrop-blur-sm');

                                document.getElementById('boardOverlayText').innerText = 'NO MORE BETS'; 
                                document.getElementById('advOverlayText').innerText = 'NO MORE BETS';
                                document.getElementById('boardOverlaySub').style.display = 'none';

                                triggerDashboardSpin(data.winningNumber);
                            }
                        } catch(e) {}
                    }, 1000);
                }

                async function triggerDashboardSpin(winningNumber) {
                    const wheel = document.getElementById('wheelNumber'); 
                    const wheelBox = document.getElementById('wheelBox');
                    wheelBox.classList.add('spinning-glow');
                    document.querySelectorAll('.win-highlight').forEach(el => el.classList.remove('win-highlight'));
                    
                    let startTime = Date.now();
                    let delay = 30; // fast start
                    
                    // Spin for 7.5 seconds
                    while(Date.now() - startTime < 7500) {
                        let rand = Math.floor(Math.random() * 37);
                        wheel.innerText = rand;
                        wheel.style.color = rand === 0 ? '#27ae60' : (redNumbers.includes(rand) ? '#e74c3c' : '#7f8c8d');
                        wheel.style.transform = \`scale(\${1 + Math.random()*0.1})\`;
                        
                        let elapsed = Date.now() - startTime;
                        if(elapsed > 4000) delay = 100;
                        if(elapsed > 6000) delay = 250;
                        if(elapsed > 7000) delay = 500;
                        
                        await new Promise(r => setTimeout(r, delay));
                    }
                    
                    wheelBox.classList.remove('spinning-glow'); 
                    wheel.innerText = winningNumber;
                    wheel.style.transform = 'scale(1.25)';
                    wheel.style.color = winningNumber === 0 ? '#27ae60' : (redNumbers.includes(winningNumber) ? '#e74c3c' : '#7f8c8d');
                    
                    let totalWon = 0; let totalBet = 0;
                    
                    // Identify Winning Categories for Highlighting
                    const isRed = redNumbers.includes(winningNumber);
                    const isEven = winningNumber !== 0 && winningNumber % 2 === 0;
                    
                    let winKeys = [winningNumber.toString()];
                    if(winningNumber !== 0) {
                        winKeys.push(isRed ? 'red' : 'black');
                        winKeys.push(isEven ? 'even' : 'odd');
                        winKeys.push(winningNumber <= 18 ? '1-18' : '19-36');
                        if(winningNumber <= 12) winKeys.push('1-12'); else if(winningNumber <= 24) winKeys.push('13-24'); else winKeys.push('25-36');
                        if(winningNumber % 3 === 1) winKeys.push('col1'); else if(winningNumber % 3 === 2) winKeys.push('col2'); else if(winningNumber % 3 === 0) winKeys.push('col3');
                    }
                    if([22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25].includes(winningNumber)) winKeys.push('voisins');
                    if([27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33].includes(winningNumber)) winKeys.push('tiers');
                    if([1, 20, 14, 31, 9, 17, 34, 6].includes(winningNumber)) winKeys.push('orphelins');

                    // Apply Highlights to Board Elements
                    winKeys.forEach(k => {
                        let el = document.querySelector(\`[data-bet="\${k}"]\`);
                        if(el) el.classList.add('win-highlight');
                    });

                    let betStrings = [];

                    for (const [betType, amt] of Object.entries(activeBets)) {
                        let won = false; let mult = 0;
                        
                        let displayLabel = betType.toUpperCase();
                        if(betType.startsWith('split-')) displayLabel = \`SPLIT(\${betType.split('-').slice(1).join(',')})\`;
                        if(betType.startsWith('corner-')) displayLabel = \`CORNER(\${betType.split('-').slice(1).join(',')})\`;
                        if(betType.startsWith('sixline-')) displayLabel = \`SIXLINE(\${betType.split('-').slice(1).join(',')})\`;
                        if(betType.startsWith('neighbour-')) displayLabel = \`NB(\${betType.split('-')[1]}±\${betType.split('-')[2]})\`;
                        
                        // Ignore the parent tracker keys for call bets from being explicitly paid out/logged separately
                        if(['voisins', 'tiers', 'orphelins'].includes(betType) || betType.startsWith('neighbour-')) {
                            betStrings.push(\`\${displayLabel} ($\${amt >= 1000 ? (amt/1000)+'k' : amt})\`);
                            totalBet += amt;
                            continue; 
                        }

                        // We only process pure chip payouts because placeCallBet splits chips to specific numbers
                        if (winKeys.includes(betType)) { won = true; }

                        if(won) {
                            if(['red','black','even','odd','1-18','19-36'].includes(betType)) mult = 2;
                            else if(['1-12','13-24','25-36','col1','col2','col3'].includes(betType)) mult = 3;
                            else mult = 36;
                        }

                        // Advanced Bets Calculation
                        if (betType.startsWith('split-') || betType.startsWith('corner-') || betType.startsWith('sixline-')) {
                            const nums = betType.split('-').slice(1).map(Number);
                            if (nums.includes(winningNumber)) { 
                                won = true; mult = 36 / nums.length; 
                                let el = document.querySelector(\`[data-bet="\${betType}"]\`);
                                if(el) el.classList.add('win-highlight'); 
                            }
                        }

                        if(betType.startsWith('split-') || betType.startsWith('corner-') || betType.startsWith('sixline-') || !isNaN(betType) || ['red','black','even','odd','1-18','19-36','1-12','13-24','25-36','col1','col2','col3'].includes(betType)) {
                            totalBet += amt;
                            if(!displayLabel.includes('NB') && !displayLabel.includes('VOISINS') && !displayLabel.includes('TIERS') && !displayLabel.includes('ORPHELINS')) {
                                betStrings.push(\`\${displayLabel} ($\${amt >= 1000 ? (amt/1000)+'k' : amt})\`);
                            }
                        }

                        if (won) totalWon += (amt * mult);
                    }

                    if (totalBet > 0) {
                        demoHistoryLog.unshift({ 
                            num: winningNumber, 
                            color: winningNumber === 0 ? 'green' : (redNumbers.includes(winningNumber) ? 'red' : 'black'), 
                            bet: totalBet, 
                            profit: (totalWon - totalBet),
                            betsDesc: betStrings.join(', ')
                        });
                        if(demoHistoryLog.length > 20) demoHistoryLog.pop();
                        renderDemoHistory();
                    }

                    if (totalWon > 0) { demoBalance += totalWon; Swal.fire({title: 'You Won!', text: '+$' + totalWon.toLocaleString(), icon: 'success', background: '#09090b', color: '#fff', timer: 2000, showConfirmButton: false}); }
                    else if (Object.keys(activeBets).length > 0) Swal.fire({title: 'House Wins', text: 'Better luck next time!', icon: 'error', background: '#09090b', color: '#fff', timer: 1500, showConfirmButton: false});
                    
                    activeBets = {}; document.querySelectorAll('.r-chip').forEach(el => el.remove()); 
                    document.getElementById('advancedBetsList').innerHTML = ''; updateDemoUI();
                }

                // ================= API CALLS & FORMS =================
                document.querySelectorAll('.config-form').forEach(f => f.addEventListener('submit', async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(f).entries()); await fetch('/admin/api/config/update', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d)}); Swal.fire({title:'Saved', icon:'success', background:'#09090b', color:'#fff', timer:1500, showConfirmButton:false}); }));
                document.getElementById('bankerForm').addEventListener('submit', async e => { e.preventDefault(); await fetch('/admin/api/economy/edit', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:document.getElementById('bankUserId').value, guildId:currentGuildId, action:document.getElementById('bankAction').value, amount:document.getElementById('bankAmount').value})}); Swal.fire({title:'Success', icon:'success', background:'#09090b', color:'#fff'}); });
                document.getElementById('wipeForm').addEventListener('submit', async e => { e.preventDefault(); const c = await Swal.fire({title:'Are you sure?', icon:'warning', showCancelButton:true, confirmButtonColor:'#dc2626', background:'#09090b', color:'#fff'}); if(c.isConfirmed) { await fetch('/admin/api/economy/wipe', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:document.getElementById('wipeUserId').value, guildId:currentGuildId})}); Swal.fire({title:'Annihilated!', icon:'success', background:'#09090b', color:'#fff'}); document.getElementById('wipeUserId').value=''; } });
                document.getElementById('modActionForm').addEventListener('submit', async e => { e.preventDefault(); const res = await fetch('/admin/api/moderation/execute', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({guildId:currentGuildId, userId:document.getElementById('modUserId').value, action:document.getElementById('modActionType').value, duration:document.getElementById('modDuration').value, reason:document.getElementById('modReason').value})}); const data = await res.json(); Swal.fire({title:res.ok?'Success':'Failed', text:data.message, icon:res.ok?'success':'error', background:'#09090b', color:'#fff'}); });

                async function fetchBirthdays() { const r = await fetch(\`/admin/api/data/birthdays?guildId=\${currentGuildId}\`); const d = await r.json(); Swal.fire({title:'Birthdays', html: d.length ? '<ul class="text-left text-sm space-y-2 max-h-60 overflow-y-auto">'+d.map(b=>\`<li class="bg-[#050505] p-3 rounded border border-white/10">User ID: <span class="text-fuchsia-400">\${b.user_id}</span> | Date: \${b.birth_month}/\${b.birth_day}</li>\`).join('')+'</ul>' : 'None found', background:'#09090b', color:'#fff'}); }
                async function fetchGiveaways() { const r = await fetch(\`/admin/api/data/giveaways?guildId=\${currentGuildId}\`); const d = await r.json(); Swal.fire({title:'Giveaways', html: d.length ? '<ul class="text-left text-sm space-y-2 max-h-60 overflow-y-auto">'+d.map(g=>\`<li class="bg-[#050505] p-3 rounded border border-white/10 flex justify-between items-center"><span>Prize: <span class="text-pink-400 font-bold">\${g.prize}</span></span><button onclick="fetch('/admin/api/data/giveaways/end',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messageId:'\${g.message_id}',guildId:'\${currentGuildId}'})})" class="bg-red-600/20 text-red-500 border border-red-500/50 px-3 py-1 rounded hover:bg-red-600/40">End Now</button></li>\`).join('')+'</ul>' : 'None active', background:'#09090b', color:'#fff'}); }
                async function fetchJTCStatus() { const r = await fetch(\`/admin/api/data/jtc?guildId=\${currentGuildId}\`); const d = await r.json(); Swal.fire({title:'JTC Sessions', html: d.length ? '<ul class="text-left text-sm space-y-2 max-h-60 overflow-y-auto">'+d.map(c=>\`<li class="bg-[#050505] p-3 rounded border border-white/10 flex justify-between items-center"><div><span class="text-indigo-400 font-bold">\${c.name}</span><br><span class="text-xs text-gray-500">ID: \${c.channelId}</span></div><span class="bg-white/10 px-3 py-1 rounded-lg text-xs">\${c.members} members</span></li>\`).join('')+'</ul>' : 'No active sessions', background:'#09090b', color:'#fff'}); }
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

    // Casino Sync Route
    dashboard.get('/api/casino/live', async (req, res) => {
        const guildId = req.query.guildId;
        const state = liveRouletteState.get(guildId);
        if (!state) return res.json({ active: false });
        res.json({ active: true, status: state.status, timeRemaining: state.timeRemaining, winningNumber: state.winningNumber, history: state.history });
    });

    // ⚡ API: Universal Config Saver 
    dashboard.post('/api/config/update', async (req, res) => {
        try {
            const { guildId, _action, ...settings } = req.body;
            const currentConfig = await getGuildConfig(client, guildId) || {};
            let updates = {};
            for (const [key, value] of Object.entries(settings)) {
                const cleanVal = value === "" ? null : value;
                if (key.includes('_')) { const [p, c] = key.split('_'); if (!updates[p]) updates[p] = { ...(currentConfig[p] || {}) }; updates[p][c] = cleanVal; } 
                else { updates[key] = cleanVal; }
            }
            await updateGuildConfig(client, guildId, updates);
            if (_action === 'start_roulette') await startPersistentRoulettes(client);
            res.sendStatus(200);
        } catch (error) { res.sendStatus(500); }
    });

    // ⚡ API: Economy Banker Override
    dashboard.post('/api/economy/edit', async (req, res) => {
        const { userId, guildId, action, amount } = req.body;
        try {
            const userData = await getEconomyData(client, guildId, userId);
            if (action === 'add') userData.wallet = (userData.wallet || 0) + parseInt(amount);
            else if (action === 'remove') userData.wallet = Math.max(0, (userData.wallet || 0) - parseInt(amount));
            else if (action === 'set') userData.wallet = parseInt(amount);
            await setEconomyData(client, guildId, userId, userData);
            res.sendStatus(200);
        } catch (error) { res.sendStatus(500); }
    });

    // ⚡ API: Danger Zone - Wipe Economy Data
    dashboard.post('/api/economy/wipe', async (req, res) => {
        try {
            await setEconomyData(client, req.body.guildId, req.body.userId, { wallet: 0, bank: 0, bankLevel: 0, xp: 0, level: 1, inventory: {} });
            res.sendStatus(200);
        } catch (error) { res.sendStatus(500); }
    });

    // ⚡ API: Moderation Actions
    dashboard.post('/api/moderation/execute', async (req, res) => {
        const { guildId, userId, action, reason, duration } = req.body;
        try {
            const member = await client.guilds.cache.get(guildId).members.fetch(userId);
            if (action === 'kick') await member.kick(reason);
            else if (action === 'ban') await member.ban({ reason });
            else if (action === 'timeout') await member.timeout(60 * 60 * 1000, reason); 
            else if (action === 'warn') await WarningService.addWarning({ guildId, userId, moderatorId: client.user.id, reason: reason || "Dashboard" });
            else if (action === 'mute') await member.roles.add((await getGuildConfig(client, guildId)).muteRole, reason);
            res.status(200).json({ message: `Executed ${action}` });
        } catch (error) { res.status(400).json({ message: "Failed." }); }
    });

    // ⚡ API: Data Fetchers
    dashboard.get('/api/data/birthdays', async (req, res) => { try { res.json((await db.query('SELECT user_id, birth_month, birth_day FROM birthdays WHERE guild_id = $1 LIMIT 50', [req.query.guildId])).rows); } catch (e) { res.json([]); } });
    dashboard.get('/api/data/giveaways', async (req, res) => { try { res.json((await db.query('SELECT message_id, prize FROM giveaways WHERE guild_id = $1 AND ended = false', [req.query.guildId])).rows); } catch (e) { res.json([]); } });
    dashboard.post('/api/data/giveaways/end', async (req, res) => { try { await db.query('UPDATE giveaways SET end_time = $1 WHERE message_id = $2', [Date.now(), req.body.messageId]); res.sendStatus(200); } catch (e) { res.sendStatus(500); } });
    
    dashboard.get('/api/data/jtc', async (req, res) => {
        try {
            const guild = client.guilds.cache.get(req.query.guildId);
            const master = guild?.channels.cache.get((await getGuildConfig(client, guild.id))?.joinToCreateChannelId);
            if (!master) return res.json([]);
            const active = [];
            guild.channels.cache.forEach(c => { if (c.type === 2 && c.parentId === master.parentId && c.id !== master.id) active.push({ channelId: c.id, name: c.name, members: c.members.size }); });
            res.json(active);
        } catch (e) { res.json([]); }
    });

    app.use('/admin', dashboard);
}
