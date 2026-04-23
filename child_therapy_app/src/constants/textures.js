/**
 * TEXTURES — 6 materials with interactive questions.
 *
 * Each texture has:
 *   - questions[] — first one is type "touch" (tap to simulate), rest are knowledge questions
 *   - Each knowledge question has: text, options[], correctId, teachingPrompt
 *   - The "how do you feel" question is added automatically by TextureBookScreen
 */
const TEXTURES = [
  {
    id: "textured_paper",
    name: "Textured Paper",
    description: "Mildly rough, familiar feel",
    color: "#4DB6AC",
    emoji: "📄",
    sensoryCategory: "Neutral / Everyday tactile",
    questions: [
      {
        id: "tp_find",
        text: "Can you find the textured paper in your book? Touch it!",
        type: "touch",
      },
      {
        id: "tp_feel",
        text: "How does the paper feel when you touch it?",
        options: [
          { id: "rough", label: "A little rough", icon: "✋" },
          { id: "smooth", label: "Very smooth", icon: "🧊" },
          { id: "soft", label: "Soft and fluffy", icon: "☁️" },
        ],
        correctId: "rough",
        teachingPrompt: "Feel the tiny bumps? Textured paper feels a little rough!",
      },
      {
        id: "tp_use",
        text: "Where do we use paper like this?",
        options: [
          { id: "drawing", label: "Drawing & art", icon: "🎨" },
          { id: "cooking", label: "Cooking food", icon: "🍳" },
          { id: "building", label: "Building houses", icon: "🏠" },
        ],
        correctId: "drawing",
        teachingPrompt: "We use textured paper for drawing and art projects!",
      },
    ],
  },
  {
    id: "aluminum_foil",
    name: "Aluminum Foil",
    description: "Cold, smooth, and crinkly",
    color: "#B0BEC5",
    emoji: "🪙",
    sensoryCategory: "High-intensity tactile + auditory",
    questions: [
      {
        id: "af_find",
        text: "Find the shiny aluminum foil page and touch it!",
        type: "touch",
      },
      {
        id: "af_feel",
        text: "What does the foil feel like?",
        options: [
          { id: "cold", label: "Cold & smooth", icon: "🧊" },
          { id: "warm", label: "Warm & soft", icon: "🔥" },
          { id: "sticky", label: "Sticky", icon: "🍯" },
        ],
        correctId: "cold",
        teachingPrompt: "Aluminum foil feels cold and smooth — like touching a mirror!",
      },
      {
        id: "af_sound",
        text: "What happens when you crinkle the foil?",
        options: [
          { id: "sound", label: "It makes a sound!", icon: "🔊" },
          { id: "nothing", label: "Nothing happens", icon: "😶" },
          { id: "breaks", label: "It breaks apart", icon: "💥" },
        ],
        correctId: "sound",
        teachingPrompt: "When you crinkle foil, it makes a crinkly sound! 🔊",
      },
      {
        id: "af_use",
        text: "When do we use aluminum foil?",
        options: [
          { id: "wrapping", label: "Wrapping food", icon: "🥪" },
          { id: "wearing", label: "Wearing it", icon: "👕" },
          { id: "sleeping", label: "Sleeping on it", icon: "😴" },
        ],
        correctId: "wrapping",
        teachingPrompt: "We wrap food in aluminum foil to keep it fresh!",
      },
    ],
  },
  {
    id: "felt",
    name: "Felt",
    description: "Soft, warm, and smooth",
    color: "#8D6E63",
    emoji: "🧶",
    sensoryCategory: "Calming / Low-intensity",
    questions: [
      {
        id: "fe_find",
        text: "Find the felt in your book. It's soft — touch it!",
        type: "touch",
      },
      {
        id: "fe_feel",
        text: "How does felt feel?",
        options: [
          { id: "soft", label: "Soft & warm", icon: "🧸" },
          { id: "rough", label: "Rough & scratchy", icon: "🪨" },
          { id: "cold", label: "Cold & hard", icon: "🧊" },
        ],
        correctId: "soft",
        teachingPrompt: "Felt is soft and warm — like a cozy blanket!",
      },
      {
        id: "fe_use",
        text: "What can we make with felt?",
        options: [
          { id: "crafts", label: "Crafts & toys", icon: "✂️" },
          { id: "food", label: "Food", icon: "🍕" },
          { id: "buildings", label: "Buildings", icon: "🏗️" },
        ],
        correctId: "crafts",
        teachingPrompt: "We use felt to make crafts, puppets, and soft toys!",
      },
    ],
  },
  {
    id: "textured_aluminum",
    name: "Textured Aluminum",
    description: "Rough and structured",
    color: "#37474F",
    emoji: "⚙️",
    sensoryCategory: "Medium-intensity",
    questions: [
      {
        id: "ta_find",
        text: "Find the textured aluminum — it has bumps! Touch it!",
        type: "touch",
      },
      {
        id: "ta_feel",
        text: "How is this different from the smooth foil?",
        options: [
          { id: "bumpy", label: "It has bumps!", icon: "⚙️" },
          { id: "same", label: "It's the same", icon: "🤔" },
          { id: "softer", label: "It's softer", icon: "☁️" },
        ],
        correctId: "bumpy",
        teachingPrompt: "This aluminum has bumps and ridges — it's textured!",
      },
      {
        id: "ta_where",
        text: "Where might you find textured metal?",
        options: [
          { id: "machines", label: "On machines", icon: "🔧" },
          { id: "clothes", label: "On clothes", icon: "👗" },
          { id: "food", label: "In food", icon: "🍎" },
        ],
        correctId: "machines",
        teachingPrompt: "Textured metal is often on machines and tools — it helps you grip!",
      },
    ],
  },
  {
    id: "sandpaper",
    name: "Sandpaper",
    description: "Abrasive and rough",
    color: "#FFB74D",
    emoji: "🪨",
    sensoryCategory: "High-intensity / Aversive",
    questions: [
      {
        id: "sp_find",
        text: "Find the sandpaper — be careful, it's rough! Touch it gently.",
        type: "touch",
      },
      {
        id: "sp_feel",
        text: "How does sandpaper feel?",
        options: [
          { id: "rough", label: "Very rough!", icon: "😬" },
          { id: "smooth", label: "Smooth & nice", icon: "😊" },
          { id: "soft", label: "Soft & fluffy", icon: "☁️" },
        ],
        correctId: "rough",
        teachingPrompt: "Sandpaper is very rough — it's okay if you don't like touching it!",
      },
      {
        id: "sp_use",
        text: "What do people use sandpaper for?",
        options: [
          { id: "smoothing", label: "Making wood smooth", icon: "🪵" },
          { id: "drawing", label: "Drawing pictures", icon: "🖍️" },
          { id: "eating", label: "Eating on", icon: "🍽️" },
        ],
        correctId: "smoothing",
        teachingPrompt: "Sandpaper is used to make rough wood smooth and nice!",
      },
    ],
  },
  {
    id: "cotton_balls",
    name: "Cotton Balls",
    description: "Very soft and fluffy",
    color: "#CE93D8",
    emoji: "☁️",
    sensoryCategory: "Calming / Comfort-seeking",
    questions: [
      {
        id: "cb_find",
        text: "Find the cotton balls — they're the softest! Touch them!",
        type: "touch",
      },
      {
        id: "cb_feel",
        text: "How do cotton balls feel?",
        options: [
          { id: "fluffy", label: "Super fluffy!", icon: "☁️" },
          { id: "rough", label: "Rough & hard", icon: "🪨" },
          { id: "cold", label: "Cold & wet", icon: "💧" },
        ],
        correctId: "fluffy",
        teachingPrompt: "Cotton balls are super fluffy and soft — like tiny clouds!",
      },
      {
        id: "cb_use",
        text: "When do we use cotton?",
        options: [
          { id: "clothes", label: "Making clothes", icon: "👕" },
          { id: "building", label: "Building walls", icon: "🧱" },
          { id: "driving", label: "Driving cars", icon: "🚗" },
        ],
        correctId: "clothes",
        teachingPrompt: "Cotton is used to make soft clothes like T-shirts and socks!",
      },
    ],
  },
];

export default TEXTURES;
