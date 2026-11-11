export type CandleState = 'idle' | 'requesting-permission' | 'calibrating' | 'listening'
  | 'fallback-ready' | 'extinguishing' | 'revealed';

export type CandleEvent = 'ready' | 'allowed' | 'calibrated' | 'failed' | 'timeout'
  | 'cancel' | 'tap' | 'blow' | 'finished' | 'reset';

const transitions: Record<CandleState, Partial<Record<CandleEvent, CandleState>>> = {
  idle: { ready: 'requesting-permission', tap: 'extinguishing' },
  'requesting-permission': { allowed: 'calibrating', failed: 'fallback-ready', cancel: 'idle', tap: 'extinguishing' },
  calibrating: { calibrated: 'listening', failed: 'fallback-ready', cancel: 'idle', tap: 'extinguishing' },
  listening: { blow: 'extinguishing', failed: 'fallback-ready', timeout: 'fallback-ready', cancel: 'idle', tap: 'extinguishing' },
  'fallback-ready': { tap: 'extinguishing' },
  extinguishing: { finished: 'revealed' },
  revealed: {},
};

export function transitionCandle(state: CandleState, event: CandleEvent): CandleState {
  return event === 'reset' ? 'idle' : transitions[state][event] ?? state;
}
