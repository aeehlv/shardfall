/**
 * Campaign narrative: one NodeStory per campaign node (5 chapters x 6 nodes),
 * plus a per-chapter intro. Pure content — no game logic, no imports.
 *
 * Lore sources: library/world/overview.md, library/factions/<slug>/lore.md,
 * library/battlefields/zones.md. Mirrored in library/campaign/chapter-<n>.md.
 */

export interface NodeStory {
  id: string;
  chapterTitle: string;
  title: string;
  subtitle: string;
  body: string[];
  enemyName: string;
  enemyTitle: string;
  stakes: string;
}

export const NODE_STORY: Record<string, NodeStory> = {
  // Chapter I — The Glasswake
  "ch1-n1": {
    id: "ch1-n1",
    chapterTitle: "Chapter I — The Glasswake",
    title: "First Steps",
    subtitle: "A splinter, a sieve, and someone who wants it put back in the ground.",
    body: [
      "You cross the shard-fields at first light with a sieve on your back and forty coppers to your name. The Glasswake gives up its splinters to anyone patient enough to kneel, and this morning it gives up a good one: thumb-sized, warm as a held hand, humming a note that makes your teeth ache pleasantly.",
      "The boy who steps out of the hedgerow cannot be twenty. Rings of gold light glow faintly in the bark-braid of his staff, and he asks, very politely, that you put the seed back where the meadow was keeping it. You have not eaten since yesterday morning. You say no, and reach for your deck.",
      "He is not a soldier. He is something worse: certain. Saplings shoulder up through the glittering grass around his boots before either of you has drawn a second card, and you understand that in the Glasswake everything you take is being taken from something that was already quietly growing.",
    ],
    enemyName: "Pellin Quickthorn",
    enemyTitle: "Orchard Sprigcaller of the Glasswake",
    stakes: "Win and you keep the splinter and a name worth repeating; lose and you go back to sifting gravel for dust.",
  },
  "ch1-n2": {
    id: "ch1-n2",
    chapterTitle: "Chapter I — The Glasswake",
    title: "Shardlight Trail",
    subtitle: "Following a buried seam north, one step ahead of a Root-Oath runner.",
    body: [
      "The splinter in your pocket will not settle. All day it leans, a faint insistent tug northward the way a compass needle leans, and at dusk you finally see why. A seam of buried shardlight runs beneath the meadow like a vein under skin, glowing up through the root-mat in a line you can follow at a walk.",
      "So you follow it. So does a Root-Oath runner sworn to keep gleaners off the seam, and she is very much faster than you across broken ground. She does not want your splinter, which surprises you. She wants you turned around before you reach the stones the Compact has been singing to for a hundred years.",
      "She offers the choice once: go back west, or answer for the trespass here on the open field. The Glasswake settles disagreements the old way, one duel at a time, and the seam burning under your boots is bright enough to play cards by until morning.",
    ],
    enemyName: "Ruvia Softhoof",
    enemyTitle: "Root-Oath Runner of the Northward Seam",
    stakes: "Win and the seam stays open all the way to the stones; lose and the Compact walks you off the Glasswake by dawn.",
  },
  "ch1-n3": {
    id: "ch1-n3",
    chapterTitle: "Chapter I — The Glasswake",
    title: "The Prospector's Claim",
    subtitle: "A sealed shaft, a decade of brambles, and the last crew still down there.",
    body: [
      "The claim posts are still standing, though nothing has been mined here in ten years: a ring of iron stakes, a rotted winch, a shaft mouth swallowed by a thicket that grew, quite deliberately, into the shape of a lid. The Compact does not fill in holes. The Compact plants them shut and lets time do the rest.",
      "There are shards down that shaft worth more than everything you have ever held at once, and the woman tending the thicket has spent nine years making certain nobody digs them out. She calls the shaft a grave rather than a claim. She is not being poetic; the last crew is still in it, and she knows all their names.",
      "You tell her you only need one shard. She says that is precisely what the last crew told her, in almost that order, and the brambles begin to move without hurry, the way roots move when they already know exactly where they intend to be.",
    ],
    enemyName: "Grenna Sapwright",
    enemyTitle: "Claim-Warden of the Sealed Shaft",
    stakes: "Win and the sealed claim is yours to open; lose and the thicket grows one more lid over one more digger.",
  },
  "ch1-n4": {
    id: "ch1-n4",
    chapterTitle: "Chapter I — The Glasswake",
    title: "Meadow Ambush",
    subtitle: "The herds have your description now. The meadow stands up around you.",
    body: [
      "Word travels through root and hoof faster than it travels by road. Two duels in, and the Glasswake knows your face; three duels in, and the herds are waiting for it. They let you get a full day north of the sealed claim, out where the grass stands chest-high and there is nowhere at all to put your back.",
      "Then the meadow stands up. Beast-kin, a dozen of them, thornhide and bristle, circling with the easy patience of a pack that has done this many times before. Their alpha comes out last and unhurried, and a splinter of your own gleaning is glinting in the braid at his throat, recovered, he says, from the trail behind you.",
      "He offers terms, and they are honest ones: leave the shard, leave the Glasswake, keep the legs. You have come too far north to walk home poor and too far to pretend otherwise. The circle tightens a step. The duel starts before the sun has finished going down.",
    ],
    enemyName: "Cassil Briarhound",
    enemyTitle: "Pack-Alpha of the Glinting Herd",
    stakes: "Win and the herds let you pass north; lose and your gleanings end the night braided into the alpha's throat-cord.",
  },
  "ch1-n5": {
    id: "ch1-n5",
    chapterTitle: "Chapter I — The Glasswake",
    title: "Singing Stones",
    subtitle: "Eleven pillars holding one long chord — and your splinter answers it.",
    body: [
      "The Singing Stones are eleven shard-pillars standing in a meadow that has never once been mown, planted by the Compact a lifetime ago and grown since into something between an orchard and a choir. On a still night you can hear them from a mile out, eleven voices holding one long unbroken chord between them.",
      "Your splinter answers them. Not an echo, an answer: a second note fitted neatly beneath the first, the way a hand fits under an elbow, and every pillar in the ring brightens at once. The grovewarden keeping vigil at the center goes very quiet for a moment, and then very quickly for her staff.",
      "She has tended this chord for thirty years and never heard anything reply to it. Whatever you are carrying, she tells you, was not gleaned out of a meadow. It was found, and found things belong to the Vale of Anthem-Fallow. You disagree with her, loudly, in cards.",
    ],
    enemyName: "Ilvane Ringsinger",
    enemyTitle: "Grovewarden of the Singing Stones",
    stakes: "Win and you learn what your shard truly is; lose and the grovewarden carries it down to the Vale without you.",
  },
  "ch1-n6": {
    id: "ch1-n6",
    chapterTitle: "Chapter I — The Glasswake",
    title: "Warden of the Vale",
    subtitle: "Anthem-Fallow asks for the shard back. Politely. Once.",
    body: [
      "They do not chase you to Anthem-Fallow. They invite you. The vale where the first tree woke is a bowl of gold-ringed oaks and unmown grass, and the whole Compact of the Glasswake is standing in it: sprigcallers, runners, the herds from the meadow, the grovewarden with her staff still cracked from your last exchange.",
      "The Warden of the Vale meets you alone at the center of the bowl. She is old enough to remember the Year of Falling Light falling, and she tells you plainly what you have been carrying. Not a splinter. A responsory, a shard that answers other shards, the first found in living memory. Plant it here, she says, and the vale feeds you for life.",
      "Sell it or melt it, she adds, and every root in Kelvarrow will know your name by the end of the season. There is a third option she has carefully not offered, so you take that one instead. She sighs like a felled tree and calls the vale to arms, without anger, with only the terrible patience of something that has outlived everyone who ever refused her.",
    ],
    enemyName: "Sylwen Anthemroot",
    enemyTitle: "Warden of the Vale of Anthem-Fallow",
    stakes: "Win and the Glasswake is behind you and the north road opens; lose and the responsory is planted in Anthem-Fallow forever.",
  },

  // Chapter II — The Cinderreach
  "ch2-n1": {
    id: "ch2-n1",
    chapterTitle: "Chapter II — The Cinderreach",
    title: "Bronze Roads",
    subtitle: "Nobody walks the Bronze Road for free.",
    body: [
      "The Cinderreach announces itself a full day before you reach it. The horizon goes orange at night, the rain arrives warm and gritty, and birds stop bothering. Then the grass ends, the black glass begins, and the Bronze Road comes up out of the smoke: a raised causeway of cast plates humming underfoot from the lava-vein it straddles.",
      "Every plate was poured from a dead legionnaire, because the Dominion casts its dead rather than burying them, and every mile of the road is taxed. The toll-master who steps into your path does not want coin. He wants what is singing inside your coat, since unmelted shards on Dominion road are contraband by doctrine.",
      "You could go around. Around is four hundred miles of open magma field with no water in any direction and nothing but slag to sleep on. So you set your boots on somebody's cast ancestors and inform a slag-knight, politely, that his toll is refused today.",
    ],
    enemyName: "Corvahn Slagbreaker",
    enemyTitle: "Bronze-Road Toll-Master",
    stakes: "Win and the Bronze Road is open ahead of you; lose and your shard rides up the causeway in a toll-master's pouch.",
  },
  "ch2-n2": {
    id: "ch2-n2",
    chapterTitle: "Chapter II — The Cinderreach",
    title: "Slag Gate",
    subtitle: "A hundred feet of fresh slag, poured early, just for you.",
    body: [
      "The Slag Gate is not really a gate. It is a curtain of cooling waste poured fresh across the road twice a day, a hundred feet of glowing rubble that hardens into a wall by dusk and is broken open again at dawn by crews whose families have done nothing else for six generations.",
      "Word of the toll-master's defeat reached the gate hours before you did. The gatewright has already given the order to pour early, out of schedule, and she meets you at the smoking edge of it with the unbothered look of a woman who has closed this road on considerably better than you.",
      "Behind her the crucible-carts are climbing the switchbacks toward the capital, and one of those carts is carrying the Tonic in a casting cradle. Every hour she keeps you standing here is an hour nearer the melt. She knows exactly that. It is the entire purpose of a gate.",
    ],
    enemyName: "Draska Vhorn",
    enemyTitle: "Gatewright of the Slag Curtain",
    stakes: "Win and you are through before the curtain hardens; lose and you wait out a day the Tonic does not have.",
  },
  "ch2-n3": {
    id: "ch2-n3",
    chapterTitle: "Chapter II — The Cinderreach",
    title: "Foundry Row",
    subtitle: "Nine miles of furnaces, and a priest who reads you in the sparks.",
    body: [
      "Foundry Row is nine miles of furnace-houses standing shoulder to shoulder, and it has not stopped once since the Shattering. Bronze goes in raw and comes out as legion-plate, roof tile, and coffin-lid. The air tastes of copper and prayer, and foundry-priests walk the line reading scripture off the sparks that leap from consecrated anvils.",
      "One of them reads you. He stops mid-verse in the doorway of Row Nine, tilts his head at the note coming out of your coat, and announces to the entire street that a responsory has walked into the Cinderreach on its own two legs, which proves, he preaches, that the ore comes willingly to the fire.",
      "It is a very good sermon. Within a minute the whole shift has downed tools to watch him take the shard off you, and you are duelling a priest on a foundry floor with two hundred smiths keeping time on their anvils and nobody at all on your side of the room.",
    ],
    enemyName: "Ulmek Ashvein",
    enemyTitle: "Foundry-Priest of Row Nine",
    stakes: "Win and Foundry Row lets you past; lose and the responsory goes into Row Nine's morning pour.",
  },
  "ch2-n4": {
    id: "ch2-n4",
    chapterTitle: "Chapter II — The Cinderreach",
    title: "The Ember Test",
    subtitle: "Win the contest, or be counted as stock.",
    body: [
      "There is a Dominion custom for outsiders who refuse to be robbed politely, and it is called the Ember Test. Rather than simply kill you and lose the entertainment, the legion offers a contest instead. Win it and you walk the remainder of the Bronze Road as a guest. Lose it and you, and everything on you, are counted as stock.",
      "The sergeant-smith who administers the test has run four hundred of them and lost eleven. She explains the terms twice, slowly, in case you are stupid, and seems genuinely pleased when you accept them. Refusal, you gather, was the outcome she was quietly hoping you would be too proud to choose.",
      "The test is fought on a floor of poured bronze still soft enough to take a bootprint, ringed by legionnaires wagering their rations on how long you last. Hesitate out there and the metal cools around your feet. In the Cinderreach nobody hesitates twice, and most people manage not to hesitate once.",
    ],
    enemyName: "Ivrek Kalt",
    enemyTitle: "Sergeant-Smith of the Ember Test",
    stakes: "Win and you finish the road as a guest of the legion; lose and you are counted as stock, you and everything you carry.",
  },
  "ch2-n5": {
    id: "ch2-n5",
    chapterTitle: "Chapter II — The Cinderreach",
    title: "Crucible Watch",
    subtitle: "One bridge, one night, and a pour scheduled for dawn.",
    body: [
      "The Great Crucible fills the whole sky at the end of the road: a furnace the size of a city, its outer wall riveted over with the bronze legion-plates of every Dominion dead. The heat off it arrives in slow waves you can genuinely lean against, and the melt-song rolling out of it is enormous. Your shard will not stop answering it.",
      "The Crucible Watch holds the last bridge before the casting floor. Their captain has read every report off the road behind you: gate poured early and broken anyway, Row Nine shut down mid-shift, an Ember Test lost by the house. He does not consider you a threat to the Dominion. He considers you a scheduling problem, and the pour is at dawn.",
      "The Tonic is somewhere inside that wall, waiting in a cradle with the rest of the day's stock. If it goes into the melt, the note it carries is gone from the world for good, and whatever your splinter has been walking toward since the Glasswake goes quiet in your pocket and stays quiet.",
    ],
    enemyName: "Kharesh Bronzemantle",
    enemyTitle: "Captain of the Crucible Watch",
    stakes: "Win and you reach the casting floor before dawn; lose and the Tonic goes into the melt while you argue at a bridge.",
  },
  "ch2-n6": {
    id: "ch2-n6",
    chapterTitle: "Chapter II — The Cinderreach",
    title: "The First Hammer's Shadow",
    subtitle: "The cradle is empty. Her hammer is not.",
    body: [
      "You reach the casting floor an hour before dawn and find the cradle empty. The Tonic is gone, and not melted: taken. Sometime in the night the sea came up through the drains of a foundry city forty miles from any coast, and the garrison that was guarding the stock is sitting in the dark humming a tune not one of them remembers learning.",
      "The man waiting for you on the empty floor carries Varkha Cindral's second hammer and speaks with her authority while she is away. She rode for the coast at midnight with four torch-legions behind her. He was left to handle the smaller problem, and the smaller problem is standing in the doorway with a responsory in its coat.",
      "He has no interest in your shard's provenance, your long walk, or the Choir's theft. The First Hammer left one standing order on this floor, which is that nothing unmelted leaves it, and the Dominion recognizes exactly one heresy. He does not hesitate. From here to the end of this, neither can you.",
    ],
    enemyName: "Aurek Dross",
    enemyTitle: "Shadow of the First Hammer",
    stakes: "Win and you learn who took the Tonic and where the sea came from; lose and the standing order is carried out on the empty floor.",
  },

  // Chapter III — The Sunken Antiphon
  "ch3-n1": {
    id: "ch3-n1",
    chapterTitle: "Chapter III — The Sunken Antiphon",
    title: "Drowned Steps",
    subtitle: "Nothing descends the Antiphon that has not been sung down.",
    body: [
      "The bell-shaft lets you out on a stair. It goes down into the dark for as far as your lantern reaches and considerably further after that: cut stone worn hollow in the middle by feet that walked it before the sea came, furred now with pale luminous growth that brightens as you approach and dims again behind you.",
      "A postulant is kneeling on the ninetieth step, keeping a vigil that has apparently lasted eleven years without interruption. She does not look up when you arrive. She sings one note, waits the length of a slow breath, and sings it again, and the shard in your coat answers her before you can get a hand over it.",
      "That, she says, is what she was kneeling here waiting for. The rule of the Antiphon is old and short: nothing descends that has not first been sung down. Your first measure begins on the stair, in water to the knee, with the entire trench below listening to how you play it.",
    ],
    enemyName: "Nyssevet",
    enemyTitle: "Vigil-Postulant of the Drowned Steps",
    stakes: "Win and the Antiphon lets you descend; lose and the stair politely carries you back up to the light.",
  },
  "ch3-n2": {
    id: "ch3-n2",
    chapterTitle: "Chapter III — The Sunken Antiphon",
    title: "Pearl Gallery",
    subtitle: "Three thousand reliquaries, and you have made every one of them shout.",
    body: [
      "Below the stair the trench opens into the Pearl Gallery, a colonnade a mile long where the Choir keeps its lantern-reliquaries. Thousands of shards in pearlshell cases, ranked along the walls like a library that hums to itself, each one holding a single recovered syllable of the Score, each one catalogued by a hand long dead.",
      "Your responsory tries to answer all of them at once. The gallery lights up in a wave down its entire length, cases ringing in their brackets like struck glass, and a cantrix who has spent her whole life keeping this room in tune arrives at a dead run for the first time in several decades.",
      "She is not angry, which is worse. She is appalled. You have made three thousand pieces of scripture shout at once in a place where ordinary speech is rationed, and the retuning will take her a year of nights. She sings the challenge before you can find a way to apologize.",
    ],
    enemyName: "Ovrelle",
    enemyTitle: "Cantrix of the Pearl Gallery",
    stakes: "Win and the gallery opens the way inward; lose and your responsory is shelved as case three thousand and one.",
  },
  "ch3-n3": {
    id: "ch3-n3",
    chapterTitle: "Chapter III — The Sunken Antiphon",
    title: "Choir Practice",
    subtitle: "Thirty-two voices to hold the hymn aloft. One to end it.",
    body: [
      "They put you in a rehearsal. A choir of thirty-three assembles in a flooded chapter house, thirty-two to hold the hymn aloft and one to end it, and you are handed a place in the ranks and a part written in a notation nobody offers to explain. Refusing to sing, you are told gently, is also a kind of singing.",
      "The thirty-third voice conducts. She is younger than you and entirely without doubt, and she has been instructed to find out whether the responsory obeys you or is merely travelling in your pocket for reasons of its own. The test is simple enough. Sing the part wrong, and the hymn will correct you.",
      "Correction down here is not a scolding. Twice during the measure you feel a card you were about to play stop quietly existing in your hand. If you cannot hold a line against a hymn, the Choir will keep the shard and, as a courtesy, forget that you were ever the one carrying it.",
    ],
    enemyName: "Thessine",
    enemyTitle: "Thirty-Third Voice of the Practice Choir",
    stakes: "Win and the Choir accepts that the shard answers to you; lose and it is filed under a name you will not remember giving.",
  },
  "ch3-n4": {
    id: "ch3-n4",
    chapterTitle: "Chapter III — The Sunken Antiphon",
    title: "The Silent Nave",
    subtitle: "A vault of absolute silence, where your shard is worth nothing at all.",
    body: [
      "The nave of the old cathedral is the one place in the Antiphon where nothing sings. The Choir maintains it that way on purpose: a vault of absolute silence at the heart of a city of voices, where a hymn dies the instant it leaves the mouth and the ten thousand bells of Nystrenne hang mute in the dark overhead.",
      "The deacon who keeps that silence does not want you crossing it with an advantage. In the nave your responsory is worth precisely nothing, because it cannot answer what it cannot hear, and he considers this the only honest room in the trench for measuring a duelist who has spent a season winning on the strength of a lucky rock.",
      "He is largely right, and that is the part that stings. You step over the threshold and the note in your pocket goes out like a snuffed lamp, and for the first time since the Glasswake there is nothing in the fight but your own deck and whatever you have learned to do with it.",
    ],
    enemyName: "Vaunell Fathomknell",
    enemyTitle: "Deacon of the Silent Nave",
    stakes: "Win with nothing but your deck and the nave admits you; lose and every duel since the Glasswake is written off as luck.",
  },
  "ch3-n5": {
    id: "ch3-n5",
    chapterTitle: "Chapter III — The Sunken Antiphon",
    title: "Tide Vault",
    subtitle: "The Tonic is behind a door that opens for one slack tide.",
    body: [
      "The Tonic is in the Tide Vault, and the Tide Vault opens twice a day for exactly the length of one slack tide. Everything the Choir judges too loud to shelve in the galleries is kept behind that door: notes that argue with their neighbours, notes that bend the water around them, notes that have eaten other notes.",
      "The vaultmistress meets you at the sill with the exact courtesy the Choir shows anyone it fully intends to refuse. The Tonic is not yours, she explains. It was never the Dominion's either. It is one word out of the only copy of the only book there is, and you are proposing to walk out of the library with a page.",
      "You point out that the Dominion had it cradled for the dawn pour and would have burned that page to slag by now. She agrees with you entirely, and does not move out of the doorway. The tide is already turning behind her, and the door will close whether or not the two of you have settled anything.",
    ],
    enemyName: "Isseryne",
    enemyTitle: "Vaultmistress of the Ninth Tide",
    stakes: "Win and the Tonic leaves with you on the slack tide; lose and the vault shuts for twelve hours and the Choir moves it.",
  },
  "ch3-n6": {
    id: "ch3-n6",
    chapterTitle: "Chapter III — The Sunken Antiphon",
    title: "Echo of the First Voice",
    subtitle: "The First Voice does not come. She sends a hymn wearing a singer.",
    body: [
      "Maelvyra does not come. The First Voice speaks only in notes recovered from shards, so what she sends instead is a hymn wearing a cantrix: her borrowed voice sung into a living singer, courteous, unhurried, and completely impossible to argue with. It greets you by a name you have not used out loud since the Glasswake.",
      "The Choir's offer is generous and entirely sincere. Stay. Your responsory is the key the Score has waited three centuries for, a shard that answers, that can name where every missing note of the worldsong fell. Sing it into the archive, the Echo says, and the second movement can begin in true order in perhaps four hundred years.",
      "Four hundred years. The Dominion pours at every dawn, the Compact grows over whatever the melt leaves behind, and the last verse is still lying unsung in a crater on the far side of the world. You say no to a hymn, which is a thing nobody has ever managed to do politely.",
      "The Echo is not offended; it was not built with anywhere to keep offense. It simply begins, thirty-three voices answering from every gallery at once, unmaking your plays a full measure before you make them. Lose here and you will not be harmed. You will only be recomposed, and you will be grateful about it.",
    ],
    enemyName: "Sevrinne, the Borrowed Voice",
    enemyTitle: "Echo of the First Voice",
    stakes: "Win and you leave the deep with both notes and a heading; lose and you stay forever as the thirty-fourth voice.",
  },

  // Chapter IV — The Greatgraft
  "ch4-n1": {
    id: "ch4-n1",
    chapterTitle: "Chapter IV — The Greatgraft",
    title: "Root Crossing",
    subtitle: "Roots gossip. The bridge closed behind you an hour ago.",
    body: [
      "The Greatgraft begins as a ramp of braided root wide enough to hold a market, and it is holding one: haulers, pilgrims, herds, whole families who have never lived anywhere but on a bridge. The toll-warden at the head of the span takes a single look at the pair of notes riding in your coat and closes the crossing behind you.",
      "He is apologetic about it. Anthem-Fallow sent word by root more than a month ago and the description was unfortunately good. What you are carrying, he says, is two seeds you have no intention whatsoever of planting, and the Compact does not ferry starvation across its own living body.",
      "The bridge is the only road east. Swimming is not something the break in the world permits anyone to attempt twice. So the argument happens right there at the head of the span, with three hundred travellers watching from the rails and every rootlet under the decking listening in.",
    ],
    enemyName: "Odalen Rootbinder",
    enemyTitle: "Toll-Warden of the Root Crossing",
    stakes: "Win and the span is yours to walk; lose and you go back west with a polite escort and empty pockets.",
  },
  "ch4-n2": {
    id: "ch4-n2",
    chapterTitle: "Chapter IV — The Greatgraft",
    title: "The Grafted Mile",
    subtitle: "The oldest splice in the world flinches when you walk on it.",
    body: [
      "The first mile is the oldest, spliced together in the year after the Shattering by grafters who had no idea whether it would hold. It has held. The joins have swollen over three centuries into knuckles the size of houses, and gold light moves through them slowly, like sap, like blood, like something taking its time to think.",
      "The grafter who maintains that mile stops you at the third knuckle. She has spent forty years keeping this splice alive and she can feel the Tonic through the wood, a note badly out of key with everything she has ever grown, making the whole mile flinch underfoot with each step you take across it.",
      "Either the shard stays here and is planted, she says, or you go back west and it goes with you. She has already sent the herds ahead to the next post, so this is not an ambush. The Compact simply intends to be standing in front of you for the next hundred miles.",
    ],
    enemyName: "Brimmel Grafthand",
    enemyTitle: "Graftweaver of the Long Mile",
    stakes: "Win and the oldest splice lets you across; lose and forty years of patience close the road behind you.",
  },
  "ch4-n3": {
    id: "ch4-n3",
    chapterTitle: "Chapter IV — The Greatgraft",
    title: "Sapwarden Post",
    subtitle: "He shows you the rings. The mile behind you has stopped growing.",
    body: [
      "The posts are hollowed heartwood towers grown at intervals along the span, garrisoned by sapwardens who tap the bridge the way a physician takes a pulse. The warden at the eastern post has been reading your progress in the sap for two days now, and he does not like the numbers he is getting.",
      "Since you set foot on the Greatgraft, he says, the mile behind you has slowed its growth to nothing. He shows you the core sample and the rings, and he is not accusing you of malice. He is showing you evidence, patiently, the way you would show a man his own boot-prints in somebody's flowerbed.",
      "The Tonic sets the key, and the key it sets is not the one this bridge was grown in. Every hour you carry it eastward the suture strains a little further out of true, and three landmasses are hanging off the far end of it. He asks you to leave. You refuse a reasonable man, because there is a crater to reach.",
    ],
    enemyName: "Hesk Goldbark",
    enemyTitle: "Sapwarden of the Eastern Post",
    stakes: "Win and the eastern post stands aside; lose and the sapwardens take the Tonic to keep the bridge in key.",
  },
  "ch4-n4": {
    id: "ch4-n4",
    chapterTitle: "Chapter IV — The Greatgraft",
    title: "Golden Hollow",
    subtitle: "They feed you first. That is the cruelty of it.",
    body: [
      "Halfway across, the bridge swells into the Golden Hollow: a cavern inside the living wood the size of a cathedral, warm and gold-lit and loud, full of beast-kin, grandmothers, and saplings sleeping in cradles of moss. It is the nearest thing the Compact has to a city, and the road runs straight through the middle of it.",
      "They feed you first. That is the whole cruelty of the Compact. The hollow-keeper sits you down, fills your bowl twice, asks after the Glasswake and whether Sylwen's staff ever mended, and only then explains that you will not be leaving with two shards while there are children here growing up on the light of one.",
      "She offers a trade that is genuinely fair: the Tonic for safe passage, a name written into the rings, and as much of the Compact's road as you can use for the rest of your life. You look at the cradles for a long moment. Then you refuse anyway, and everyone in the hollow quietly stands up.",
    ],
    enemyName: "Marrowin Duskbloom",
    enemyTitle: "Keeper of the Golden Hollow",
    stakes: "Win and you leave the hollow with both shards; lose and you leave fed, thanked, and holding no key to the Heartwound.",
  },
  "ch4-n5": {
    id: "ch4-n5",
    chapterTitle: "Chapter IV — The Greatgraft",
    title: "The Long Suture",
    subtitle: "Forty miles of unfinished splice and a wind out of the break.",
    body: [
      "Past the hollow the Greatgraft narrows into the Long Suture: forty miles of raw splice where the bridge is still knitting itself together, no wider in places than a wagon, with a wind coming up out of the break that smells of absolutely nothing. Below that is the part of the world nobody has managed to stitch back on.",
      "The suture-master works out here alone, adding a foot of new graft in a good week. She has heard everything the posts behind you sent ahead, and she has decided without any particular anger that the simplest solution is to stop you on the narrowest yard of her own life's work.",
      "She will not cut the span; that oath does not bend for anyone, and it will not bend for you. But she can grow it shut ahead of you, thorn by thorn and knot by knot, and make you win every single yard of the crossing. The wind takes your cards sideways. You play them anyway.",
    ],
    enemyName: "Vessaly Thornstitch",
    enemyTitle: "Suture-Master of the Long Suture",
    stakes: "Win and the last forty miles open ahead of you; lose and the thorns close and the break keeps whatever falls.",
  },
  "ch4-n6": {
    id: "ch4-n6",
    chapterTitle: "Chapter IV — The Greatgraft",
    title: "Heartwood Gate",
    subtitle: "Two hundred years rooted in the splice, and listening the whole way.",
    body: [
      "The far end of the Greatgraft is a gate that grew there on purpose. Aurenthal has stood in the splice for two hundred years, an elder spirit of heartwood and gold-ringed bark, rooted straight down through the bridge it guards and awake for every hour of it. Oremma planted it herself, and the wood still remembers her hands.",
      "It has been listening to you cross for a hundred miles and it does not bother repeating the arguments you have already beaten. It says only this: everything in your coat was a seed before anyone decided it was a key, and the crater you are walking toward is precisely where the seed-bed cracked open.",
      "Past this gate the road runs down to the Heartwound, where the Dominion has begun the Final Pour. Aurenthal cannot let two keystone notes walk into a furnace on the word of a gleaner from the Glasswake. Move it, and it will open. Oremma will hear about it before you are even through.",
      "Nothing else on this bridge has genuinely meant to beat you. This does. Its roots run down through the whole length of the Greatgraft, and the Greatgraft runs to three continents, and all three of them are holding the gate shut from the other side.",
    ],
    enemyName: "Aurenthal, the Standing Gate",
    enemyTitle: "Elder-Spirit of the Heartwood Gate",
    stakes: "Win and the gate opens on the road to the Heartwound; lose and it holds you here until the Final Pour is finished.",
  },

  // Chapter V — The Heartwound
  "ch5-n1": {
    id: "ch5-n1",
    chapterTitle: "Chapter V — The Heartwound",
    title: "Crater Rim",
    subtitle: "Eleven miles of furnace-carts, and orders with your description on them.",
    body: [
      "The rim is a siege line. Furnace-carts stand wheel to wheel for eleven miles around the crater, tapping the tower-shards where they stand, and the legions have built a city out of the staging camps behind them. Nobody up here is guarding against an army. There has not been an army within a thousand miles of this place in years.",
      "The marshal of the rim legion has orders concerning you specifically. Word came up the Bronze Road months ago: a gleaner with a responsory, last seen breaking a slag gate, and not losing anything since. He has been looking forward to your arrival the way soldiers look forward to weather, which is to say with interest and no fear at all.",
      "Behind him the pour has already started. Every hour another cart tips its cradle over the lip and one more note goes out of the world permanently. You count six of them going in while he shuffles his deck. Then he looks up and tells you exactly where to stand.",
    ],
    enemyName: "Rekhal Ironpour",
    enemyTitle: "Marshal of the Rim Legion",
    stakes: "Win and you get down off the rim alive; lose and you go up the Bronze Road with the rest of the stock.",
  },
  "ch5-n2": {
    id: "ch5-n2",
    chapterTitle: "Chapter V — The Heartwound",
    title: "Falling Light",
    subtitle: "The Year of Falling Light never actually ended down here.",
    body: [
      "Inside the breach it is still snowing. The Year of Falling Light never ended down here, not really: shard-dust and splinters drift up out of the wound on the heat and settle back down again, endlessly, so the whole descent happens through a slow bright weather that lands on your shoulders and hums against your collarbones.",
      "The Dominion has an evangelist working the terraces, preaching to the pour crews with her arms full of falling light. She calls this the Second Falling, the ore returning to the smith of its own accord, proof that the Unfinished Work has begun finishing itself. The crews believe her completely. She is not wrong about very much.",
      "She recognizes your responsory the moment it answers the snow, and she does not think of you as a thief or even a heretic. You are scripture that walked into her sermon on its own two legs. She means to preach you to the crews, and then she means to pour you.",
    ],
    enemyName: "Ambrekka Ashfall",
    enemyTitle: "Evangelist of the Second Falling",
    stakes: "Win and the descent continues; lose and you become the closing line of a very good sermon.",
  },
  "ch5-n3": {
    id: "ch5-n3",
    chapterTitle: "Chapter V — The Heartwound",
    title: "The Worldsong Breach",
    subtitle: "A bronze bridge over the wound, and the chord coming up through it.",
    body: [
      "Below the terraces the crater floor splits open on the Worldsong Breach, the actual wound itself, a crack running down past stone into the dark where the Undersun used to hang. Sound comes up out of it constantly. Not an echo: a chord, held for three centuries, missing so many notes that you can hear the shape of the holes.",
      "The Dominion has bridged the breach in poured bronze so the carts can reach the deep shards on the far side. The breachmaster who laid that span is standing in the middle of it. He has lost sixty of his crew into the drop over two seasons and privately counts each of them as a rivet.",
      "Both your shards are screaming now, in harmony, straining toward the crack like they fully intend to jump into it. Whatever the last verse of the worldsong is, it is somewhere beneath this bridge. So, immovably, is he.",
    ],
    enemyName: "Tovren Slagvow",
    enemyTitle: "Breachmaster of the Legion of the Pour",
    stakes: "Win and the bronze bridge is yours to cross; lose and the breach gets one more rivet.",
  },
  "ch5-n4": {
    id: "ch5-n4",
    chapterTitle: "Chapter V — The Heartwound",
    title: "Shardstorm",
    subtitle: "The crater rings out of tune, and someone is steering the gale.",
    body: [
      "The pour has made the crater angry. Tapping the tower-shards has set the entire Heartwound ringing out of tune, and twice a day the loose light comes off the walls in a shardstorm: a gale of glowing splinters that strips bronze off armour, opens stone, and sings the whole time it is doing it.",
      "The Dominion rides the storms out behind kilnbeasts, and the yoke-master who drives them has learned to steer a gale the way a herder steers water. Pick a slope, cut a channel, and let the light do the killing for you. She has spent the morning channelling this one directly onto your road.",
      "There is exactly one lee in the whole crater, a shelf of standing shard the size of a barn, and she is on it with her beasts. You fight her for the shelter while the storm eats everything you are not currently standing on. Losing here is not a surrender. It is the crater taking you.",
    ],
    enemyName: "Ysmet Cinderveil",
    enemyTitle: "Kilnbeast Yoke-Master of the Ashen Gale",
    stakes: "Win and you hold the only shelter in the gale; lose and the shardstorm takes you apart in tune.",
  },
  "ch5-n5": {
    id: "ch5-n5",
    chapterTitle: "Chapter V — The Heartwound",
    title: "The Last Verse",
    subtitle: "The founder was cast in bronze to stand watch over exactly this.",
    body: [
      "You find the last verse lying where it fell: a shard the size of a cathedral bell, resting in the deepest cradle of the crater, unmelted and unmined, ringed by legionnaires kneeling at a distance nobody ever had to order them to keep. Your two shards go quiet in its presence, the way voices go quiet in a doorway.",
      "Something is standing over it. Ostrekka Vhal preached the first sermon of the Unfinished Work three centuries ago and was poured into bronze at her own request when she died, so the founder could stand watch over the final casting. The Dominion cast her rather better than it understood at the time.",
      "She does not speak. She has not spoken since the mold came off her. But the hammer moves, and the legion behind her kneels a little lower, and it is entirely clear that the last verse of the worldsong is about to be melted by the woman who first thought of melting anything, unless you take it off her here.",
    ],
    enemyName: "Ostrekka Vhal",
    enemyTitle: "The Founder, Cast Eternal",
    stakes: "Win and the last verse stays unmelted; lose and the founder finishes what she started three centuries ago.",
  },
  "ch5-n6": {
    id: "ch5-n6",
    chapterTitle: "Chapter V — The Heartwound",
    title: "Heart of the Shattering",
    subtitle: "Melt, hymn, or seed — and the First Hammer votes first.",
    body: [
      "The bottom of the Heartwound is a floor of unbroken songlight, and Varkha Cindral is standing in the middle of it with Refrain resting on her shoulder, watching the last cart come down the ramp. She has been waiting for you since the Cinderreach. She measures twice and strikes once, and she has had a very long time to measure.",
      "She makes no speech. The Dominion's whole case fits into one line and she has said it at every casting since she was slag-caste sorting waste under the foundry floors: the world was not destroyed, it was struck, and a blade left unfinished in the fire is nothing but waste. Three notes remain unmelted in all of Kelvarrow, and you are holding them.",
      "Behind you the Choir has surfaced in the crater lakes and the Greatgraft's roots have come up through the crater wall, and both of them want those same three notes for endings of their own. Everyone standing in this hole has an answer to what the Shattering meant. Only one of you is going to get to sing it.",
      "Win, and what becomes of the heart of the world is yours to decide: the melt, the hymn, or the seed. Lose, and the pour begins at dawn as scheduled, and the worldsong ends on a chord that nobody now alive will ever get to hear.",
    ],
    enemyName: "Varkha Cindral",
    enemyTitle: "First Hammer of the Great Crucible",
    stakes: "Win and the heart of the world is yours to decide; lose and the Final Pour begins at dawn and the song ends there.",
  },
};

