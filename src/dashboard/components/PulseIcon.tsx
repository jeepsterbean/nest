import {
  Activity,
  AlarmClock,
  Anchor,
  Apple,
  Armchair,
  Baby,
  Backpack,
  Banana,
  Bandage,
  Bath,
  BatteryCharging,
  Bed,
  Beer,
  Bell,
  BicepsFlexed,
  Bike,
  Binoculars,
  Bird,
  Bone,
  BookHeart,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Broom,
  Bug,
  BusFront,
  CakeSlice,
  CalendarDays,
  Camera,
  Candy,
  CarFront,
  Carrot,
  Cat,
  Cherry,
  CircleCheck,
  CircleGauge,
  Clock3,
  CloudLightning,
  CloudRain,
  CloudSun,
  Coffee,
  Compass,
  Cookie,
  CookingPot,
  Croissant,
  CupSoda,
  Dog,
  Donut,
  DoorOpen,
  Drama,
  Droplets,
  Drum,
  Dumbbell,
  Ear,
  Egg,
  Eye,
  FaceGrinning,
  FaceSlightlyFrowning,
  FaceSlightlySmiling,
  Fan,
  Feather,
  FerrisWheel,
  Film,
  Fish,
  Flame,
  FlameKindling,
  Flashlight,
  Flower2,
  Footprints,
  Gamepad2,
  Gift,
  Glasses,
  GlassWater,
  Globe,
  Goal,
  GraduationCap,
  Grape,
  Guitar,
  Ham,
  Hammer,
  HandHeart,
  Handshake,
  Haze,
  Headphones,
  HeartHandshake,
  HeartPulse,
  Hourglass,
  Hotel,
  House,
  IceCreamCone,
  Joystick,
  Key,
  Lamp,
  Laptop,
  LayoutGrid,
  Leaf,
  LeafyGreen,
  Library,
  Lightbulb,
  Luggage,
  Mail,
  MapPin,
  Medal,
  MessageCircleHeart,
  MicVocal,
  Microwave,
  Milk,
  Moon,
  MoonStar,
  Mountain,
  MountainSnow,
  Music2,
  NotebookPen,
  Palette,
  PartyPopper,
  PawPrint,
  Pencil,
  PersonStanding,
  PhoneCall,
  PhoneOff,
  Piano,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Popcorn,
  Puzzle,
  Rabbit,
  Radio,
  Rainbow,
  Refrigerator,
  Rocket,
  Rose,
  Sailboat,
  Salad,
  Sandwich,
  Scissors,
  Shell,
  ShieldCheck,
  Ship,
  Shirt,
  ShoppingBag,
  ShowerHead,
  Shrimp,
  Shrub,
  Shuffle,
  Snail,
  Snowflake,
  Sofa,
  Soup,
  Sparkles,
  Sprout,
  Squirrel,
  Star,
  Stethoscope,
  StickyNote,
  Store,
  StretchHorizontal,
  Sun,
  Sunrise,
  Sunset,
  Target,
  Telescope,
  Tent,
  ThermometerSun,
  Ticket,
  Timer,
  TrainFront,
  TreePalm,
  TreePine,
  Trees,
  Trophy,
  Truck,
  Turtle,
  Tv,
  Umbrella,
  Users,
  Utensils,
  Volleyball,
  Wallet,
  WashingMachine,
  Watch,
  WavesHorizontal,
  Weight,
  Wheat,
  Wind,
  Wine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MetricColorPicker } from "./MetricColorPicker";
import {
  AssistantIcon,
  CalendarIcon,
  CoreIcon,
  InsightsIcon,
  SettingsIcon,
} from "./icons";

