export const AVATAR_EMOJIS = [
  '🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍍', '🥝', 
  '😊', '😇', '🙂', '🥰', '🤩', '✨', '🌟', '🎈', '🎓', '📚', '🎨', '🍀'
];

export const getRandomEmoji = () => {
  return AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];
};
