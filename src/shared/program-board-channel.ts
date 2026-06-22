/**
 * IPC channel for the program-board state broadcast (main -> renderer).
 *
 * Renderer-only: this channel is never forwarded to remote WebSocket clients.
 * Both the main-process send and the preload on() must reference this constant
 * so a rename cannot silently break the subscription.
 *
 * This lives in its own dependency-free leaf module (no Node built-ins) so the
 * preload can import the constant without dragging `path` (used by the safety
 * helpers in program-board-state.ts) into the SANDBOXED preload bundle, where
 * `require('path')` throws and the whole preload fails to load.
 */
export const PROGRAM_BOARD_STATE_CHANNEL = 'program-board:state';
