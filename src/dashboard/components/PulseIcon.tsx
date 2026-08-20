import {
  Activity,
  Apple,
  BatteryCharging,
  Bed,
  BicepsFlexed,
  Bike,
  BookHeart,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  CircleCheck,
  CircleGauge,
  Clock3,
  CloudRain,
  CloudSun,
  Coffee,
  Dumbbell,
  Eye,
  Flame,
  Flower2,
  Footprints,
  GlassWater,
  Goal,
  HandHeart,
  HeartPulse,
  House,
  Leaf,
  Lightbulb,
  Medal,
  Moon,
  Mountain,
  Music2,
  NotebookPen,
  Palette,
  PersonStanding,
  Pill,
  Salad,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Target,
  Timer,
  Trophy,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { MetricColorPicker } from "./MetricColorPicker";

export const NEST_ICONS = [
  { key: "activity", label: "Activity", Icon: Activity },
  { key: "apple", label: "Nutrition", Icon: Apple },
  { key: "battery", label: "Energy", Icon: BatteryCharging },
  { key: "bed", label: "Sleep", Icon: Bed },
  { key: "biceps", label: "Strength", Icon: BicepsFlexed },
  { key: "bike", label: "Cycling", Icon: Bike },
  { key: "bookheart", label: "Reflection", Icon: BookHeart },
  { key: "book", label: "Reading", Icon: BookOpen },
  { key: "brain", label: "Mind", Icon: Brain },
  { key: "work", label: "Work", Icon: BriefcaseBusiness },
  { key: "calendar", label: "Routine", Icon: CalendarDays },
  { key: "check", label: "Complete", Icon: CircleCheck },
  { key: "gauge", label: "Measure", Icon: CircleGauge },
  { key: "clock", label: "Time", Icon: Clock3 },
  { key: "rain", label: "Rain", Icon: CloudRain },
  { key: "weather", label: "Weather", Icon: CloudSun },
  { key: "coffee", label: "Pause", Icon: Coffee },
  { key: "strength", label: "Exercise", Icon: Dumbbell },
  { key: "eye", label: "Awareness", Icon: Eye },
  { key: "flame", label: "Drive", Icon: Flame },
  { key: "flower", label: "Growth", Icon: Flower2 },
  { key: "steps", label: "Movement", Icon: Footprints },
  { key: "water", label: "Hydration", Icon: GlassWater },
  { key: "goal", label: "Goal", Icon: Goal },
  { key: "care", label: "Care", Icon: HandHeart },
  { key: "heart", label: "Heart", Icon: HeartPulse },
  { key: "home", label: "Home", Icon: House },
  { key: "leaf", label: "Wellbeing", Icon: Leaf },
  { key: "idea", label: "Idea", Icon: Lightbulb },
  { key: "medal", label: "Achievement", Icon: Medal },
  { key: "sun", label: "Sun", Icon: Sun },
  { key: "moon", label: "Moon", Icon: Moon },
  { key: "mountain", label: "Challenge", Icon: Mountain },
  { key: "music", label: "Music", Icon: Music2 },
  { key: "notes", label: "Notes", Icon: NotebookPen },
  { key: "palette", label: "Creativity", Icon: Palette },
  { key: "body", label: "Body", Icon: PersonStanding },
  { key: "medicine", label: "Medicine", Icon: Pill },
  { key: "meal", label: "Meal", Icon: Salad },
  { key: "safe", label: "Safety", Icon: ShieldCheck },
  { key: "sparkles", label: "Reset", Icon: Sparkles },
  { key: "sprout", label: "Progress", Icon: Sprout },
  { key: "star", label: "Favourite", Icon: Star },
  { key: "target", label: "Focus", Icon: Target },
  { key: "timer", label: "Timer", Icon: Timer },
  { key: "trophy", label: "Win", Icon: Trophy },
  { key: "food", label: "Food", Icon: Utensils },
  { key: "zap", label: "Charge", Icon: Zap },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  Icon: LucideIcon;
}>;

const ICONS = Object.fromEntries(
  NEST_ICONS.map(({ key, Icon }) => [key, Icon]),
) as Record<string, LucideIcon>;

const ICON_LABELS = Object.fromEntries(
  NEST_ICONS.map(({ key, label }) => [key, label]),
) as Record<string, string>;

/** Friendly name for a Nest icon key (e.g. hover tooltips). */
export function nestIconLabel(name: string) {
  return ICON_LABELS[name] ?? "Activity";
}

export function NestIcon({ name, color }: { name: string; color?: string }) {
  const Icon = ICONS[name] ?? Activity;
  return (
    <Icon
      aria-hidden="true"
      focusable="false"
      style={color ? { color } : undefined}
    />
  );
}

export function pickRandomIcon(current: string, random = Math.random) {
  const choices = NEST_ICONS.filter(({ key }) => key !== current);
  return choices[Math.floor(random() * choices.length)]?.key ?? "activity";
}

export function IconPicker({
  value,
  label,
  onChange,
  color = null,
  iconColor,
  onColorChange,
}: {
  value: string;
  label: string;
  onChange: (icon: string) => void;
  color?: string | null;
  iconColor?: string;
  onColorChange?: (color: string | null) => void;
}) {
  const tint = iconColor ?? color ?? undefined;
  return (
    <div className="icon-picker" role="group" aria-label={label}>
      <button
        type="button"
        className="icon-picker__random"
        onClick={() => onChange(pickRandomIcon(value))}
      >
        <Shuffle aria-hidden="true" />
        Random
      </button>
      <div className="icon-picker__grid">
        {NEST_ICONS.map(({ key, label: iconLabel }) => (
          <button
            type="button"
            key={key}
            aria-label={iconLabel}
            aria-pressed={value === key}
            title={iconLabel}
            onClick={() => onChange(key)}
          >
            <NestIcon name={key} color={value === key ? tint : undefined} />
          </button>
        ))}
      </div>
      {onColorChange ? (
        <MetricColorPicker
          embedded
          value={color}
          label={`Color for ${label}`}
          onChange={onColorChange}
        />
      ) : null}
    </div>
  );
}
