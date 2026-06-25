// uiR5Assets.js - generated from R5 CSV maps; browser paths remain /assets/ui-r5/...
// R5 full refined asset resolver only maps UI resource paths. No gameplay/data logic.

import { assetUrl } from "./assetPath.js";

export const R5_BASE = assetUrl("/assets/ui-r5");
export const R5_ASSET_COUNTS = {
  "cards": 132,
  "enemyLegacySmallImagesRetained": 11,
  "enemyBattles": 11,
  "effectIcons": 27,
  "effectLarge": 27,
  "backgrounds": 7,
  "panels": 14,
  "buttons": 7,
  "tokens": 3,
  "icons": 10,
  "frames": 15,
  "totalImageFiles": 264
};
const cardArtMap = {
  "strike": "/assets/ui-r5/cards/card_strike.png",
  "guard": "/assets/ui-r5/cards/card_guard.png",
  "yellowCharm": "/assets/ui-r5/cards/card_yellow-charm.png",
  "meditate": "/assets/ui-r5/cards/card_meditate.png",
  "breakArmor": "/assets/ui-r5/cards/card_break-armor.png",
  "flameTalisman": "/assets/ui-r5/cards/card_flame-talisman.png",
  "foxFire": "/assets/ui-r5/cards/card_fox-fire.png",
  "ghostNeedle": "/assets/ui-r5/cards/card_ghost-needle.png",
  "miasma": "/assets/ui-r5/cards/card_miasma.png",
  "jiaoScale": "/assets/ui-r5/cards/card_jiao-scale.png",
  "demonMirror": "/assets/ui-r5/cards/card_demon-mirror.png",
  "underworldPen": "/assets/ui-r5/cards/card_underworld-pen.png",
  "thornMail": "/assets/ui-r5/cards/card_thorn-mail.png",
  "reflectArt": "/assets/ui-r5/cards/card_reflect-art.png",
  "turtleCrush": "/assets/ui-r5/cards/card_turtle-crush.png",
  "immovableVajra": "/assets/ui-r5/cards/card_immovable-vajra.png",
  "kunlunBreath": "/assets/ui-r5/cards/card_kunlun-breath.png",
  "dragonRain": "/assets/ui-r5/cards/card_dragon-rain.png",
  "nuwaStone": "/assets/ui-r5/cards/card_nuwa-stone.png",
  "eastBell": "/assets/ui-r5/cards/card_east-bell.png",
  "panguMark": "/assets/ui-r5/cards/card_pangu-mark.png",
  "shanHaiCall": "/assets/ui-r5/cards/card_shan-hai-call.png",
  "shellTap": "/assets/ui-r5/cards/card_shell-tap.png",
  "stoneShell": "/assets/ui-r5/cards/card_stone-shell.png",
  "mountainEcho": "/assets/ui-r5/cards/card_mountain-echo.png",
  "xuanwuPrison": "/assets/ui-r5/cards/card_xuanwu-prison.png",
  "armorBreaker": "/assets/ui-r5/cards/card_armor-breaker.png",
  "killingIntent": "/assets/ui-r5/cards/card_killing-intent.png",
  "bloodSurge": "/assets/ui-r5/cards/card_blood-surge.png",
  "poisonBurst": "/assets/ui-r5/cards/card_poison-burst.png",
  "boneDust": "/assets/ui-r5/cards/card_bone-dust.png",
  "curseKill": "/assets/ui-r5/cards/card_curse-kill.png",
  "bloodRecycle": "/assets/ui-r5/cards/card_blood-recycle.png",
  "thunderArmy": "/assets/ui-r5/cards/card_thunder-army.png",
  "furySlash": "/assets/ui-r5/cards/card_fury-slash.png",
  "thunderCall": "/assets/ui-r5/cards/card_thunder-call.png",
  "bloodFang": "/assets/ui-r5/cards/card_blood-fang.png",
  "warGodStrike": "/assets/ui-r5/cards/card_war-god-strike.png",
  "thunderBurst": "/assets/ui-r5/cards/card_thunder-burst.png",
  "venomFang": "/assets/ui-r5/cards/card_venom-fang.png",
  "skyShellMandate": "/assets/ui-r5/cards/card_sky-shell-mandate.png",
  "heavySlash": "/assets/ui-r5/cards/card_heavy-slash.png",
  "readyStance": "/assets/ui-r5/cards/card_ready-stance.png",
  "chainBlade": "/assets/ui-r5/cards/card_chain-blade.png",
  "battleCry": "/assets/ui-r5/cards/card_battle-cry.png",
  "armyBreaker": "/assets/ui-r5/cards/card_army-breaker.png",
  "xingtianCleave": "/assets/ui-r5/cards/card_xingtian-cleave.png",
  "tiangangBreak": "/assets/ui-r5/cards/card_tiangang-break.png",
  "thunderCharm": "/assets/ui-r5/cards/card_thunder-charm.png",
  "attractThunder": "/assets/ui-r5/cards/card_attract-thunder.png",
  "fireRite": "/assets/ui-r5/cards/card_fire-rite.png",
  "fiveThunder": "/assets/ui-r5/cards/card_five-thunder.png",
  "thunderPool": "/assets/ui-r5/cards/card_thunder-pool.png",
  "nineHeavenTribulation": "/assets/ui-r5/cards/card_nine-heaven-tribulation.png",
  "starFall": "/assets/ui-r5/cards/card_star-fall.png",
  "bloodNeedle": "/assets/ui-r5/cards/card_blood-needle.png",
  "bloodNet": "/assets/ui-r5/cards/card_blood-net.png",
  "bloodOath": "/assets/ui-r5/cards/card_blood-oath.png",
  "bloodRiver": "/assets/ui-r5/cards/card_blood-river.png",
  "bloodDemonLoop": "/assets/ui-r5/cards/card_blood-demon-loop.png",
  "asuraBlood": "/assets/ui-r5/cards/card_asura-blood.png",
  "poisonPowder": "/assets/ui-r5/cards/card_poison-powder.png",
  "numbingThorn": "/assets/ui-r5/cards/card_numbing-thorn.png",
  "centipedeJar": "/assets/ui-r5/cards/card_centipede-jar.png",
  "softBoneSmoke": "/assets/ui-r5/cards/card_soft-bone-smoke.png",
  "thousandVenom": "/assets/ui-r5/cards/card_thousand-venom.png",
  "boneMeltMiasma": "/assets/ui-r5/cards/card_bone-melt-miasma.png",
  "guKing": "/assets/ui-r5/cards/card_gu-king.png",
  "discordCharm": "/assets/ui-r5/cards/card_discord-charm.png",
  "bindingRope": "/assets/ui-r5/cards/card_binding-rope.png",
  "echoBell": "/assets/ui-r5/cards/card_echo-bell.png",
  "mirrorMind": "/assets/ui-r5/cards/card_mirror-mind.png",
  "heavenlyDiscord": "/assets/ui-r5/cards/card_heavenly-discord.png",
  "traceCutter": "/assets/ui-r5/cards/card_trace-cutter.png",
  "stasisCharm": "/assets/ui-r5/cards/card_stasis-charm.png",
  "bloodMonument": "/assets/ui-r5/cards/card_blood-monument.png",
  "venomIncense": "/assets/ui-r5/cards/card_venom-incense.png",
  "discordLoop": "/assets/ui-r5/cards/card_discord-loop.png",
  "doomSutra": "/assets/ui-r5/cards/card_doom-sutra.png",
  "gatherAsh": "/assets/ui-r5/cards/card_gather-ash.png",
  "returnTalisman": "/assets/ui-r5/cards/card_return-talisman.png",
  "cycleMandate": "/assets/ui-r5/cards/card_cycle-mandate.png",
  "hiddenArchive": "/assets/ui-r5/cards/card_hidden-archive.png",
  "thunderBreakArmyBase": "/assets/ui-r5/cards/card_thunder-break-army-base.png",
  "thunderBladeAwakening": "/assets/ui-r5/cards/card_thunder-blade-awakening.png",
  "thunderBreakArmy": "/assets/ui-r5/cards/card_thunder-break-army.png",
  "thunderWarGodSlash": "/assets/ui-r5/cards/card_thunder-war-god-slash.png",
  "breakArmyThunderMomentum": "/assets/ui-r5/cards/card_break-army-thunder-momentum.png",
  "thunderLordBreakArmy": "/assets/ui-r5/cards/card_thunder-lord-break-army.png",
  "thunderBloodBase": "/assets/ui-r5/cards/card_thunder-blood-base.png",
  "thunderBloodPulse": "/assets/ui-r5/cards/card_thunder-blood-pulse.png",
  "thunderBloodJudgement": "/assets/ui-r5/cards/card_thunder-blood-judgement.png",
  "thunderBloodExecution": "/assets/ui-r5/cards/card_thunder-blood-execution.png",
  "thunderBloodChain": "/assets/ui-r5/cards/card_thunder-blood-chain.png",
  "thunderBloodSovereign": "/assets/ui-r5/cards/card_thunder-blood-sovereign.png",
  "rottenBloodBase": "/assets/ui-r5/cards/card_rotten-blood-base.png",
  "venomBloodPulse": "/assets/ui-r5/cards/card_venom-blood-pulse.png",
  "rottenBloodVenomTide": "/assets/ui-r5/cards/card_rotten-blood-venom-tide.png",
  "rottenVenomSiphon": "/assets/ui-r5/cards/card_rotten-venom-siphon.png",
  "bloodVenomBloom": "/assets/ui-r5/cards/card_blood-venom-bloom.png",
  "rottenBloodSovereign": "/assets/ui-r5/cards/card_rotten-blood-sovereign.png",
  "guForbiddenBase": "/assets/ui-r5/cards/card_gu-forbidden-base.png",
  "guLockPulse": "/assets/ui-r5/cards/card_gu-lock-pulse.png",
  "guForbiddenArray": "/assets/ui-r5/cards/card_gu-forbidden-array.png",
  "guForbiddenDetonation": "/assets/ui-r5/cards/card_gu-forbidden-detonation.png",
  "guPrisonCommand": "/assets/ui-r5/cards/card_gu-prison-command.png",
  "guForbiddenSovereign": "/assets/ui-r5/cards/card_gu-forbidden-sovereign.png",
  "prisonTurtleBase": "/assets/ui-r5/cards/card_prison-turtle-base.png",
  "turtleSealGuard": "/assets/ui-r5/cards/card_turtle-seal-guard.png",
  "prisonXuanTurtle": "/assets/ui-r5/cards/card_prison-xuan-turtle.png",
  "prisonTurtleCounter": "/assets/ui-r5/cards/card_prison-turtle-counter.png",
  "prisonShellRebound": "/assets/ui-r5/cards/card_prison-shell-rebound.png",
  "prisonTurtleSovereign": "/assets/ui-r5/cards/card_prison-turtle-sovereign.png",
  "xuanArmorBase": "/assets/ui-r5/cards/card_xuan-armor-base.png",
  "armorBladeGuard": "/assets/ui-r5/cards/card_armor-blade-guard.png",
  "xuanArmorBreakArmy": "/assets/ui-r5/cards/card_xuan-armor-break-army.png",
  "xuanArmorGodBreak": "/assets/ui-r5/cards/card_xuan-armor-god-break.png",
  "xuanArmorWarMomentum": "/assets/ui-r5/cards/card_xuan-armor-war-momentum.png",
  "xuanArmorSovereign": "/assets/ui-r5/cards/card_xuan-armor-sovereign.png",
  "triggerThunderBloodBreakArmy": "/assets/ui-r5/cards/card_trigger-thunder-blood-break-army.png",
  "triggerThreeCalamityTribulation": "/assets/ui-r5/cards/card_trigger-three-calamity-tribulation.png",
  "triggerRottenGuPrison": "/assets/ui-r5/cards/card_trigger-rotten-gu-prison.png",
  "triggerXuanGuPrison": "/assets/ui-r5/cards/card_trigger-xuan-gu-prison.png",
  "triggerDemonSuppressArmor": "/assets/ui-r5/cards/card_trigger-demon-suppress-armor.png",
  "triggerXuanThunderArmy": "/assets/ui-r5/cards/card_trigger-xuan-thunder-army.png",
  "thunderBloodBreakArmy": "/assets/ui-r5/cards/card_thunder-blood-break-army.png",
  "threeCalamityBloodVenomTribulation": "/assets/ui-r5/cards/card_three-calamity-blood-venom-tribulation.png",
  "rottenBloodGuPrison": "/assets/ui-r5/cards/card_rotten-blood-gu-prison.png",
  "xuanGuPrisonSuppress": "/assets/ui-r5/cards/card_xuan-gu-prison-suppress.png",
  "demonSuppressXuanArmor": "/assets/ui-r5/cards/card_demon-suppress-xuan-armor.png",
  "xuanThunderBreakArmy": "/assets/ui-r5/cards/card_xuan-thunder-break-army.png",
  "karmaCurse": "/assets/ui-r5/cards/card_karma-curse.png"
};
const enemyAssetMap = {
  "littleYao": {
    "nameZh": "小妖",
    "battlePath": "/assets/ui-r5/enemies/enemy_littleYao_battle.png"
  },
  "shanxiao": {
    "nameZh": "山魈",
    "battlePath": "/assets/ui-r5/enemies/enemy_shanxiao_battle.png"
  },
  "foxYao": {
    "nameZh": "狐妖",
    "battlePath": "/assets/ui-r5/enemies/enemy_foxYao_battle.png"
  },
  "waterGhost": {
    "nameZh": "水鬼",
    "battlePath": "/assets/ui-r5/enemies/enemy_waterGhost_battle.png"
  },
  "ironCorpse": {
    "nameZh": "铁尸",
    "battlePath": "/assets/ui-r5/enemies/enemy_ironCorpse_battle.png"
  },
  "yaoJiang": {
    "nameZh": "妖将",
    "battlePath": "/assets/ui-r5/enemies/enemy_yaoJiang_battle.png"
  },
  "shanJun": {
    "nameZh": "山君",
    "battlePath": "/assets/ui-r5/enemies/enemy_shanJun_battle.png"
  },
  "guiJiang": {
    "nameZh": "鬼将",
    "battlePath": "/assets/ui-r5/enemies/enemy_guiJiang_battle.png"
  },
  "panGuan": {
    "nameZh": "判官",
    "battlePath": "/assets/ui-r5/enemies/enemy_panGuan_battle.png"
  },
  "moZun": {
    "nameZh": "魔尊",
    "battlePath": "/assets/ui-r5/enemies/enemy_moZun_battle.png"
  },
  "blackMountain": {
    "nameZh": "黑山老妖",
    "battlePath": "/assets/ui-r5/enemies/enemy_blackMountain_battle.png"
  }
};
const effectAssetMap = {
  "burn": {
    "nameZh": "灼烧",
    "iconPath": "/assets/ui-r5/effects/effect_burn_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_burn_large.png"
  },
  "bleed": {
    "nameZh": "流血",
    "iconPath": "/assets/ui-r5/effects/effect_bleed_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_bleed_large.png"
  },
  "poison": {
    "nameZh": "毒瘴",
    "iconPath": "/assets/ui-r5/effects/effect_poison_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_poison_large.png"
  },
  "curse": {
    "nameZh": "诅咒",
    "iconPath": "/assets/ui-r5/effects/effect_curse_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_curse_large.png"
  },
  "spirit": {
    "nameZh": "灵气",
    "iconPath": "/assets/ui-r5/effects/effect_spirit_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_spirit_large.png"
  },
  "thunderMark": {
    "nameZh": "雷痕",
    "iconPath": "/assets/ui-r5/effects/effect_thunderMark_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_thunderMark_large.png"
  },
  "stun": {
    "nameZh": "眩晕",
    "iconPath": "/assets/ui-r5/effects/effect_stun_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_stun_large.png"
  },
  "battleIntent": {
    "nameZh": "战意",
    "iconPath": "/assets/ui-r5/effects/effect_battleIntent_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_battleIntent_large.png"
  },
  "blockShield": {
    "nameZh": "格挡锁定",
    "iconPath": "/assets/ui-r5/effects/effect_blockShield_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_blockShield_large.png"
  },
  "spikes": {
    "nameZh": "荆棘",
    "iconPath": "/assets/ui-r5/effects/effect_spikes_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_spikes_large.png"
  },
  "controlResist": {
    "nameZh": "定力",
    "iconPath": "/assets/ui-r5/effects/effect_controlResist_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_controlResist_large.png"
  },
  "thunderFireMark": {
    "nameZh": "雷火烙印",
    "iconPath": "/assets/ui-r5/effects/effect_thunderFireMark_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_thunderFireMark_large.png"
  },
  "clearMind": {
    "nameZh": "醒神",
    "iconPath": "/assets/ui-r5/effects/effect_clearMind_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_clearMind_large.png"
  },
  "chaos": {
    "nameZh": "离间",
    "iconPath": "/assets/ui-r5/effects/effect_chaos_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_chaos_large.png"
  },
  "bind": {
    "nameZh": "禁锢",
    "iconPath": "/assets/ui-r5/effects/effect_bind_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_bind_large.png"
  },
  "brittle": {
    "nameZh": "脆化",
    "iconPath": "/assets/ui-r5/effects/effect_brittle_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_brittle_large.png"
  },
  "stasis": {
    "nameZh": "凝滞",
    "iconPath": "/assets/ui-r5/effects/effect_stasis_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_stasis_large.png"
  },
  "ward": {
    "nameZh": "护体",
    "iconPath": "/assets/ui-r5/effects/effect_ward_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_ward_large.png"
  },
  "thunderTribulation": {
    "nameZh": "天劫",
    "iconPath": "/assets/ui-r5/effects/effect_thunderTribulation_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_thunderTribulation_large.png"
  },
  "nineSkyThunder": {
    "nameZh": "九天雷劫",
    "iconPath": "/assets/ui-r5/effects/effect_nineSkyThunder_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_nineSkyThunder_large.png"
  },
  "thunderFireResonance": {
    "nameZh": "雷火共鸣",
    "iconPath": "/assets/ui-r5/effects/effect_thunderFireResonance_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_thunderFireResonance_large.png"
  },
  "mindCollapse": {
    "nameZh": "心防崩裂",
    "iconPath": "/assets/ui-r5/effects/effect_mindCollapse_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_mindCollapse_large.png"
  },
  "bleedSiphon": {
    "nameZh": "汲血",
    "iconPath": "/assets/ui-r5/effects/effect_bleedSiphon_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_bleedSiphon_large.png"
  },
  "spikeBurst": {
    "nameZh": "荆棘爆发",
    "iconPath": "/assets/ui-r5/effects/effect_spikeBurst_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_spikeBurst_large.png"
  },
  "shellReflect": {
    "nameZh": "格挡反震",
    "iconPath": "/assets/ui-r5/effects/effect_shellReflect_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_shellReflect_large.png"
  },
  "dualFusion": {
    "nameZh": "双合流",
    "iconPath": "/assets/ui-r5/effects/effect_dualFusion_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_dualFusion_large.png"
  },
  "tripleFusion": {
    "nameZh": "三合流",
    "iconPath": "/assets/ui-r5/effects/effect_tripleFusion_icon.png",
    "largeEffectPath": "/assets/ui-r5/effects/effect_tripleFusion_large.png"
  }
};
export const R5_BACKGROUNDS = {
  "home": assetUrl("/assets/ui-r5/backgrounds/bg_home_mural_gate.png"),
  "combat": assetUrl("/assets/ui-r5/backgrounds/bg_combat_xiaoxitian_hall.png"),
  "reward": assetUrl("/assets/ui-r5/backgrounds/bg_reward_altar.png"),
  "gatherAsh": assetUrl("/assets/ui-r5/backgrounds/bg_gatherash_talisman_altar.png"),
  "modeSelect": assetUrl("/assets/ui-r5/backgrounds/bg_mode_select_gate.png"),
  "shop": assetUrl("/assets/ui-r5/backgrounds/bg_shop_cave.png"),
  "gameOver": assetUrl("/assets/ui-r5/backgrounds/bg_gameover_reincarnation.png")
};
export const R5_PANELS = {
  "relicSelect": assetUrl("/assets/ui-r5/panels/panel_relic_select.png"),
  "cardReward": assetUrl("/assets/ui-r5/panels/panel_card_reward.png"),
  "statusTooltip": assetUrl("/assets/ui-r5/panels/panel_status_tooltip.png"),
  "enemyPanel": assetUrl("/assets/ui-r5/panels/panel_enemy_niche.png"),
  "battleLog": assetUrl("/assets/ui-r5/panels/panel_battle_log_scroll.png"),
  "handArea": assetUrl("/assets/ui-r5/panels/panel_hand_area_scroll.png"),
  "discardDrawBar": assetUrl("/assets/ui-r5/panels/panel_discard_draw_bar.png"),
  "topStatusBar": assetUrl("/assets/ui-r5/panels/panel_top_status_wood_gold.png"),
  "mythPanel": assetUrl("/assets/ui-r5/panels/panel_myth_cultivation.png")
};
export const R5_TOKENS = { cost: `${R5_BASE}/tokens/cost_token_octagon_64.png` };
export const R5_ICONS = { deck: `${R5_BASE}/icons/icon_deck.png`, discard: `${R5_BASE}/icons/icon_discard.png`, gold: `${R5_BASE}/icons/icon_gold.png`, hp: `${R5_BASE}/icons/icon_hp.png`, relic: `${R5_BASE}/icons/icon_relic.png`, scroll: `${R5_BASE}/icons/icon_scroll.png`, settings: `${R5_BASE}/icons/icon_settings.png`, target: `${R5_BASE}/icons/icon_target.png`, plus: `${R5_BASE}/icons/icon_plus.png`, lock: `${R5_BASE}/icons/icon_lock.png` };
const fallbackCard = cardArtMap.strike || `${R5_BASE}/cards/card_strike.png`;
const fallbackEnemy = enemyAssetMap.littleYao || Object.values(enemyAssetMap)[0];

