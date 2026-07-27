/** Central pool bootstrap — import this anywhere the engine is used. */

import { registerCards } from "./engine";
import { CARD_POOL } from "./cards-data";

registerCards(CARD_POOL);

export { CARD_POOL };
