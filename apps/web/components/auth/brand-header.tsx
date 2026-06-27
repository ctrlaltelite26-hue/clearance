import Link from "next/link";
import { Shield } from "lucide-react";

type BrandHeaderProps = {
  title: string;
  subtitle?: string;
  centered?: boolean;
};

export function BrandHeader({ title, subtitle, centered }: BrandHeaderProps) {
  return (
    <div className={centered ? "flex flex-col items-center gap-4 text-center" : "space-y-4"}>
      <Link
        href="/"
        className={`inline-flex items-center gap-2 text-primary transition-opacity hover:opacity-80 ${centered ? "justify-center" : ""}`}
      >
        <Shield className="size-8 fill-primary/20" />
        <span className="text-2xl font-bold tracking-tight">Clearance</span>
      </Link>
      <div className={centered ? "space-y-1" : "space-y-1"}>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
