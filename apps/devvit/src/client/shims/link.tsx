import type { AnchorHTMLAttributes } from "react";
import { navigate } from "../router.ts";

/** Stands in for next/link inside the reused web components. */
export default function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
        e.stopPropagation();
        navigate(href);
      }}
    />
  );
}
