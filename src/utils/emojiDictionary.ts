export interface EmojiEntry {
  shortcode: string;
  emoji: string;
  keywords: string[];
}

export const EMOJI_DICTIONARY: EmojiEntry[] = [
  { shortcode: 'sparkles', emoji: '✨', keywords: ['magic', 'shine', 'star', 'new'] },
  { shortcode: 'rocket', emoji: '🚀', keywords: ['launch', 'fast', 'space', 'ship'] },
  { shortcode: 'fire', emoji: '🔥', keywords: ['hot', 'flame', 'lit', 'trend'] },
  { shortcode: 'white_check_mark', emoji: '✅', keywords: ['done', 'check', 'success', 'yes'] },
  { shortcode: 'warning', emoji: '⚠️', keywords: ['alert', 'caution', 'danger'] },
  { shortcode: 'bulb', emoji: '💡', keywords: ['idea', 'tip', 'light', 'hint'] },
  { shortcode: 'memo', emoji: '📝', keywords: ['note', 'write', 'document', 'draft'] },
  { shortcode: 'book', emoji: '📖', keywords: ['read', 'manual', 'docs', 'library'] },
  { shortcode: 'pushpin', emoji: '📌', keywords: ['pin', 'important', 'bookmark'] },
  { shortcode: 'link', emoji: '🔗', keywords: ['url', 'anchor', 'chain'] },
  { shortcode: 'lock', emoji: '🔒', keywords: ['security', 'private', 'closed'] },
  { shortcode: 'unlock', emoji: '🔓', keywords: ['open', 'public', 'access'] },
  { shortcode: 'gear', emoji: '⚙️', keywords: ['settings', 'config', 'preferences'] },
  { shortcode: 'hammer_and_wrench', emoji: '🛠️', keywords: ['tools', 'build', 'dev'] },
  { shortcode: 'bug', emoji: '🐛', keywords: ['issue', 'fix', 'debug', 'error'] },
  { shortcode: 'art', emoji: '🎨', keywords: ['design', 'theme', 'color', 'style'] },
  { shortcode: 'zap', emoji: '⚡', keywords: ['fast', 'performance', 'instant', 'bolt'] },
  { shortcode: 'heart', emoji: '❤️', keywords: ['love', 'like', 'favorite'] },
  { shortcode: 'star', emoji: '⭐', keywords: ['favorite', 'rating', 'featured'] },
  { shortcode: 'thumbsup', emoji: '👍', keywords: ['approve', 'ok', 'good'] },
  { shortcode: 'eyes', emoji: '👀', keywords: ['look', 'review', 'watch'] },
  { shortcode: 'tada', emoji: '🎉', keywords: ['celebrate', 'party', 'release'] },
  { shortcode: 'package', emoji: '📦', keywords: ['bundle', 'archive', 'cargo', 'box'] },
  { shortcode: 'Compass', emoji: '🧭', keywords: ['explore', 'navigation', 'guide'] },
  { shortcode: 'chart_with_upwards_trend', emoji: '📈', keywords: ['stats', 'growth', 'analytics'] },
  { shortcode: 'microscope', emoji: '🔬', keywords: ['science', 'research', 'physics', 'chemistry'] },
  { shortcode: 'abacus', emoji: '🧮', keywords: ['math', 'calculate', 'count'] },
  { shortcode: 'globe_with_meridians', emoji: '🌐', keywords: ['web', 'international', 'network'] },
  { shortcode: 'hourglass_flowing_sand', emoji: '⏳', keywords: ['time', 'wait', 'timer'] },
  { shortcode: 'coffee', emoji: '☕', keywords: ['break', 'morning', 'drink'] },
  { shortcode: 'feather', emoji: '🪶', keywords: ['lightweight', 'cursiv', 'write', 'quill'] },
  { shortcode: 'checkered_flag', emoji: '🏁', keywords: ['finish', 'milestone', 'complete'] },
];

export function searchEmojis(query: string): EmojiEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return EMOJI_DICTIONARY.slice(0, 10);
  return EMOJI_DICTIONARY.filter(
    (entry) =>
      entry.shortcode.toLowerCase().includes(q) ||
      entry.keywords.some((k) => k.toLowerCase().includes(q))
  ).slice(0, 10);
}
