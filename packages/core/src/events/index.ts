export { matches, matches as eventTypeMatches } from './matcher.js';
export {
  EventBus,
  type DispatchResult,
  type EventHandler,
  type HandlerFailure,
  type Subscription
} from './bus.js';
export { ForeignEmissionError, UndeclaredEmissionError } from './ownership.js';
