/**
 * 这个文件只放类型说明和少量常量。
 * 用 JSDoc 保持无构建依赖，同时让编辑器能读懂核心结构。
 */

/**
 * @typedef {"home" | "route" | "combat" | "reward" | "shop" | "gameOver" | "martialSelect"} Phase
 * @typedef {"common" | "rare" | "epic" | "legendary"} Rarity
 * @typedef {"self" | "enemy" | "allEnemies"} Target
 * @typedef {"burn" | "bleed" | "poison" | "curse" | "spirit" | "battleIntent" | "chaos" | "bind" | "brittle" | "stasis" | "ward" | "thunderMark" | "stun" | "controlResist" | "clearMind" | "thunderFireMark"} StatusId
 *
 * @typedef {object} Effect
 * @property {"damage" | "execute" | "block" | "heal" | "loseHp" | "draw" | "gainEnergy" | "status" | "amplifyDebuffs" | "poisonBurst" | "thunderMark" | "bleedSiphon" | "shellReflect" | "recoverDiscard" | "maxEnergy" | "maxHp" | "cleanse" | "rareCard" | "handLimit" | "deckLimit" | "gold" | "relic"} type
 * @property {Target=} target
 * @property {number=} value
 * @property {number=} ratio
 * @property {number=} consumeRatio
 * @property {StatusId=} status
 * @property {StatusId[]=} statuses
 * @property {string[]=} excludeStyles
 * @property {number=} stacks
 * @property {number=} cardMythBonus
 * @property {number=} cardMythStatusBonus
 *
 * @typedef {object} CardDefinition
 * @property {string} id
 * @property {string} name
 * @property {Rarity} rarity
 * @property {number} cost
 * @property {string} text
 * @property {string[]} mythTags
 * @property {Effect[]} effects
 *
 * @typedef {object} CardInstance
 * @property {string} uid
 * @property {string} cardId
 * @property {boolean=} upgraded
 *
 * @typedef {object} StatusStack
 * @property {StatusId} id
 * @property {number} stacks
 * @property {number=} fresh
 *
 * @typedef {object} EnemyIntent
 * @property {"attack" | "block" | "status"} type
 * @property {number=} value
 * @property {StatusId=} status
 * @property {number=} stacks
 * @property {string} text
 *
 * @typedef {object} EnemyState
 * @property {string} uid
 * @property {string} enemyId
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} block
 * @property {StatusStack[]} statuses
 * @property {EnemyIntent} intent
 *
 * @typedef {object} CombatState
 * @property {number} turn
 * @property {EnemyState[]} enemies
 * @property {CardInstance[]} hand
 * @property {CardInstance[]} drawPile
 * @property {CardInstance[]} discardPile
 * @property {number} block
 * @property {string[]} log
 * @property {Record<string, boolean>} flags
 *
 * @typedef {object} PendingDiscardPick
 * @property {"discardPick"} type
 * @property {number} count
 * @property {string=} sourceUid
 * @property {string} title
 *
 * @typedef {object} Reward
 * @property {string} id
 * @property {"card" | "gold" | "relic" | "heal" | "specialFragment" | "purge"} type
 * @property {string | number} value
 *
 * @typedef {object} RouteNode
 * @property {string} id
 * @property {"main" | "side" | "shop"} type
 * @property {number} tier
 * @property {string} title
 * @property {string} text
 * @property {string} rewardText
 * @property {"normal" | "tierPremium" | "side" | "shop"} rewardKind
 *
 * @typedef {object} RunState
 * @property {number} seed
 * @property {number} nextUid
 * @property {number} floor
 * @property {object=} goal
 * @property {Record<string, number>=} archetypeAffinity
 * @property {Record<string, number>=} mythMastery
 * @property {{plays: Record<string, number>, lastAward: object | null}=} mythStats
 * @property {RouteNode[]=} nodeChoices
 * @property {RouteNode | null=} currentNode
 * @property {Record<string, number>=} completedSideTiers
 * @property {boolean=} finalSideCompleted
 * @property {number[]=} shopTiers
 * @property {number[]=} visitedShopTiers
 * @property {boolean=} finalShopVisited
 * @property {object[]=} shopStock
 * @property {PendingDiscardPick | null=} pendingChoice
 * @property {string[]=} guaranteedNextHand
 * @property {CardInstance[]=} retainedHand
 * @property {number=} lastGoldDrop
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} gold
 * @property {number} energy
 * @property {number} maxEnergy
 * @property {number=} handLimit
 * @property {number=} deckLimit
 * @property {CardInstance[]} deck
 * @property {string[]} relics
 * @property {StatusStack[]} statuses
 * @property {CombatState | null} combat
 * @property {Reward[]} rewards
 * @property {boolean=} finished
 *
 * @typedef {object} MetaState
 * @property {number} soul
 * @property {number} totalRuns
 * @property {number} wins
 * @property {number=} lossStreak
 * @property {Record<string, number>=} talents
 * @property {Record<string, number>=} mythMastery
 *
 * @typedef {object} GameState
 * @property {Phase} phase
 * @property {RunState | null} run
 * @property {MetaState} meta
 * @property {string} message
 */

export const MAX_FLOOR = 18;
export const TRUE_MARTIAL_MAX_FLOOR = 25;
export const TARGET_MINUTES = "20-25";
export const TIER_SIZE = 6;
export const TRUE_MARTIAL_TIER_SIZE = 5;

// Difficulty modes
export const DIFFICULTY_BEGINNER = "beginner";
export const DIFFICULTY_REGULAR = "regular";
export const DIFFICULTY_TRUE_MARTIAL = "trueMartial";
export const DIFFICULTY_LABELS = {
  [DIFFICULTY_BEGINNER]: "入门难度",
  [DIFFICULTY_REGULAR]: "常规难度",
  [DIFFICULTY_TRUE_MARTIAL]: "真武模式",
};

// Roll system
export const ROLL_MAX_BEGINNER = 3;
export const ROLL_MAX_REGULAR = 3;
export const ROLL_MAX_TRUE_MARTIAL = 5;

// Delete card system
export const MIN_DECK_SIZE = 8;
export const UNDELETABLE_CARD_IDS = new Set([
  // Reserved for future story/locked cards
]);

// V1.3: Centralized difficulty tuning
export const difficultyTuning = {
  beginner: {
    travelBlock: 6,
    travelDrawExtra: 0,
    lateEnemyPressure: 1.20,
    rewardFocusMult: 0.74,
    enemyHpMult: 0.93,
    physicalRewardMult: 0.90,
    spellRewardMult: 0.82,
    controlRewardMult: 0.62,
    poisonRewardMult: 1.12,
    shellRewardMult: 1.34,
    bleedRewardMult: 1.00,
    playerPoisonApplyMult: 1.0,
  },
  regular: {
    travelBlock: 0,
    travelDrawExtra: 0,
    lateEnemyPressure: 0.95,
    rewardFocusMult: 1.08,
    enemyHpMult: 0.88,
    controlRewardMult: 0.42,
    poisonRewardMult: 0.66,
    bleedRewardMult: 0.88,
    physicalRewardMult: 1.32,
    shellRewardMult: 0.88,
    spellRewardMult: 1.58,
    playerPoisonApplyMult: 0.85,
  },
  trueMartial: {
    travelBlock: 0,
    travelDrawExtra: 0,
    lateEnemyPressure: 1.0,    // TM already has high baseline
    rewardFocusMult: 1.0,
    enemyHpMult: 1.12,         // TM baseline
    playerPoisonApplyMult: 1.0,
  },
};
