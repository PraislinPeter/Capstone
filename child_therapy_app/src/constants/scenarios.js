/**
 * SCENARIOS — 10 Peter & Maria narrated emotion scenarios.
 *
 * Exported as a static array for reference + a shuffled copy function.
 */

const ALL_SCENARIOS = [
  {
    id: "peter_veggies",
    character: "peter",
    title: "Peter Disliking Veggies",
    expectedEmotion: "sad",
    narration:
      "This is Peter. He has some vegetables on his plate, but he doesn't like them. He frowns and pushes them around, looking unhappy.",
    question: "How do you think Peter feels?",
    teachingPrompt: "Peter doesn't like the veggies — he's frowning. That means he feels sad.",
    options: [
      { id: "happy", label: "Happy", icon: "😊" },
      { id: "sad", label: "Sad", icon: "😢" },
    ],
  },
  {
    id: "peter_birthday",
    character: "peter",
    title: "Peter's Birthday",
    expectedEmotion: "happy",
    narration:
      "This is Peter. Today is Peter's birthday! His family is around him, smiling and singing Happy Birthday. Peter blows out the candles and feels very happy.",
    question: "How do you think Peter feels?",
    teachingPrompt: "It's Peter's birthday and everyone is smiling! That means he feels happy.",
    options: [
      { id: "happy", label: "Happy", icon: "😊" },
      { id: "sad", label: "Sad", icon: "😢" },
    ],
  },
  {
    id: "peter_knee",
    character: "peter",
    title: "Peter Scraped Knee",
    expectedEmotion: "sad",
    narration:
      "This is Peter. He was running and slipped. He fell and got a little scrape on his knee. Now he sits on the ground, rubbing his knee and looking hurt.",
    question: "Is Peter feeling happy or sad?",
    teachingPrompt: "Peter fell and hurt his knee. When we get hurt, we feel sad.",
    options: [
      { id: "happy", label: "Happy", icon: "😊" },
      { id: "sad", label: "Sad", icon: "😢" },
    ],
  },
  {
    id: "maria_teddy",
    character: "maria",
    title: "Maria with Teddy Bear",
    expectedEmotion: "happy",
    narration:
      "This is Maria. She hugs her teddy bear tightly. She smiles softly and feels comforted and happy because her teddy makes her feel safe.",
    question: "Do you think Maria is feeling happy or sad?",
    teachingPrompt: "Maria is hugging her teddy and smiling. She feels happy and safe!",
    options: [
      { id: "happy", label: "Happy", icon: "😊" },
      { id: "sad", label: "Sad", icon: "😢" },
    ],
  },
  {
    id: "peter_drawing",
    character: "peter",
    title: "Peter's Drawing",
    expectedEmotion: "happy",
    narration:
      "This is Peter. He is drawing a picture with crayons. He just finished and holds it up proudly. It's a picture of a rainbow. Peter grins and says 'Look what I made!'",
    question: "How does Peter feel about his drawing?",
    teachingPrompt: "Peter made something he's proud of — look at his big grin! He feels happy.",
    options: [
      { id: "happy", label: "Happy", icon: "😊" },
      { id: "sad", label: "Sad", icon: "😢" },
      { id: "calm", label: "Calm", icon: "😌" },
    ],
  },
  {
    id: "peter_leftout",
    character: "peter",
    title: "Peter Left Out",
    expectedEmotion: "sad",
    narration:
      "This is Peter. At the playground, the other kids are playing together but nobody asked Peter to join. Peter stands alone by the slide, watching them play without him.",
    question: "How does Peter feel?",
    teachingPrompt: "Peter is alone while others play. Being left out makes us feel sad.",
    options: [
      { id: "happy", label: "Happy", icon: "😊" },
      { id: "sad", label: "Sad", icon: "😢" },
      { id: "calm", label: "Calm", icon: "😌" },
    ],
  },
  {
    id: "maria_meal",
    character: "maria",
    title: "Maria's Favourite Meal",
    expectedEmotion: "happy",
    narration:
      "This is Maria. Her mom made her favourite meal — pasta with cheese! Maria's eyes light up when she sees it. She claps her hands and can't wait to eat.",
    question: "How is Maria feeling?",
    teachingPrompt: "Maria got her favourite food and she's clapping! She's feeling happy.",
    options: [
      { id: "happy", label: "Happy", icon: "😊" },
      { id: "sad", label: "Sad", icon: "😢" },
      { id: "calm", label: "Calm", icon: "😌" },
    ],
  },
  {
    id: "maria_stairs",
    character: "maria",
    title: "Maria Climbing Stairs",
    expectedEmotion: "calm",
    narration:
      "This is Maria. She is slowly climbing the stairs to go to her room. She holds the handrail carefully, taking one step at a time, feeling relaxed and steady.",
    question: "How does Maria feel while climbing?",
    teachingPrompt: "Maria is going slowly and carefully — she's not excited or sad. She feels calm.",
    options: [
      { id: "happy", label: "Happy", icon: "😊" },
      { id: "sad", label: "Sad", icon: "😢" },
      { id: "calm", label: "Calm", icon: "😌" },
    ],
  },
  {
    id: "maria_dress",
    character: "maria",
    title: "Maria's New Dress",
    expectedEmotion: "happy",
    narration:
      "This is Maria. She tries on a new dress that has her favourite colour — pink! She looks in the mirror and twirls around, smiling from ear to ear.",
    question: "How does Maria feel in her new dress?",
    teachingPrompt: "Maria is twirling and smiling in her new dress! She feels happy.",
    options: [
      { id: "happy", label: "Happy", icon: "😊" },
      { id: "sad", label: "Sad", icon: "😢" },
      { id: "calm", label: "Calm", icon: "😌" },
    ],
  },
  {
    id: "maria_shoes",
    character: "maria",
    title: "Maria Tying Shoes",
    expectedEmotion: "calm",
    narration:
      "This is Maria. She sits on the bench and slowly ties her shoelaces. She concentrates carefully, looping one lace over the other. She breathes slowly.",
    question: "How does Maria feel right now?",
    teachingPrompt: "Maria is focused and breathing slowly. She's not excited or sad — she feels calm.",
    options: [
      { id: "happy", label: "Happy", icon: "😊" },
      { id: "sad", label: "Sad", icon: "😢" },
      { id: "calm", label: "Calm", icon: "😌" },
    ],
  },
];

export const STORY_INTRO =
  "You're going to hear some short stories about two friends, Peter and Maria. " +
  "After each story, I'll ask you how the character is feeling. " +
  "Just tap the emoji that matches how they feel!";

/**
 * Returns a shuffled copy of the scenarios array (Fisher-Yates).
 * Each session gets a different order to keep it fresh.
 */
export function getShuffledScenarios() {
  const arr = [...ALL_SCENARIOS];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default ALL_SCENARIOS;
