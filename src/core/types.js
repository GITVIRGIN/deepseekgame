/**
 * 这个文件只放类型说明和少量常量。
 * 用 JSDoc 保持无构建依赖，同时让编辑器能读懂核心结构。
 */

/**
 * @typedef {"home" | "route" | "combat" | "reward" | "shop" | "gameOver"} Phase
 * @typedef {"common" | "rare" | "epic" | "legendary"} Rarity
 * @typedef {"self" | "enemy" | "allEnemies"} Target
 * @typedef {"burn" | "bleed" | "poison" | "curse" | "spirit" | "chaos" | "stasis" | "ward"} StatusId
 *
 * @typedef {object} Effect
 * @property {"damage" | "block" | "heal" | "loseHp" | "draw" | "gainEnergy" | "status" | "amplifyDebuffs" | "recoverDiscard" | "maxEnergy" | "maxHp" | "cleanse" | "rareCard" | "handLimit" | "deckLimit" | "gold" | "relic"} type
 * @property {Target=} target
 * @property {number=} value
 * @property {StatusId=} status
 * @property {StatusId[]=} statuses
 * @property {number=} stacks
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
 * @property {"card" | "gold" | "relic" | "heal"} type
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
 * @property {RouteNode[]=} nodeChoices
 * @property {RouteNode | null=} currentNode
 * @property {number[]=} completedSideTiers
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
 * @property {Record<string, number>=} talents
 *
 * @typedef {object} GameState
 * @property {Phase} phase
 * @property {RunState | null} run
 * @property {MetaState} meta
 * @property {string} message
 */

export const MAX_FLOOR = 18;
export const TARGET_MINUTES = "20-25";
export const TIER_SIZE = 6;
