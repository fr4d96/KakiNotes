export function PlaceholderPage({
  title,
  icon,
  children,
}: {
  title: string;
  /** Optional mark shown above the title -- only About currently passes one. */
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      {icon ? (
        <div className="mb-5 overflow-hidden rounded-full">{icon}</div>
      ) : null}
      {/* Phone-hidden: every page using this shell is listed in
          lib/navigation/page-titles.ts, so the header shows the title. A new
          caller must be added there too. */}
      <h1 className="text-2xl font-semibold tracking-tight max-md:sr-only sm:text-3xl">
        {title}
      </h1>
      <div className="mt-4 space-y-4 text-foreground/70">{children}</div>
    </div>
  );
}
