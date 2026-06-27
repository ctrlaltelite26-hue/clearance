export function AuthFooter() {
  return (
    <footer className="fixed inset-x-0 bottom-0 hidden border-t border-border bg-background md:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <span className="text-xs text-muted-foreground opacity-60">
          © {new Date().getFullYear()} Clearance. All rights reserved.
        </span>
        <nav className="flex gap-6">
          {["Privacy Policy", "Terms of Service", "Security", "Status"].map(
            (item) => (
              <span
                key={item}
                className="cursor-default text-xs text-muted-foreground"
              >
                {item}
              </span>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