export function r5CardArtUrl(cardId) { return assetUrl(cardArtMap[cardId] || fallbackCard); }
export function r5FallbackCardArtUrl() { return assetUrl(fallbackCard); }
export function r5EnemyBattleUrl(enemyId) { return assetUrl(enemyAssetMap[enemyId]?.battlePath || fallbackEnemy?.battlePath || null); }
export function r5FallbackEnemyBattleUrl() { return assetUrl(fallbackEnemy?.battlePath || null); }
export function r5EffectIconUrl(statusId) { return assetUrl(effectAssetMap[statusId]?.iconPath || null); }
export function r5LargeEffectUrl(statusId) { return assetUrl(effectAssetMap[statusId]?.largeEffectPath || null); }
export function r5SceneUrl(sceneId) { return R5_BACKGROUNDS[sceneId] || R5_PANELS[sceneId] || null; }
export function r5AssetStats() { return { cards: Object.keys(cardArtMap).length, enemies: Object.keys(enemyAssetMap).length, effects: Object.keys(effectAssetMap).length, backgrounds: Object.keys(R5_BACKGROUNDS).length, panels: Object.keys(R5_PANELS).length }; }
export function r5MissingCardIds(cardIds) { return cardIds.filter((id) => !cardArtMap[id]); }
export function r5MissingEnemyIds(enemyIds) { return enemyIds.filter((id) => !enemyAssetMap[id]); }
export function r5EnemyAssetEntries() { return Object.entries(enemyAssetMap).map(([enemyId, value]) => ({ enemyId, ...value, battlePath: assetUrl(value.battlePath) })); }
