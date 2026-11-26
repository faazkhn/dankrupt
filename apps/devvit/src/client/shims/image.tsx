import type { ImgHTMLAttributes } from "react";

/** Stands in for next/image: Vite imports images as URLs, Next as objects. */
export default function Image({ src, priority: _p, sizes: _s, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string | { src: string }; priority?: boolean }) {
  return <img {...rest} src={typeof src === "string" ? src : src.src} />;
}
