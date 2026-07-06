import { Sun, Moon, BookOpen, Monitor } from "lucide-react";
import { useTheme, type ThemeChoice } from "./theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "sepia", label: "Sépia", icon: BookOpen },
  { value: "system", label: "Système", icon: Monitor },
];

export function ThemePicker() {
  const { theme, resolved, setTheme } = useTheme();
  const Icon =
    resolved === "dark" ? Moon : resolved === "sepia" ? BookOpen : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-secondary"
          aria-label="Changer de thème"
        >
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          Thème
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((opt) => {
          const O = opt.icon;
          const active = theme === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={active ? "bg-secondary/60 font-medium" : ""}
            >
              <O className="h-4 w-4 mr-2" />
              {opt.label}
              {active && <span className="ml-auto text-primary">•</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}