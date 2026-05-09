import type { ComponentType } from "react";
import {
  Bell,
  Book,
  Brain,
  Bug,
  CalendarCheck,
  ChatBubble,
  CheckCircle,
  CheckSquare,
  ClipboardCheck,
  DatabaseSearch,
  Flash,
  Group,
  HelpCircle,
  JournalPage,
  Megaphone,
  MessageText,
  MultiplePages,
  NavArrowRight,
  Page,
  Pause,
  Play,
  QuestionMark,
  Search,
  Settings,
  ShieldCheck,
  TaskList,
  Terminal,
  Threads,
  Trash,
  Upload,
  User,
  UserPlus,
  UTurnArrowLeft,
  XmarkCircle,
} from "iconoir-react";

type IconComponent = ComponentType<{
  "aria-hidden"?: boolean;
  className?: string;
  height?: number;
  strokeWidth?: number;
  width?: number;
}>;

const COMMAND_GLYPHS: Record<string, IconComponent> = {
  "1o1": User,
  agent: User,
  ask: ChatBubble,
  broadcast: Megaphone,
  cancel: XmarkCircle,
  channel: MessageText,
  clear: Trash,
  collab: Group,
  default: NavArrowRight,
  "daily-standup": CalendarCheck,
  "deploy-simulation": Terminal,
  "fix-bug": Bug,
  focus: DatabaseSearch,
  help: HelpCircle,
  "hire-agent": UserPlus,
  lint: ShieldCheck,
  lookup: Book,
  message: ChatBubble,
  notebook: JournalPage,
  person: User,
  "promote-to-wiki": Upload,
  provider: Settings,
  remember: Brain,
  requests: Bell,
  "review-office": ClipboardCheck,
  search: Search,
  skills: Flash,
  task: CheckCircle,
  tasks: TaskList,
  threads: Threads,
  pause: Pause,
  resume: Play,
  wiki: Book,
  "assign-task": CheckSquare,
  page: Page,
  pages: MultiplePages,
  question: QuestionMark,
  reset: UTurnArrowLeft,
};

interface CommandGlyphProps {
  className?: string;
  name?: string | null;
}

export function CommandGlyph({ className, name }: CommandGlyphProps) {
  const Icon = COMMAND_GLYPHS[name ?? ""] ?? COMMAND_GLYPHS.default;
  return (
    <Icon
      aria-hidden={true}
      className={className}
      width={15}
      height={15}
      strokeWidth={1.85}
    />
  );
}
