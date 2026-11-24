import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";

export const Header = ({ right }) => (
  <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
    <Link to="/" data-testid="header-home-link" className="flex items-center gap-2.5">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-primary font-display text-lg font-extrabold text-primary-foreground">M</span>
      <span className="font-display text-xl font-extrabold tracking-tight">Mittwochs&shy;Pizza</span>
    </Link>
    {right ?? (
      <Link to="/admin" data-testid="header-admin-link" aria-label="Admin"
        className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
        <KeyRound className="h-4 w-4" />
      </Link>
    )}
  </header>
);
