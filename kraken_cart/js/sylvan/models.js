/* Loader model NPC asli Sylvan Dominion.
   Semua 18 file di folder ini adalah salinan apa adanya dari
   sylvandominion.web.id/js/entities/npc_*.js (build v0.2.169). Tiap file
   memasang window.NPC_<Id> berisi {build(), animate(n,dt)}.
   `shim.js` WAJIB dievaluasi lebih dulu (urutan impor di bawah). */
import './shim.js';

import './npc_guard.js';
import './npc_hunter.js';
import './npc_miner.js';
import './npc_farmer.js';
import './npc_herbal.js';
import './npc_warrior.js';
import './npc_guardian.js';
import './npc_merchant.js';
import './npc_dungeonmaster.js';
import './npc_petmerchant.js';
import './npc_lionknight.js';
import './npc_elfmage.js';
import './npc_stonegiant.js';
import './npc_rabbitwarrior.js';
import './npc_goblin.js';
import './npc_magesupport.js';
import './npc_royalguard.js';
import './npc_lich.js';

import { HC } from '../hc.js';

/* Role id -> entitas model. Nama window mengikuti kapitalisasi Sylvan:
   dungeonmaster -> NPC_Dungeonmaster, lionknight -> NPC_Lionknight, dst. */
const IDS = [
  'guard', 'hunter', 'miner', 'farmer', 'herbal', 'warrior', 'guardian',
  'merchant', 'dungeonmaster', 'petmerchant', 'lionknight', 'elfmage',
  'stonegiant', 'rabbitwarrior', 'goblin', 'magesupport', 'royalguard', 'lich',
];

HC.SD_NPC_MODELS = {};
for (const id of IDS) {
  const key = 'NPC_' + id.charAt(0).toUpperCase() + id.slice(1);
  const ent = window[key];
  if (ent && typeof ent.build === 'function') HC.SD_NPC_MODELS[id] = ent;
}

HC.hasSDModel = (id) => !!HC.SD_NPC_MODELS[id];
