import Image from "next/image";
import banner from "../../public/banner.webp";

/** The Dankrupt Exchange banner, outlined in ink so the white lettering reads on cardboard. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Image
      src={banner}
      alt="Dankrupt Exchange"
      priority
      sizes="(min-width: 768px) 420px, 80vw"
      className={`logo-outline h-auto select-none ${className}`}
    />
  );
}
