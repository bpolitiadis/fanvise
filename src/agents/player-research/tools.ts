/**
 * Player Research Agent — Tool Definitions
 *
 * Re-exports canonical tools from the shared registry instead of duplicating them.
 * The player-research agent uses the same ESPN status and news tools as the supervisor,
 * ensuring a single source of truth for tool logic and schemas.
 */

export {
  getEspnPlayerStatusTool,
  getPlayerNewsTool,
} from "@/agents/shared/tool-registry";