const LUCIDE_NEST_ICONS = [
  { key: "layout-grid", label: "Grid", Icon: LayoutGrid },
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
  { key: "sticky-note", label: "Sticky note", Icon: StickyNote },
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
  { key: "anchor", label: "Anchor", Icon: Anchor },
  { key: "arcade", label: "Arcade", Icon: Joystick },
  { key: "baby", label: "Baby", Icon: Baby },
  { key: "banana", label: "Banana", Icon: Banana },
  { key: "beer", label: "Beer", Icon: Beer },
  { key: "bell", label: "Bell", Icon: Bell },
  { key: "boat", label: "Boat", Icon: Ship },
  { key: "bone", label: "Treat", Icon: Bone },
  { key: "bug", label: "Bug", Icon: Bug },
  { key: "bus", label: "Bus", Icon: BusFront },
  { key: "bush", label: "Bush", Icon: Shrub },
  { key: "cake", label: "Cake", Icon: CakeSlice },
  { key: "call", label: "Call", Icon: PhoneCall },
  { key: "candy", label: "Sweet", Icon: Candy },
  { key: "car", label: "Drive", Icon: CarFront },
  { key: "chair", label: "Chair", Icon: Armchair },
  { key: "cherry", label: "Cherry", Icon: Cherry },
  { key: "cookie", label: "Cookie", Icon: Cookie },
  { key: "croissant", label: "Bakery", Icon: Croissant },
  { key: "donut", label: "Donut", Icon: Donut },
  { key: "door", label: "Door", Icon: DoorOpen },
  { key: "drum", label: "Drum", Icon: Drum },
  { key: "egg", label: "Eggs", Icon: Egg },
  { key: "fair", label: "Fair", Icon: FerrisWheel },
  { key: "fan", label: "Fan", Icon: Fan },
  { key: "feather", label: "Feather", Icon: Feather },
  { key: "film", label: "Film", Icon: Film },
  { key: "fire", label: "Fire", Icon: FlameKindling },
  { key: "fish", label: "Fish", Icon: Fish },
  { key: "fridge", label: "Fridge", Icon: Refrigerator },
  { key: "gift", label: "Gift", Icon: Gift },
  { key: "glasses", label: "Glasses", Icon: Glasses },
  { key: "grape", label: "Grapes", Icon: Grape },
  { key: "greens", label: "Greens", Icon: LeafyGreen },
  { key: "greeting", label: "Greeting", Icon: Handshake },
  { key: "guitar", label: "Guitar", Icon: Guitar },
  { key: "ham", label: "Ham", Icon: Ham },
  { key: "hammer", label: "Hammer", Icon: Hammer },
  { key: "haze", label: "Haze", Icon: Haze },
  { key: "ice-cream", label: "Ice cream", Icon: IceCreamCone },
  { key: "keys", label: "Keys", Icon: Key },
  { key: "lamp", label: "Lamp", Icon: Lamp },
  { key: "laundry", label: "Laundry", Icon: WashingMachine },
  { key: "launch", label: "Launch", Icon: Rocket },
  { key: "library", label: "Library", Icon: Library },
  { key: "lookout", label: "Lookout", Icon: Binoculars },
  { key: "luggage", label: "Luggage", Icon: Luggage },
  { key: "microwave", label: "Microwave", Icon: Microwave },
  { key: "milk", label: "Milk", Icon: Milk },
  { key: "night-sky", label: "Night sky", Icon: MoonStar },
  { key: "pack", label: "Pack", Icon: Backpack },
  { key: "palm", label: "Palm", Icon: TreePalm },
  { key: "patience", label: "Hourglass", Icon: Hourglass },
  { key: "peak", label: "Peak", Icon: MountainSnow },
  { key: "piano", label: "Piano", Icon: Piano },
  { key: "pine", label: "Pine", Icon: TreePine },
  { key: "pizza", label: "Pizza", Icon: Pizza },
  { key: "popcorn", label: "Popcorn", Icon: Popcorn },
  { key: "post", label: "Post", Icon: Mail },
  { key: "puzzle", label: "Puzzle", Icon: Puzzle },
  { key: "rabbit", label: "Rabbit", Icon: Rabbit },
  { key: "radio", label: "Radio", Icon: Radio },
  { key: "repair", label: "Repair", Icon: Wrench },
  { key: "rose", label: "Rose", Icon: Rose },
  { key: "sail", label: "Sailing", Icon: Sailboat },
  { key: "sandwich", label: "Sandwich", Icon: Sandwich },
  { key: "savings", label: "Savings", Icon: PiggyBank },
  { key: "scissors", label: "Scissors", Icon: Scissors },
  { key: "shell", label: "Shell", Icon: Shell },
  { key: "shirt", label: "Clothes", Icon: Shirt },
  { key: "shop", label: "Shop", Icon: Store },
  { key: "shopping", label: "Shopping", Icon: ShoppingBag },
  { key: "shower", label: "Shower", Icon: ShowerHead },
  { key: "shrimp", label: "Seafood", Icon: Shrimp },
  { key: "snail", label: "Snail", Icon: Snail },
  { key: "soda", label: "Soda", Icon: CupSoda },
  { key: "squirrel", label: "Squirrel", Icon: Squirrel },
  { key: "stay", label: "Stay", Icon: Hotel },
  { key: "storm", label: "Storm", Icon: CloudLightning },
  { key: "study", label: "Study", Icon: GraduationCap },
  { key: "telescope", label: "Stargazing", Icon: Telescope },
  { key: "tent", label: "Camping", Icon: Tent },
  { key: "theatre", label: "Theatre", Icon: Drama },
  { key: "ticket", label: "Ticket", Icon: Ticket },
  { key: "tidy", label: "Tidy", Icon: Broom },
  { key: "torch", label: "Torch", Icon: Flashlight },
  { key: "train", label: "Train", Icon: TrainFront },
  { key: "truck", label: "Truck", Icon: Truck },
  { key: "turtle", label: "Turtle", Icon: Turtle },
  { key: "tv", label: "Television", Icon: Tv },
  { key: "umbrella", label: "Umbrella", Icon: Umbrella },
  { key: "voice", label: "Voice", Icon: MicVocal },
  { key: "volleyball", label: "Volleyball", Icon: Volleyball },
  { key: "wallet", label: "Wallet", Icon: Wallet },
  { key: "warm", label: "Warm", Icon: ThermometerSun },
  { key: "watch", label: "Watch", Icon: Watch },
  { key: "wheat", label: "Grain", Icon: Wheat },
  { key: "wine", label: "Wine", Icon: Wine },
  { key: "world", label: "World", Icon: Globe },
  { key: "write", label: "Writing", Icon: Pencil },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  Icon: LucideIcon;
}>;

