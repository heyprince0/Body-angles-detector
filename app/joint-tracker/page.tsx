"use client";

import dynamic from "next/dynamic";

const JointAngleTracker = dynamic(
  () => import("@/components/JointAngleTracker"),
  { ssr: false }
);

export default function Page() {
  return <JointAngleTracker />;
}
