"use client";
import { useState } from "react";
import Avatar from "@/components/ui/Avatar";

/** صورة المعلّم من الباك اند، ولو فشلت أو ما في صورة: الأحرف الأولى. */
export default function TeacherAvatar({ id, name, hasPhoto }: { id: string; name: string; hasPhoto: boolean }) {
  const [failed, setFailed] = useState(false);
  const cleanName = name.replace(/^أ\.?\s*/, "");
  if (!hasPhoto || failed) return <Avatar name={cleanName} size={56} className="bg-navy-800" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/v1/teachers/${id}/photo`}
      alt=""
      width={56}
      height={56}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-full bg-canvas object-cover object-top"
    />
  );
}