// Nest's own marks, offered in the same picker as every other icon. Chat and
// Settings outlived their Sections because Pulses and Phases may store them.
// Settings also marks the Sidebar's Settings button.
export const NEST_ICONS = [
  ...LUCIDE_NEST_ICONS,
  { key: "date" as const, label: "Calendar", Icon: CalendarIcon },
  { key: "insights" as const, label: "Insights", Icon: InsightsIcon },
  { key: "core" as const, label: "Core", Icon: CoreIcon },
  { key: "assistant" as const, label: "Chat", Icon: AssistantIcon },
  { key: "settings" as const, label: "Settings", Icon: SettingsIcon },
];

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
 * button, so the trigger may not hold focus), during capture so parent
 * menus yield regardless of listener registration order. It marks the event
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
  children,
  title,
  ariaLabel,
  ariaCurrent,
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
  children?: ReactNode;
  /** Native tooltip. Omit for the icon's friendly name. Pass "" for none. */
  title?: string;
  /** Replaces "Choose icon for {label}" when the trigger is also navigation. */
  ariaLabel?: string;
  ariaCurrent?: "page";
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
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape, true);
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
        aria-label={ariaLabel ?? `Choose icon for ${label}`}
        aria-current={ariaCurrent}
        aria-expanded={open}
        title={title === undefined ? nestIconLabel(icon) : title || undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <NestIcon name={icon} color={iconColor} />
        {children}
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
