import {
  Activity,
  AlarmClock,
  Apple,
  Bandage,
  Bath,
  BatteryCharging,
  Bed,
  BicepsFlexed,
  Bike,
  Bird,
  BookHeart,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Carrot,
  Cat,
  CircleCheck,
  CircleGauge,
  Clock3,
  CloudRain,
  CloudSun,
  Coffee,
  Compass,
  CookingPot,
  Dog,
  Droplets,
  Dumbbell,
  Ear,
  Eye,
  FaceGrinning,
  FaceSlightlyFrowning,
  FaceSlightlySmiling,
  Flame,
  Flower2,
  Footprints,
  Gamepad2,
  GlassWater,
  Goal,
  HandHeart,
  Headphones,
  HeartHandshake,
  HeartPulse,
  House,
  Laptop,
  LayoutGrid,
  Leaf,
  Lightbulb,
  MapPin,
  Medal,
  MessageCircleHeart,
  Moon,
  Mountain,
  Music2,
  NotebookPen,
  Palette,
  PartyPopper,
  PawPrint,
  PersonStanding,
  PhoneOff,
  Pill,
  Plane,
  Rainbow,
  Salad,
  ShieldCheck,
  Shuffle,
  Snowflake,
  Sofa,
  Soup,
  Sparkles,
  Sprout,
  Star,
  Stethoscope,
  StretchHorizontal,
  Sun,
  Sunrise,
  Sunset,
  Target,
  Timer,
  Trees,
  Trophy,
  Users,
  Utensils,
  WavesHorizontal,
  Weight,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MetricColorPicker } from "./MetricColorPicker";
import { insightsIcon } from "./icons";

export const NEST_ICONS = [
  { key: "layout-grid", label: "Overview", Icon: LayoutGrid },
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
  { key: "alarm", label: "Alarm", Icon: AlarmClock },
  { key: "bandage", label: "Recovery", Icon: Bandage },
  { key: "bath", label: "Bath", Icon: Bath },
  { key: "bird", label: "Nature", Icon: Bird },
  { key: "camera", label: "Photo", Icon: Camera },
  { key: "carrot", label: "Produce", Icon: Carrot },
  { key: "cat", label: "Cat", Icon: Cat },
  { key: "celebrate", label: "Celebrate", Icon: PartyPopper },
  { key: "chat", label: "Connection", Icon: MessageCircleHeart },
  { key: "compass", label: "Direction", Icon: Compass },
  { key: "cook", label: "Cooking", Icon: CookingPot },
  { key: "dog", label: "Dog", Icon: Dog },
  { key: "droplets", label: "Tears", Icon: Droplets },
  { key: "ear", label: "Listening", Icon: Ear },
  { key: "games", label: "Play", Icon: Gamepad2 },
  { key: "grin", label: "Joy", Icon: FaceGrinning },
  { key: "headphones", label: "Audio", Icon: Headphones },
  { key: "support", label: "Support", Icon: HeartHandshake },
  { key: "laptop", label: "Screen", Icon: Laptop },
  { key: "place", label: "Place", Icon: MapPin },
  { key: "mood", label: "Mood", Icon: FaceSlightlySmiling },
  { key: "low", label: "Low", Icon: FaceSlightlyFrowning },
  { key: "paw", label: "Pets", Icon: PawPrint },
  { key: "people", label: "People", Icon: Users },
  { key: "travel", label: "Travel", Icon: Plane },
  { key: "quiet", label: "Quiet", Icon: PhoneOff },
  { key: "rainbow", label: "Hope", Icon: Rainbow },
  { key: "snow", label: "Cold", Icon: Snowflake },
  { key: "sofa", label: "Rest", Icon: Sofa },
  { key: "soup", label: "Soup", Icon: Soup },
  { key: "health", label: "Health", Icon: Stethoscope },
  { key: "stretch", label: "Stretch", Icon: StretchHorizontal },
  { key: "sunrise", label: "Morning", Icon: Sunrise },
  { key: "sunset", label: "Evening", Icon: Sunset },
  { key: "trees", label: "Outdoors", Icon: Trees },
  { key: "waves", label: "Calm", Icon: WavesHorizontal },
  { key: "weight", label: "Weight", Icon: Weight },
  { key: "wind", label: "Breath", Icon: Wind },
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

export type NestIconKey = (typeof NEST_ICONS)[number]["key"];

const NEST_ICON_KEYS = new Set<string>(NEST_ICONS.map(({ key }) => key));

export function isNestIconKey(value: unknown): value is NestIconKey {
  return typeof value === "string" && NEST_ICON_KEYS.has(value);
}

/** Friendly name for a Nest icon key (e.g. hover tooltips). */
export function nestIconLabel(name: string) {
  return ICON_LABELS[name] ?? "Activity";
}

export function NestIcon({ name, color }: { name: string; color?: string }) {
  if (name === "insights") return insightsIcon;
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

/**
 * The one way to open an IconPicker: it closes after a pick, on Escape, and
 * on an outside press. Scoped to this instance's own element: several of
 * these can be mounted at once, and a shared class selector would read a
 * sibling's press as inside.
 *
 * Escape is handled on `document` (WKWebView does not focus a clicked
 * button, so the trigger may not hold focus) and marks the event
 * `defaultPrevented`, so a surrounding overlay can leave itself open.
 */
export function IconPickerButton({
  icon,
  label,
  className = "",
  controlClassName = "phase-settings__icon-control",
  triggerClassName = "phase-settings__control",
  iconColor,
  color,
  onColorChange,
  onChange,
}: {
  icon: string;
  label: string;
  /** Added to the wrapper, for callers that position the picker themselves. */
  className?: string;
  /** Replaces the wrapper's base class for surfaces with their own control style. */
  controlClassName?: string;
  /** Replaces the trigger's base class for surfaces with their own control style. */
  triggerClassName?: string;
  /** Tints the trigger and the selected icon in the grid. */
  iconColor?: string;
  /** With `onColorChange`, shows the color swatches below the icon grid. */
  color?: string | null;
  onColorChange?: (color: string | null) => void;
  onChange: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      className={`${controlClassName}${className ? ` ${className}` : ""}`}
      ref={controlRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={`Choose icon for ${label}`}
        aria-expanded={open}
        title={nestIconLabel(icon)}
        onClick={() => setOpen((current) => !current)}
      >
        <NestIcon name={icon} color={iconColor} />
      </button>
      {open && (
        <IconPicker
          value={icon}
          label={`Icon for ${label}`}
          color={color}
          iconColor={iconColor}
          onColorChange={onColorChange}
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
