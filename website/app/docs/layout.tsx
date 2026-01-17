import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { source } from "@/app/source";
import { FettaLogo } from "../components/fetta-logo";
import Link from "next/link";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: (
          <Link href="/" aria-label="Fetta homepage" title="Fetta homepage">
            <span aria-hidden="true" className="h-6 block">
              <FettaLogo />
            </span>
          </Link>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
