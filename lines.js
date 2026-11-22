/* Kindlings Home Twin: every line the game can say, in one table.
 *
 * Plain script, no DOM at top level, so Node can read it to pre-render voice clips:
 *   const L = require('./web/lines.js'); L.all()  ->  [{ text, voice, key }]
 * In the browser it sets window.KindlingsLines.
 *
 * Name tokens (filled at runtime from the family config on the phone):
 *   {kid} the child the pet belongs to, {pet} that child's pet, {sib} the sibling,
 *   {cousin}, {mum}, {dad}
 * Voices: 'roary', 'bao', 'narrator', 'mum', 'dad', 'alfie', 'ruby' (child lines are usually unspoken).
 * Entries with voice null are shown on screen but never spoken.
 * Rules: praise is about effort and method, never about the child ("clever", "star" and "brilliant" are out).
 * The lion speaks in short sentences of about 3 to 6 words. Stories are never a reward for a habit.
 */
(function (root) {
  "use strict";
  var T = {};
  function add(key, voice, texts) { T[key] = { voice: voice, texts: Array.isArray(texts) ? texts : [texts] }; }
  function lion(key, texts) { add(key + ".lion", "roary", texts); }
  function panda(key, texts) { add(key + ".panda", "bao", texts); }
  function both(key, texts) { lion(key, texts); panda(key, texts); }
  function kidLine(key, younger_texts, older_texts) { if (younger_texts) add(key + ".alfie", "alfie", younger_texts); if (older_texts) add(key + ".ruby", "ruby", older_texts); }

  // ---------------- Habit reminders (pet to its own child) ----------------
  lion("remind.teeth_am", ["Teeth time, {kid}! Let's make them sparkly!", "Brush, brush, brush! Show me your teeth!"]);
  panda("remind.teeth_am", ["Morning teeth time! Two minutes to sparkly.", "Can you brush your teeth? I'll count the two minutes with you."]);
  lion("remind.dress", ["Clothes on, {kid}! Which T-shirt today?", "Socks on, then shoes! Roar!"]);
  panda("remind.dress", ["Time to get dressed! What will you pick?", "Can you get dressed? I want to see what you pick."]);
  panda("remind.pack_bag", ["Bag check! Book, water bottle, jumper!", "Is your school bag packed? Let's do it before we go."]);
  lion("remind.pack_bag", ["Is your bag ready, {kid}?"]);
  panda("remind.homework", ["Homework time! I'll sit with you at the desk.", "Shall we do your homework now? Then it's done!"]);
  lion("remind.homework", ["Drawing time at the table, {kid}!"]);
  lion("remind.tidy", ["Tidy-up time! Toys on the shelf!", "Let's race! Toys back on the shelf!"]);
  panda("remind.tidy", ["Toy tidy! Shall we put things away?"]);
  lion("remind.bath", ["Bath time, {kid}! Splash splash!", "The bubbles are waiting! Bath time!"]);
  panda("remind.bath", ["Bath time! Shall we make bubble beards?", "Time for your bath, {kid}."]);
  lion("remind.teeth_pm", ["Bedtime teeth, {kid}! Sparkly for sleeping.", "Brush, brush! Sparkly for bed."]);
  panda("remind.teeth_pm", ["Time to brush your teeth for bed.", "Bedtime teeth! Let's brush every tooth."]);
  lion("remind.bed", ["Into bed now, {kid}. Snuggle time!", "Hop into bed! I'm so sleepy."]);
  panda("remind.bed", ["Time to hop into bed, {kid}.", "Into bed now. I'm getting very sleepy."]);

  // Offering a real choice instead of an order. The game shows the two options as pictures.
  lion("choice.teeth_am", "Top teeth or bottom first? You choose!");
  panda("choice.teeth_am", "Top teeth first, or bottom teeth first? You choose!");
  lion("choice.teeth_pm", "Blue brush or orange brush? You choose!");
  panda("choice.teeth_pm", "Blue toothbrush or orange toothbrush? You choose!");
  lion("choice.bath", "Boat or duck in the bath?");
  panda("choice.bath", "Shall the boat or the duck come in the bath?");
  lion("choice.bed", "Truck story or star story?");
  panda("choice.bed", "Truck story or star story in bed? You choose!");
  lion("choice.dress", "Truck T-shirt or lion T-shirt?");
  panda("choice.dress", "Stripy top or the purple jumper? You choose!");

  both("retry", ["Me again!", "Just checking in!", "Hello again!"]);
  both("forgot", ["Did you forget?", "Psst!"]);
  // "go" is for every body; "go_near" only when the pet can really come along (robot, rover, carried plush).
  both("go", ["Yay! Let's go!", "Hooray!", "Off you go!"]);
  lion("go_near", ["I'm coming too!", "Wait for me!"]);
  panda("go_near", ["I'll come with you.", "Wait for me!"]);
  lion("go_carry", ["Take me with you!", "Carry me too!"]);
  panda("go_carry", ["Take me with you!", "Can I come too?"]);
  lion("later_reply", ["Okay! I'll come back soon.", "No problem. See you soon.", "Okay, a few more minutes."]);
  panda("later_reply", ["Okay! I'll come back in a little bit.", "No problem. I'll remind you soon.", "Alright, a few more minutes."]);
  lion("misheard", ["Sorry, I missed that. Say it again?", "Pardon? My ears are fuzzy."]);
  panda("misheard", ["Sorry, I didn't catch that. Can you say it again?", "Pardon? My ears are a bit fuzzy. One more time?"]);
  lion("fuzzy", "My ears are fuzzy today. I'll try again soon.");
  panda("fuzzy", "My ears are fuzzy today. I'll come back in a minute and try again.");

  // Praise relayed after a grown-up confirms a habit (effort and method only). Three ways to say it, so it doesn't repeat.
  var PRAISE_LION = {
    teeth_am: ["{mum} says you brushed carefully!", "You brushed right to the back!", "Sparkly teeth! You took your time."],
    dress: ["You got dressed all by yourself!", "{dad} says you did your socks!", "Clothes on! You did every bit."],
    pack_bag: ["You packed your bag!", "Bag ready! You checked everything."],
    homework: ["You kept going until the end!", "You finished your drawing!"],
    tidy: ["You put every toy away!", "{mum} says the shelf looks great!", "Toys away! You did them all."],
    bath: ["You washed behind your ears!", "Splashy bath! You washed everywhere.", "{dad} says you washed your toes!"],
    teeth_pm: ["You brushed every tooth!", "Bedtime teeth done! You took your time.", "{mum} says you brushed so carefully!"],
    bed: ["You hopped into bed!", "Into bed all by yourself!"]
  };
  var PRAISE_PANDA = {
    teeth_am: ["{mum} and {dad} told me you brushed right to the back!", "I heard you brushed for the whole two minutes. That's careful brushing!", "You took your time with your teeth this morning. I noticed!"],
    dress: ["{mum} and {dad} told me you got dressed all by yourself!", "I heard you did all your buttons yourself. That takes patience!", "You got dressed step by step. Nice and steady!"],
    pack_bag: ["{mum} and {dad} told me you remembered your water bottle and your book!", "You checked your bag twice. That's a good way to remember!", "Bag packed! You went through the list one thing at a time."],
    homework: ["{mum} and {dad} told me you kept going until your homework was finished!", "You stuck with the tricky part of your homework. That's how brains grow!", "Homework done! You took it one question at a time."],
    tidy: ["{mum} and {dad} told me you put every toy back on the shelf!", "You tidied one pile at a time. That's a smart way to do it!", "The shelf looks lovely. You kept going until it was done!"],
    bath: ["{mum} and {dad} told me you washed behind your ears!", "I heard you washed your hair without a fuss. That was brave!", "Bath done! You remembered every step."],
    teeth_pm: ["{mum} and {dad} told me you brushed every tooth before bed!", "You brushed the back teeth really carefully tonight!", "Bedtime teeth done. You took your time, and that's what makes them sparkle!"],
    bed: ["{mum} and {dad} told me you got into bed!", "You got into bed right away. That makes bedtime so cosy!"]
  };
  Object.keys(PRAISE_LION).forEach(function (task) {
    lion("praise." + task, PRAISE_LION[task]);
    panda("praise." + task, PRAISE_PANDA[task]);
  });
  var PRAISE_GP = {
    teeth_am: ["brushed right to the back", "Grandma says you brushed carefully!"], dress: ["got dressed all by yourself", "Grandma says you dressed yourself!"],
    pack_bag: ["remembered your water bottle and your book", "Grandma says you packed your bag!"], homework: ["kept going until your homework was finished", "Grandpa says you kept going!"],
    tidy: ["put every toy back on the shelf", "Grandpa says you tidied up!"], bath: ["washed behind your ears", "Grandma says you washed everywhere!"],
    teeth_pm: ["brushed every tooth before bed", "Grandma says you brushed carefully!"], bed: ["got into bed", "Grandpa says you hopped into bed!"]
  };
  Object.keys(PRAISE_GP).forEach(function (task) {
    lion("praise_gp." + task, PRAISE_GP[task][1]);
    panda("praise_gp." + task, "Grandma told me you " + PRAISE_GP[task][0] + "! I love hearing that.");
  });

  // ---------------- Quests (tap a picture in the quest strip to hear it) ----------------
  lion("quest.teeth_am", "Teeth! Go to the sink.");
  lion("quest.dress", "Clothes! Go to your wardrobe.");
  lion("quest.tidy", "Tidy up! Find the toy shelf.");
  lion("quest.bath", "Bath time! Go to the bath.");
  lion("quest.teeth_pm", "Bedtime teeth! Go to the sink.");
  lion("quest.bed", "Sleepy time! Find your bed.");
  lion("quest.pack_bag", "Bag time! Go to the desk.");
  lion("quest.homework", "Drawing time! Go to the desk.");
  panda("quest.teeth_am", "Brush your teeth at the bathroom sink.");
  panda("quest.dress", "Get dressed at your wardrobe.");
  panda("quest.pack_bag", "Pack your school bag at your desk.");
  panda("quest.homework", "Do your homework at your desk.");
  panda("quest.tidy", "Tidy the toys onto the toy shelf.");
  panda("quest.bath", "Bath time! Go to the bath.");
  panda("quest.teeth_pm", "Brush your teeth at the bathroom sink.");
  panda("quest.bed", "Hop into your bed.");
  lion("quest_done", ["Done! You did that one.", "That one's done!"]);
  panda("quest_done", ["You've done that one already!", "That one's done. Nice work!"]);
  lion("quest_later", ["That one comes later!", "Not yet. Later!"]);
  panda("quest_later", ["That one comes later today.", "Not yet. We'll do that one later."]);
  lion("quest_none", "No jobs now. Let's play!");
  panda("quest_none", "Nothing to do right now. Shall we play?");

  // ---------------- Invitations and sessions ----------------
  lion("invite.learn", "{kid}! Come and play a puzzle!");
  panda("invite.learn", "{kid}! Want to play a quick puzzle game with me?");
  panda("invite.teach", "{kid}! Come and tell me about your day!");
  panda("invite.reading", "{kid}! Will you come and read me a story?");
  both("invite.other", "{kid}! Come and see me!");
  lion("ask.learn", "Puzzle game? A new friend might be hiding!");
  panda("ask.learn", "Shall we look for a puzzle friend?");
  panda("ask.reading", "Reading time! Will you read me a story?");
  panda("ask.teach", "What did you learn today? Can you teach me?");
  lion("menu", "Puzzle, roar or pat? You pick!");
  panda("menu", "A puzzle, a fact, or a pat? You choose!");

  lion("greet", "Good morning, {kid}! Rise and shine! Roooar!");
  panda("greet", "Good morning, {kid}! Did you sleep well?");
  panda("fact", [
    "Fact of the day: octopuses have three hearts.",
    "Fact of the day: honeybees dance to tell each other where the flowers are.",
    "Fact of the day: butterflies taste with their feet.",
    "Fact of the day: the Sun is a star.",
    "Fact of the day: a baby panda is about as heavy as a stick of butter when it's born.",
    "Fact of the day: some trees live for thousands of years.",
    "Fact of the day: snails can sleep for three years."
  ]);

  // Teach me (the child is the teacher)
  panda("follow.spider", "Eight legs! How many legs do you have?");
  panda("follow.numbers", "Ooh, numbers! What goes with 6 to make 10?");
  panda("follow.fox", "Oh no, poor fox! What do you think he did next?");
  panda("follow.beans", "What do beans need to grow big?");
  panda("follow.days", "What day comes after Monday?");
  panda("follow.leaves", "What colours were your leaves?");
  panda("follow.other", "That's so interesting! Can you tell me one more thing about it?");
  lion("teach_thanks", "Thank you for teaching me! Now I get it.");
  panda("teach_thanks", "Thank you for teaching me! You explained it step by step, so now I really get it.");
  lion("worry", "That sounds important. Let's tell {mum} or {dad}.");
  panda("worry", "That sounds important. Let's ask {mum} or {dad} about it together.");

  panda("reading_praise", "You sounded out the long words slowly. I could picture the whole story!");
  lion("reading_praise", "You turned every page so gently!");

  // Puzzle games (the critter's own lines live in challenges.js)
  lion("learn.new_friend", "A new friend! It's moving in!");
  panda("learn.new_friend", "We made a new friend! It's coming to live in the garden.");
  lion("learn.came_back", "Our friend came back! You remembered!");
  panda("learn.came_back", "Our puzzle friend came back to play. You remembered the tricky ones!");
  lion("learn.friend_closer", ["Our new friend is less shy!", "It peeked out more! Visit again soon."]);
  panda("learn.friend_closer", ["Our puzzle friend is getting less shy. Let's visit again soon!", "It came a little closer this time. Friendship takes a few visits!"]);
  lion("learn.kept_trying", "You kept trying! Let's play again soon.");
  panda("learn.kept_trying", "You kept trying on every puzzle! Let's play again soon.");
  lion("learn.stopped", "Okay! Puzzles another time.");
  panda("learn.stopped", "That's fine. We can do puzzles another time.");
  both("learn.cousin", "{cousin} can play too! Teamwork!");
  lion("learn.capped", "Lots of games today! More tomorrow!");
  panda("learn.capped", "We've played lots today. Let's play again tomorrow!");

  // Daily time cap: a calm goodbye, then the pet only helps with routines until bedtime.
  lion("cap.goodbye", "Lots of play today! Time for a rest.");
  panda("cap.goodbye", "We've played lots today, so I'm going to have a little rest now. I'll still help with bath and bed.");
  lion("cap.resting", "I'm resting now. Let's play tomorrow!");
  panda("cap.resting", "I'm having a little rest now. Let's play again tomorrow!");

  // Growing up (never a sudden change)
  lion("grow", "Look at me! I'm growing!");
  panda("grow", "Look! My sprout grew a little bit!");

  // Bedtime
  lion("yawn", "Yaaawn... I'm sleepy, {kid}. Nearly bedtime.");
  panda("yawn", "Yaaawn... I'm getting sleepy, {kid}. It's nearly bedtime.");
  panda("recap.learned", "Let's remember today. You solved puzzles and kept trying on the tricky ones.");
  panda("recap.helper", "Let's remember today. You were a kind helper.");
  lion("recap.teeth", "Big day, {kid}! You brushed your teeth.");
  lion("recap.dress", "Big day, {kid}! You got dressed.");
  lion("recap.tidy", "Big day, {kid}! You tidied your toys.");
  lion("recap.bath", "Big day, {kid}! Splashy bath!");
  lion("recap.none", "Big day, {kid}! I love playing.");
  lion("story_offer", "Tiny story time? Snuggle in.");
  panda("story_offer", "Shall I tell you a tiny story?");
  lion("story", [
    "Once upon a time... {pet} found a truck. A shiny red truck! He drove it home. Beep beep! He parked it by his bed. Goodnight.",
    "{pet} counted the stars. One, two, three... Four, five, six... Yawn! Fast asleep. Goodnight."
  ]);
  panda("story", [
    "{pet} the panda planted one bamboo seed. Every night she said goodnight to it, and one morning it was taller than her! Goodnight.",
    "{pet} wanted to see the moon up close, so she climbed the tallest tree. The moon smiled and said, time for bed, little panda. Goodnight."
  ]);
  lion("goodnight", "Goodnight, {kid}. Sweet dreams. See you tomorrow.");
  panda("goodnight", "Goodnight, {kid}. Sweet dreams. See you in the morning.");

  // Hard moments
  lion("calm", "Uh oh, cross voices! Three big lion breaths. In... and roar it out softly!");
  panda("calm", "Hmm, cross voices. Shall we do bamboo breathing? Breathe in slowly... and out.");
  lion("calm_after", "Feelings are okay. Say sorry and play?");
  panda("calm_after", "Feelings are okay. Shall we say sorry and play again?");
  lion("checkin", ["How are you feeling? Some water?", "You're poorly. Let's rest together."]);
  panda("checkin", ["How are you feeling? Would you like some water?", "I feel a bit wobbly when you're poorly. Shall we rest together?"]);
  both("checkin_better", "Hooray! Let's still take it slow.");
  lion("checkin_poorly", "Let's snuggle and rest. I'll tell {mum}.");
  panda("checkin_poorly", "Let's snuggle and rest. I'll tell {mum} or {dad}.");
  lion("sofa_story", "Story time on the sofa! I'll read.");
  panda("sofa_story", "Story time on the sofa. I'll do the reading today.");

  // Garden hunt, visits and chat
  lion("explore", "Garden hunt! Can you find something red?");
  panda("explore", "Nature hunt! Can you find three different leaves?");
  lion("explore_done", "You looked under every bush!");
  panda("explore_done", "You looked under every bush! What a hunt.");
  lion("visit", ["Roar! You came to see me!", "Hello! Let's count fingers. One, two, three..."]);
  panda("visit", ["Oh, hello! I was just wondering why the sky is blue.", "You came to visit! Tell me one thing you can see."]);
  lion("chat", ["Rrroar! That's my happy roar.", "I like trucks. Do you like trucks?", "Let's count the windows! One, two..."]);
  panda("chat", ["Did you know bamboo can grow very fast?", "I wonder what clouds are made of.", "Shall we play a puzzle game together?"]);
  lion("roar", "RRROOOAR! What a big roar!");

  // Built-in puzzle fallback (only used if challenges.js is missing)
  both("fb.right", ["You counted every one!", "You looked really carefully!", "You worked it out!"]);
  both("fb.together", "Let's do it together.");
  lion("fb.friend", "Our puzzle friend likes us!");
  panda("fb.friend", "Our puzzle friend wants to be friends!");
  lion("fb.again", "You kept trying! It will come back.");
  panda("fb.again", "You kept trying! Our puzzle friend will come back.");

  // ---------------- Grown-ups ----------------
  ["mum", "dad"].forEach(function (who) {
    add("adult.check.teeth." + who, who, "Have you brushed your teeth yet?");
    add("adult.check.dress." + who, who, "Have you got dressed yet?");
    add("adult.check.pack_bag." + who, who, "Is your school bag packed?");
    add("adult.check.homework." + who, who, "Have you done your homework yet?");
    add("adult.check.tidy." + who, who, "Have the toys gone back on the shelf?");
    add("adult.check.bath." + who, who, "Bath time soon. Are you ready?");
    add("adult.check.bed." + who, who, "Into bed, sleepyhead.");
    add("adult.chat." + who, who, ["Love you!", "What shall we build this weekend?", "Have you seen my keys?"]);
  });
  add("adult.chat.grandma", null, "Hello, sweetheart! Is it nearly bath time?");
  add("adult.chat.grandpa", null, "When I was little we didn't have talking pets!");
  add("adult.chat.theo", null, "Want to see my tiger roar? RRRAAAWR!");

  // ---------------- Narrator (play mode) ----------------
  add("narr.intro", "narrator", "You are {kid}! Walk with the arrows, and press the orange button to talk to {pet}.");
  add("narr.read_to_pet", "narrator", "{kid} reads a story to {pet}.");
  add("narr.breathe", "narrator", "{kid} breathes slowly with {pet}.");
  add("narr.pet_reads", "narrator", "{pet} reads a quiet story to {kid}.");
  add("narr.hunt", "narrator", "{kid} hunts around the garden with {pet}.");
  add("narr.play", "narrator", "{kid} plays with {pet}.");
  add("narr.pickup", "narrator", "You pick up {pet}. Squeeze!");
  add("narr.pet_asleep", "narrator", "{pet} is fast asleep. Shhh.");
  add("narr.pet_flat", "narrator", "{pet}'s battery is flat. A grown-up needs to charge it.");
  add("narr.pet_busy", "narrator", "{pet} is busy right now.");
  add("narr.pat", "narrator", "{pet} wiggles happily.");
  add("narr.not_yours", "narrator", "That's {sib}'s. Better leave it!");
  add("narr.sand", "narrator", "You build a wobbly sandcastle. Then you knock it down. Whoosh!");
  add("narr.nothing", "narrator", ["Nothing here. Walk up to something and press the orange button.", "Hmm, nothing to do here."]);
  add("narr.books", "narrator", "You pick a book with a fox on the cover.");
  add("narr.tv", "narrator", "The TV is off. {pet} says the garden is more fun.");
  add("narr.fridge", "narrator", "You find an apple. Crunch!");
  add("narr.flowers", "narrator", "They smell lovely. A bee buzzes past.");
  add("narr.gate", "narrator", "The gate is closed. You stay in the garden with the grown-ups.");
  add("narr.sofa", "narrator", "Bouncy! You flop onto the sofa.");
  add("narr.table", "narrator", "Crumbs. Someone had toast.");
  add("narr.toilet", "narrator", "Flush! Don't forget to wash your hands.");
  add("narr.pond", "narrator", "A frog says ribbit! Ripples go round and round.");
  add("narr.workshop", "narrator", "The workbench. Building day is Saturday, with {dad}.");
  add("narr.critter", "narrator", ["Your puzzle friend does a happy wiggle!", "Your puzzle friend spins round and round!", "Your puzzle friend hops up and down!"]);
  add("narr.critter_shy", "narrator", "Someone shy is peeking out. Play more puzzles to make friends.");
  add("narr.critter_none", "narrator", "The pet corner is waiting for puzzle friends.");
  add("narr.already_dressed", "narrator", "You're already dressed!");
  add("narr.desk_tidy", "narrator", "The desk is tidy. Nothing to do here now.");
  add("narr.not_bath_time", "narrator", "It's not bath time yet.");
  add("narr.not_sleepy", "narrator", "You're not sleepy yet!");
  add("narr.nothing_to_do", "narrator", "Nothing to do here right now.");
  add("narr.already_done", "narrator", "You already did that today.");
  add("narr.shelf_tidy", "narrator", "The shelf looks tidy already!");
  add("narr.answer_pet", "narrator", "Answer {pet} first.");
  add("narr.busy", "narrator", "You're busy right now.");
  add("narr.help_pet", "narrator", "{kid}, can you help {pet}?");
  add("narr.doing.teeth", "narrator", "Brush, brush, brush...");
  add("narr.doing.dress", "narrator", "Socks, trousers, jumper...");
  add("narr.doing.homework", "narrator", "Pencil out. Let's do this...");
  add("narr.doing.pack_bag", "narrator", "Book, water bottle, jumper...");
  add("narr.doing.tidy", "narrator", "Toys back on the shelf...");
  add("narr.doing.bath", "narrator", "Splish splash!");
  add("narr.doing.bed", "narrator", "Snuggle down...");

  // ---------------- Children (usually unspoken) ----------------
  kidLine("child.yes", ["Okay!", "Yeah!", "Me do it!"], ["Okay!", "Coming!", "Fine, let's go."]);
  kidLine("child.later", ["Play more!", "Not now..."], ["In a minute!", "Just one more minute!"]);
  kidLine("child.no", ["No!", "Nooo!"], ["I don't want to.", "Do I have to?"]);
  kidLine("child.ok", "Okay!", "Okay!");
  kidLine("child.minute", "In a minute!", "In a minute!");
  kidLine("child.nope", "No!", "No!");
  kidLine("child.coming", "Coming!", "Coming!");
  kidLine("child.greet", ["Morning, {pet}!", "Roar!", "I'm awake!"], ["Yes!", "Mmm, sleepy.", "I had a funny dream."]);
  kidLine("child.yes_please", "Yes please!", "Yes please!");
  kidLine("child.book", null, ["Okay. This one is called The Fox and the Box.", "Okay. This one is called Pip the Penguin.", "Okay. This one is called The Big Red Bus.", "Okay. This one is called Snail's Slow Day."]);
  kidLine("child.found", "Found a red flower!", "Oak, maple and holly!");
  kidLine("child.better", "A bit better.", "A bit better.");
  kidLine("child.poorly", "Still poorly.", "Still poorly.");
  kidLine("child.sib_chat", ["Want to play?", "Look what I made!", "Race you to the garden!"], ["Want to play?", "Look what I made!", "Race you to the garden!"]);
  kidLine("child.school", null, ["We learned that spiders have eight legs.", "We did number bonds to ten.", "Miss read us a story about a fox who lost his tail.", "We planted beans in a cup.", "We learned the days of the week.", "We painted autumn leaves."]);
  kidLine("child.school_answer", null, ["I have two legs!", "Four!", "He looked for it everywhere.", "Water and sunshine.", "Tuesday!", "Red and orange and yellow.", "Umm... I forgot!", "I don't know!"]);
  // Picking one of two choices (shown on the button, not spoken)
  kidLine("child.pick", ["That one!", "This one!"], ["That one, please.", "I'll pick this one."]);

  // ---------------- API ----------------
  var NAME_TOKENS = /\{(kid|pet|sib|cousin|mum|dad)\}/g;
  function fill(tpl, ctx) { return String(tpl).replace(NAME_TOKENS, function (m, k) { return ctx && ctx[k] != null ? ctx[k] : m; }); }
  function pick(key, rng) { var e = T[key]; if (!e) return null; var r = typeof rng === "function" ? rng() : Math.random(); return e.texts[Math.min(e.texts.length - 1, Math.floor(r * e.texts.length))]; }
  function all() {
    var out = [], seen = {};
    Object.keys(T).forEach(function (k) {
      var e = T[k]; if (!e.voice) return;
      e.texts.forEach(function (t) { var id = e.voice + "|" + t; if (seen[id]) return; seen[id] = 1; out.push({ text: t, voice: e.voice, key: k }); });
    });
    return out;
  }
  var api = { version: 2, all: all, get: function (k) { return T[k] || null; }, has: function (k) { return !!T[k]; }, keys: function () { return Object.keys(T); }, fill: fill, pick: pick, table: T };
  root.KindlingsLines = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
