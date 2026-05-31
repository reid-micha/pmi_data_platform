import Link from "next/link";

export default function NotFound() {
  return (
    <div className="text-center py-20 space-y-4">
      <p className="text-5xl font-semibold text-ink">404</p>
      <p className="text-ink-muted">
        We couldn&apos;t find that index. Either the slug is wrong or it isn&apos;t the current
        version yet.
      </p>
      <Link href="/" className="inline-block text-accent hover:underline">
        ← back to all indexes
      </Link>
    </div>
  );
}
