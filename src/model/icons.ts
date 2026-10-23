import type { ComponentType } from 'react';
import {
  Analytics, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Badge, Bicycle, Book, Bookmark, Bot, Building,
  Calendar, Camera, Car, Chat, ChartBar, ChartColumn, ChartLine, ChartPie, Checkmark, CheckmarkFilled,
  Chemistry, Close, Cloud, Code, ColorPalette, Construction, Currency, Dashboard, DataBase, Document,
  Earth, Education, Email, ErrorFilled, Favorite, Fire, Flag, Folder, Group, Growth, Help, Home,
  Humidity, Idea, Industry, InformationFilled, Light, Lightning, Link, Location, Locked, Map, Microscope,
  Money, Moon, Music, Notification, Partnership, Password, Phone, Pin, Plane, Quotes, Rocket, Search,
  Security, Settings, Share, Snowflake, Star, Sun, Tag, Target, Time, Tools, Trophy, Unlocked, User,
  UserAvatar, UserMultiple, Video, WarningFilled,
} from '@carbon/icons-react';

type IconComponent = ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }>;

/** Icons offered in the icon picker, keyed by a stable name stored in the deck */
export const ICONS: Record<string, IconComponent> = {
  Star, Favorite, Checkmark, Close, ArrowRight, ArrowLeft, ArrowUp, ArrowDown,
  CheckmarkFilled, ErrorFilled, InformationFilled, WarningFilled, Idea, Lightning, Fire, Humidity,
  Sun, Moon, Cloud, Snowflake, User, UserMultiple, UserAvatar, Group, Home, Building, Industry, Earth,
  ChartLine, ChartBar, ChartPie, ChartColumn, Analytics, Dashboard, Growth, Target,
  Rocket, Plane, Car, Bicycle, Phone, Email, Chat, Notification, Locked, Unlocked, Security, Password,
  Settings, Tools, Construction, Trophy, Badge, Flag, Bookmark, Tag, Pin, Camera, Video, Music,
  ColorPalette, Education, Book, Microscope, Chemistry, Quotes, Money, Currency, Time, Calendar,
  Location, Map, Search, Code, DataBase, Bot, Document, Folder, Share, Link, Light, Partnership, Help,
};

export const ICON_NAMES = Object.keys(ICONS);

/** Icons from decks saved by SlideCraft 1.x (Font Awesome classes) */
const LEGACY_FA: Record<string, string> = {
  star: 'Star', heart: 'Favorite', check: 'Checkmark', xmark: 'Close',
  'arrow-right': 'ArrowRight', 'arrow-left': 'ArrowLeft', 'arrow-up': 'ArrowUp', 'arrow-down': 'ArrowDown',
  'circle-check': 'CheckmarkFilled', 'circle-xmark': 'ErrorFilled', 'circle-info': 'InformationFilled',
  'circle-exclamation': 'WarningFilled', lightbulb: 'Idea', bolt: 'Lightning', fire: 'Fire', droplet: 'Humidity',
  sun: 'Sun', moon: 'Moon', cloud: 'Cloud', snowflake: 'Snowflake', user: 'User', users: 'UserMultiple',
  'user-tie': 'UserAvatar', 'people-group': 'Group', house: 'Home', building: 'Building', city: 'Industry',
  globe: 'Earth', 'chart-line': 'ChartLine', 'chart-bar': 'ChartBar', 'chart-pie': 'ChartPie',
  'chart-simple': 'ChartColumn', rocket: 'Rocket', plane: 'Plane', car: 'Car', bicycle: 'Bicycle',
  phone: 'Phone', envelope: 'Email', comment: 'Chat', bell: 'Notification', lock: 'Locked', unlock: 'Unlocked',
  'shield-halved': 'Security', key: 'Password', gear: 'Settings', wrench: 'Tools',
  'screwdriver-wrench': 'Tools', toolbox: 'Construction', trophy: 'Trophy', medal: 'Badge', award: 'Badge',
  crown: 'Trophy', flag: 'Flag', bookmark: 'Bookmark', tag: 'Tag', thumbtack: 'Pin', camera: 'Camera',
  film: 'Video', music: 'Music', palette: 'ColorPalette', 'graduation-cap': 'Education', book: 'Book',
  microscope: 'Microscope', atom: 'Chemistry', 'quote-left': 'Quotes',
};

export function resolveIconName(nameOrLegacyClass: string | undefined): string {
  if (!nameOrLegacyClass) return 'Star';
  if (ICONS[nameOrLegacyClass]) return nameOrLegacyClass;
  const fa = nameOrLegacyClass.split(' ').pop()?.replace(/^fa-/, '') ?? '';
  return LEGACY_FA[fa] ?? 'Star';
}

/** Turn "UserMultiple" into "user multiple" for search and tooltips */
export function iconLabel(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}
