import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Award,
  BarChart2,
  Bell,
  BellOff,
  Briefcase,
  Calendar,
  Camera,
  Check,
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDashed,
  Clock,
  Cpu,
  DollarSign,
  Droplet,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Fingerprint,
  Grid,
  HardDrive,
  Headphones,
  Heart,
  HelpCircle,
  Home,
  Image,
  Info,
  Layers,
  Lock,
  LogOut,
  Mail,
  Map,
  MapPin,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  MoreVertical,
  Navigation,
  Package,
  Pencil,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PlayCircle,
  Plus,
  RefreshCw,
  ScanFace,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  Sliders,
  Star,
  StopCircle,
  Tag,
  TrendingDown,
  TrendingUp,
  User,
  Volume1,
  Volume2,
  Wifi,
  WifiOff,
  Wrench,
  X,
  XCircle,
  Zap,
  ZoomIn,
} from "lucide-react-native";
import React from "react";

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: object;
}>;

const ICON_MAP: Record<string, IconComponent> = {
  "alert-circle": AlertCircle,
  "alert-triangle": AlertTriangle,
  "arrow-down": ArrowDown,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  award: Award,
  "bar-chart-2": BarChart2,
  bell: Bell,
  "bell-off": BellOff,
  briefcase: Briefcase,
  calendar: Calendar,
  camera: Camera,
  check: Check,
  "check-circle": CheckCircle,
  "check-square": CheckSquare,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  clock: Clock,
  cpu: Cpu,
  "dollar-sign": DollarSign,
  droplet: Droplet,
  edit: Edit,
  "edit-2": Pencil,
  "external-link": ExternalLink,
  eye: Eye,
  "eye-off": EyeOff,
  facebook: Share2,
  "file-text": FileText,
  filter: Filter,
  fingerprint: Fingerprint,
  "fingerprint-pattern": Fingerprint,
  grid: Grid,
  "hard-drive": HardDrive,
  headphones: Headphones,
  heart: Heart,
  help: HelpCircle,
  "help-circle": HelpCircle,
  home: Home,
  image: Image,
  info: Info,
  instagram: Share2,
  layers: Layers,
  lock: Lock,
  "log-out": LogOut,
  mail: Mail,
  map: Map,
  "map-pin": MapPin,
  "message-circle": MessageCircle,
  "message-square": MessageSquare,
  mic: Mic,
  "mic-off": MicOff,
  "more-horizontal": MoreHorizontal,
  "more-vertical": MoreVertical,
  navigation: Navigation,
  package: Package,
  phone: Phone,
  "phone-call": PhoneCall,
  "phone-incoming": PhoneIncoming,
  "phone-missed": PhoneMissed,
  "phone-off": PhoneOff,
  "play-circle": PlayCircle,
  plus: Plus,
  "refresh-cw": RefreshCw,
  "scan-face": ScanFace,
  search: Search,
  send: Send,
  settings: Settings,
  "share-2": Share2,
  shield: Shield,
  sliders: Sliders,
  star: Star,
  "stop-circle": StopCircle,
  tag: Tag,
  tool: Wrench,
  "trending-down": TrendingDown,
  "trending-up": TrendingUp,
  user: User,
  "volume-1": Volume1,
  "volume-2": Volume2,
  wifi: Wifi,
  "wifi-off": WifiOff,
  wrench: Wrench,
  x: X,
  "x-circle": XCircle,
  zap: Zap,
  "zoom-in": ZoomIn,
};

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: object;
}

export function Icon({
  name,
  size = 24,
  color = "#000000",
  strokeWidth = 2,
  style,
}: IconProps) {
  const Comp = ICON_MAP[name];

  if (!Comp) {
    return (
      <CircleDashed
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        style={style}
      />
    );
  }

  return (
    <Comp
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      style={style}
    />
  );
}

export default Icon;

