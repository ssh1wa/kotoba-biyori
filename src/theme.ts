import { createContext, useContext, useMemo } from 'react';
import { ThemeId } from './types';

const baseThemes = {
  hiyori: {
    ink: '#20201E', muted: '#77736C', paper: '#F8F7F3', surface: '#FFFFFF', line: '#E7E3DA',
    accent: '#D94B3D', accentSoft: '#F8E9E5', green: '#39745A', greenSoft: '#E7F1EB',
    amber: '#A86E1E', amberSoft: '#F7EFDF', charcoal: '#343330', primary: '#20201E',
    onPrimary: '#FFFFFF', segment: '#ECE9E2', raised: '#EFEDE7', sunken: '#F0EEE8',
    track: '#DCD7CE', placeholder: '#9E9A92', dangerText: '#8F3028', statusBar: 'dark' as const,
  },
  indigo: {
    ink: '#202632', muted: '#697180', paper: '#F5F6F8', surface: '#FFFFFF', line: '#DDE1E7',
    accent: '#365EA8', accentSoft: '#E7EDF8', green: '#34725C', greenSoft: '#E3F0E9',
    amber: '#A26B25', amberSoft: '#F5ECDB', charcoal: '#303744', primary: '#252A35',
    onPrimary: '#FFFFFF', segment: '#E8EBF0', raised: '#EBEDF1', sunken: '#EDF0F4',
    track: '#D3D8E0', placeholder: '#9299A5', dangerText: '#9E3847', statusBar: 'dark' as const,
  },
  forest: {
    ink: '#202822', muted: '#68736A', paper: '#F4F6F1', surface: '#FEFFFC', line: '#DCE4D8',
    accent: '#3D7058', accentSoft: '#E2EEE6', green: '#2F7454', greenSoft: '#DFEEE5',
    amber: '#A36D27', amberSoft: '#F4EBD9', charcoal: '#303832', primary: '#26332B',
    onPrimary: '#FFFFFF', segment: '#E6EBE3', raised: '#E9EDE6', sunken: '#EAEFE7',
    track: '#D0D9CE', placeholder: '#8C968E', dangerText: '#98423B', statusBar: 'dark' as const,
  },
  sakura: {
    ink: '#30272B', muted: '#786B70', paper: '#F8F5F6', surface: '#FFFDFE', line: '#E8DDE1',
    accent: '#B84D6B', accentSoft: '#F5E4EA', green: '#40745D', greenSoft: '#E4EFE9',
    amber: '#A26A30', amberSoft: '#F6ECDD', charcoal: '#3B3135', primary: '#33292D',
    onPrimary: '#FFFFFF', segment: '#EEE7E9', raised: '#F0E9EB', sunken: '#F2EBED',
    track: '#DDD1D5', placeholder: '#9B8F93', dangerText: '#9C3552', statusBar: 'dark' as const,
  },
  night: {
    ink: '#F3F1EA', muted: '#AAA7A0', paper: '#161817', surface: '#202321', line: '#343936',
    accent: '#E56B5D', accentSoft: '#3A2523', green: '#65A982', greenSoft: '#20372B',
    amber: '#D5A14C', amberSoft: '#3B3020', charcoal: '#DBD8D0', primary: '#E8E5DE',
    onPrimary: '#191B1A', segment: '#292D2A', raised: '#2A2E2B', sunken: '#1D201E',
    track: '#404640', placeholder: '#7F837E', dangerText: '#F3A49C', statusBar: 'light' as const,
  },
};

export type AppColors = (typeof baseThemes)[ThemeId];
export const themePalettes: Record<ThemeId, AppColors> = baseThemes;
export const colors = themePalettes.hiyori;
export const ThemeContext = createContext<AppColors>(colors);
export const getThemeColors = (theme: ThemeId | undefined) => themePalettes[theme || 'hiyori'] || colors;
export const useAppTheme = () => useContext(ThemeContext);
export const useThemedStyles = <T>(factory: (palette: AppColors) => T) => {
  const palette = useAppTheme();
  return { colors: palette, styles: useMemo(() => factory(palette), [factory, palette]) };
};

export const themeOptions: Array<{ id: ThemeId; name: string; description: string; swatches: string[] }> = [
  { id: 'hiyori', name: '日和朱', description: '暖白、朱红与松绿', swatches: ['#F8F7F3', '#D94B3D', '#39745A'] },
  { id: 'indigo', name: '藍墨', description: '冷白、靛蓝与青绿', swatches: ['#F5F6F8', '#365EA8', '#34725C'] },
  { id: 'forest', name: '青森', description: '浅灰绿、深林与琥珀', swatches: ['#F4F6F1', '#3D7058', '#A36D27'] },
  { id: 'sakura', name: '桜鼠', description: '雾白、樱粉与墨色', swatches: ['#F8F5F6', '#B84D6B', '#30272B'] },
  { id: 'night', name: '夜墨', description: '深墨底、珊瑚与柔白', swatches: ['#161817', '#E56B5D', '#65A982'] },
];

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  sm: 6,
  md: 8,
};
