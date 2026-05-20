export interface Theme {
  id: string;
  name: string;
  background: string;
  cardBackground: string;
  borderColor: string;
  text: string;
  textSecondary: string;
  primary: string;
  primaryGradient: [string, string];
  accentGradient: [string, string];
  danger: string;
  success: string;
  calculatorBg: string;
  calculatorDisplayBg: string;
  calculatorDisplayGlow: string;
  gridBackground: string;
}

export const Themes: Record<string, Theme> = {
  cyberNeon: {
    id: 'cyberNeon',
    name: 'Cyber Neon',
    background: '#0B0813', // Deep midnight purple-black
    cardBackground: 'rgba(25, 18, 48, 0.5)', // Semi-transparent deep indigo
    borderColor: 'rgba(216, 0, 255, 0.2)', // Neon pink-purple border
    text: '#FFFFFF',
    textSecondary: '#9CA3AF',
    primary: '#D800FF', // Hot pink-magenta
    primaryGradient: ['#D800FF', '#00F0FF'], // Neon magenta to neon cyan
    accentGradient: ['#00F0FF', '#7000FF'], // Cyan to dark violet
    danger: '#FF2E93',
    success: '#00FF66',
    calculatorBg: '#110D24',
    calculatorDisplayBg: '#090514',
    calculatorDisplayGlow: 'rgba(0, 240, 255, 0.25)',
    gridBackground: '#130F29',
  },
  glassObsidian: {
    id: 'glassObsidian',
    name: 'Glass Obsidian',
    background: '#0D0D0D', // Deep pitch black
    cardBackground: 'rgba(30, 30, 30, 0.4)', // Dark grey glass
    borderColor: 'rgba(255, 255, 255, 0.08)',
    text: '#F3F4F6',
    textSecondary: '#9CA3AF',
    primary: '#E2E8F0', // Sleek platinum
    primaryGradient: ['#3A3A3C', '#1C1C1E'], // Platinum to obsidian
    accentGradient: ['#6366F1', '#4F46E5'], // Sleek indigo
    danger: '#EF4444',
    success: '#10B981',
    calculatorBg: '#1A1A1A',
    calculatorDisplayBg: '#080808',
    calculatorDisplayGlow: 'rgba(255, 255, 255, 0.05)',
    gridBackground: '#161616',
  },
  emeraldHaze: {
    id: 'emeraldHaze',
    name: 'Emerald Haze',
    background: '#05160E', // Deep green-black
    cardBackground: 'rgba(10, 35, 22, 0.5)',
    borderColor: 'rgba(16, 185, 129, 0.15)',
    text: '#ECFDF5',
    textSecondary: '#A7F3D0',
    primary: '#10B981', // Neon emerald
    primaryGradient: ['#10B981', '#059669'], // Emerald gradient
    accentGradient: ['#34D399', '#065F46'],
    danger: '#F43F5E',
    success: '#10B981',
    calculatorBg: '#0A2518',
    calculatorDisplayBg: '#030E0A',
    calculatorDisplayGlow: 'rgba(16, 185, 129, 0.2)',
    gridBackground: '#0B291A',
  },
};

export type ThemeId = keyof typeof Themes;
