/**
 * TEXTURES — the 6 materials in the physical Book of Textures.
 *
 * Order matches the physical book pages (left to right, top to bottom):
 *   Page 1: Textured Paper
 *   Page 2: Aluminum Foil
 *   Page 3: Felt
 *   Page 4: Textured Aluminum
 *   Page 5: Sandpaper
 *   Page 6: Cotton Balls
 *
 * Each texture_id must match the value sent by ESP32 in its JSON payload.
 */
const TEXTURES = [
  {
    id: "textured_paper",
    name: "Textured Paper",
    description: "Mildly rough, familiar feel",
    color: "#4DB6AC",
    emoji: "📄",
    sensoryCategory: "Neutral / Everyday tactile",
  },
  {
    id: "aluminum_foil",
    name: "Aluminum Foil",
    description: "Cold, smooth, and crinkly",
    color: "#B0BEC5",
    emoji: "🪙",
    sensoryCategory: "High-intensity tactile + auditory",
  },
  {
    id: "felt",
    name: "Felt",
    description: "Soft, warm, and smooth",
    color: "#8D6E63",
    emoji: "🧶",
    sensoryCategory: "Calming / Low-intensity",
  },
  {
    id: "textured_aluminum",
    name: "Textured Aluminum",
    description: "Rough and structured",
    color: "#37474F",
    emoji: "⚙️",
    sensoryCategory: "Medium-intensity",
  },
  {
    id: "sandpaper",
    name: "Sandpaper",
    description: "Abrasive and rough",
    color: "#FFB74D",
    emoji: "🪨",
    sensoryCategory: "High-intensity / Aversive",
  },
  {
    id: "cotton_balls",
    name: "Cotton Balls",
    description: "Very soft and fluffy",
    color: "#CE93D8",
    emoji: "☁️",
    sensoryCategory: "Calming / Comfort-seeking",
  },
];

export default TEXTURES;