export const CHAPTER_INTRO: Record<number, { title: string; body: string[] }> = {
  1: {
    title: "Chapter I — The Glasswake",
    body: [
      "You were not born to this war. You were born downwind of it, in the Glasswake, where the grass glitters because the sky bled light for a full year and nobody ever swept it up. Gleaners work these meadows with sieves and patience, trading knuckle-sized splinters of the Undersun for bread and boots.",
      "It is honest work right up until the forest disagrees. The Verdant Compact has walked the Glasswake since the Waking, tending every shardfall crater like an orchard, and the Root-Oath they swore under the first gold-ringed tree names your sieve a shovel and your trade a robbery. They have been polite about it. That season is ending.",
      "Six duels stand between you and the Vale of Anthem-Fallow, where the first tree woke and the Compact keeps its oldest promise. Somewhere in the glittering grass is a shard that does not merely sing, but answers. You do not know that yet. The Compact, listening through every root under your boots, already does.",
    ],
  },
  2: {
    title: "Chapter II — The Cinderreach",
    body: [
      "Sylwen Anthemroot loses well. Beaten in her own vale, she tells you what the Compact knows and no gleaner ever will: the thing in your pocket is a responsory, a shard that answers other shards, and it has been leaning north since the day you found it because something enormous is answering it back.",
      "The Pyre Dominion dredged that something out of the Scalded Shelf last winter. The Abyssal Choir calls it the Tonic, the keystone note that sets the key of every verse the worldsong has left to sing. The Dominion calls it stock metal, and has carried it up the Bronze Road to the Great Crucible to be melted.",
      "Six duels lie between the Cinderreach border and the furnace floor, every one of them against people who hold hesitation to be the only heresy. Nobody walks the Bronze Road for free, and nobody carries an unmelted shard along it at all. You have never been anywhere this hot. Your splinter has never sung this loud.",
    ],
  },
  3: {
    title: "Chapter III — The Sunken Antiphon",
    body: [
      "The Choir took the Tonic and went home with it, and home is four thousand feet down. The Sunken Antiphon is what became of Nystrenne of the ten thousand bells: a drowned cathedral city folded into a trench, lit violet and teal by the people living in it now, none of whom have needed to breathe in a very long time.",
      "You go down through a flooded bell-shaft in a diving bell of scavenged Dominion bronze, and the pressure sings the whole way. Nobody stops you, and that is the first unnerving thing. The second is that the Choir already knows the shape of the note in your pocket and has arranged your entire descent as a rehearsal.",
      "Six duels lie between the surface light and the Score. They are not trying to kill you, because killing wastes a voice. They are auditioning you, one measure at a time, in a place where speech is rationed and every wrong note is corrected out of existence. The Choir has never once in its history been in a hurry.",
    ],
  },
  4: {
    title: "Chapter IV — The Greatgraft",
    body: [
      "You leave the Antiphon with the Tonic in one pocket and the responsory in the other, and the two of them will not stop talking to each other. Held together they lean, hard and unmistakably, toward the Heartwound, the crater where the Undersun burst and the last verse of the worldsong is still lying where it landed.",
      "There is exactly one road there. The Greatgraft is the Verdant Compact's living suture, a bridge of grafted root and gold-lit heartwood strung across a bottomless break in the world, and it has been closed to you since the afternoon you beat Sylwen Anthemroot in her own vale. Roots gossip, and they gossip in every direction at once.",
      "Six spans, six wardens, and at the far end a gate grown from Oremma's own heartwood. Below the walkway there is nothing at all for a very long way down. The Compact does not need to beat you here; the Compact only needs to make the crossing cost more than a gleaner from the Glasswake has to spend.",
    ],
  },
  5: {
    title: "Chapter V — The Heartwound",
    body: [
      "Aurenthal opens, and the last road runs downhill for nine days. You smell the Heartwound long before you see it: air like a struck bell, a taste of hot glass on the teeth, and a light standing on the midnight horizon that is not fire and does not flicker. Then the ground simply stops, and the crater begins.",
      "This is where the Undersun burst. Fragments of frozen songlight stand around the rim like towers, and inside the breach the smaller pieces still fall in slow impossible arcs, still holding the chord that broke the world. Both your shards are shaking now, straining downward, and somewhere under all of it lies a verse that has never been sung.",
      "The Pyre Dominion got here first. Varkha Cindral has brought the Great Crucible's furnace-carts to the rim and begun the Final Pour: every tower-shard in the Heartwound into the melt, the last hammerblow of the Unfinished Work. Six duels lie between the rim and the crater floor. She is waiting at the bottom, and she does not hesitate.",
    ],
  },
};

/** Story for a campaign node id, or undefined if the id is unknown. */
export function storyFor(nodeId: string): NodeStory | undefined {
  return NODE_STORY[nodeId];
}

/** Intro for a chapter number (1-5), or undefined. */
export function chapterIntro(chapter: number): { title: string; body: string[] } | undefined {
  return CHAPTER_INTRO[chapter];
}
